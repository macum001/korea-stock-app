// jp: 지수 API - 국내(KIS) + 해외(Yahoo) 병합. Redis 캐시.
// jp: + 시황 브리핑 (회원/비회원 차등 노출)

import { Router, Request, Response } from 'express';
import { ApiResponse } from '../types';
import { getMarketIndices } from '../services/kis/kisRest.service';
import { getGlobalIndices, getGlobalIndexHistory } from '../services/kis/globalIndex.service';
import { getDomesticIndexHistory } from '../services/kis/domesticIndex.service';
import { safeGet, safeSetEx } from '../config/redis';
import { withCircuitBreaker } from '../services/performance/circuitBreaker.service';
import { logPerf, startTimer } from '../services/performance/performanceLogger.service';
import { runBriefingCollection, getLatestBriefingForApi, formatRawDataForDisplay } from '../services/briefing/briefingCollector.service';
import { runBriefingAI } from '../services/briefing/briefingAI.service';
import { getRecentBriefings, getBriefingsByDate, getBriefingByDateSlot, MarketBriefing } from '../repositories/briefing.repository';
import { optionalAuth, AuthedRequest } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireAdmin';
import { notifyBriefing } from '../services/briefing/briefingNotify.service';
import { computeAllStats, getStatVisibility, getRelevantStats } from '../services/briefing/briefingStats.service';
import { getMarketStatus, getKstParts } from '../utils/marketTime';
import { finalizeMarketSnapshot, getMarketSnapshot, getMarketRealtimeCacheStats, getRecentMarketEvents } from '../services/market/marketSnapshot.service';
import { marketEventBus } from '../services/realtime/marketEventBus.service';
import { kisOrderbookWs } from '../services/kis/kisOrderbookWs.service';
import { socketServer } from '../services/realtime/socketServer.service';
import { getRedisStreamRecoveryStats } from '../services/realtime/redisStreamRecovery.service';

const router = Router();
const CACHE_KEY = 'market:indices';
const TTL = 30;
const DOMESTIC_INDEX_CODES = new Set(['0001', '1001']);

// jp: GET /api/market/status - 프론트가 CLOSED와 NO_DATA를 분리해서 표시하도록 장 상태 제공
router.get('/status', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      status: getMarketStatus(),
      kst: getKstParts(),
      message: getMarketStatus() === 'CLOSED' ? '종가 기준으로 표시 중입니다.' : undefined,
    },
  } as ApiResponse);
});


// jp: GET /api/market/realtime-stats - 운영용 실시간 코어 상태 확인
router.get('/realtime-stats', requireAdmin, async (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      marketStatus: getMarketStatus(),
      kst: getKstParts(),
      kisSubscriptions: kisOrderbookWs.getStatus(),
      eventBus: marketEventBus.getStats(),
      websocketFanout: await socketServer.getRealtimeFanoutStats(),
      redisCache: await getMarketRealtimeCacheStats(),
      redisStreamRecovery: await getRedisStreamRecoveryStats(),
    },
  } as ApiResponse);
});

// jp: GET /api/market/replay/:code - WS 재접속/장애 분석용 Redis Stream replay
router.get('/replay/:code', requireAdmin, async (req: Request, res: Response) => {
  const code = String(req.params.code || '').trim();
  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ success: false, error: '올바른 종목 코드가 필요합니다.' } as ApiResponse);
  }
  const limit = Math.min(Math.max(parseInt(String(req.query.limit || '300'), 10) || 300, 1), 5000);
  const events = await getRecentMarketEvents(code, limit);
  res.json({ success: true, data: events } as ApiResponse);
});

// jp: POST /api/market/snapshot/:code/finalize - 운영/테스트용: 특정 종목 snapshot 강제 확정
router.post('/snapshot/:code/finalize', requireAdmin, async (req: Request, res: Response) => {
  const code = String(req.params.code || '').trim();
  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ success: false, error: '올바른 종목 코드가 필요합니다.' } as ApiResponse);
  }
  const snapshot = await finalizeMarketSnapshot(code, String(req.body?.status || getMarketStatus()));
  res.json({ success: true, data: snapshot } as ApiResponse);
});

// jp: GET /api/market/snapshot/:code - 장마감/장애 복구 데이터 확인용
router.get('/snapshot/:code', async (req: Request, res: Response) => {
  const code = String(req.params.code || '').trim();
  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ success: false, error: '올바른 종목 코드가 필요합니다.' } as ApiResponse);
  }
  const snapshot = await getMarketSnapshot(code);
  res.json({ success: true, data: snapshot } as ApiResponse);
});

// jp: 비회원용 - 브리핑에서 요약/상태/시간만 남기고 나머지 제거
function toGuestBriefing(b: MarketBriefing): Partial<MarketBriefing> & { locked: boolean } {
  return {
    id: b.id,
    date: b.date,
    slot: b.slot,
    summary: b.summary,
    status: b.status,
    // jp: analysis(왜/한국영향/조심할점), raw_data(26개 지수) 제거
    analysis: b.analysis ? ({ status: (b.analysis as Record<string, unknown>).status } as MarketBriefing['analysis']) : null,
    raw_data: undefined as unknown as MarketBriefing['raw_data'],
    locked: true,  // jp: 프론트가 잠금 화면 표시할 플래그
  };
}

// jp: GET /api/market/indices
router.get('/indices', async (_req: Request, res: Response) => {
  const done = startTimer();
  try {
    const cached = await safeGet(CACHE_KEY);
    if (cached) {
      logPerf({ api: 'marketIndices', cache: 'hit', totalMs: done() });
      return res.json({ success: true, data: JSON.parse(cached), stale: false } as ApiResponse);
    }
    const [domestic, global] = await Promise.all([
      withCircuitBreaker('KIS_MARKET_INDEX', () => getMarketIndices()).catch(() => []),
      getGlobalIndices().catch(() => []),
    ]);
    const all = [...(domestic || []), ...(global || [])];
    if (all.length > 0) {
      await safeSetEx(CACHE_KEY, TTL, JSON.stringify(all));
      logPerf({ api: 'marketIndices', cache: 'miss', totalMs: done() });
      return res.json({ success: true, data: all, stale: false } as ApiResponse);
    }
    logPerf({ api: 'marketIndices', totalMs: done(), stale: true });
    res.json({ success: true, data: [], stale: true, staleReason: 'NO_REAL_DATA' } as ApiResponse);
  } catch {
    res.json({ success: true, data: [], stale: true, staleReason: 'API_ERROR' } as ApiResponse);
  }
});

// jp: GET /api/market/index-history
const HISTORY_TTL = 6 * 60 * 60;
router.get('/index-history', async (req: Request, res: Response) => {
  const code = String(req.query.code || '').trim();
  const range = String(req.query.range || '10y').trim();
  if (!code) {
    return res.status(400).json({ success: false, error: 'code가 필요해요' } as ApiResponse);
  }
  const cacheKey = `market:index-history:${code}:${range}`;
  try {
    const cached = await safeGet(cacheKey);
    if (cached) {
      return res.json({ success: true, data: JSON.parse(cached) } as ApiResponse);
    }
    const history = DOMESTIC_INDEX_CODES.has(code)
      ? await getDomesticIndexHistory(code).catch(() => [])
      : await getGlobalIndexHistory(code, range).catch(() => []);
    if (history.length > 0) {
      await safeSetEx(cacheKey, HISTORY_TTL, JSON.stringify(history));
    }
    res.json({ success: true, data: history } as ApiResponse);
  } catch {
    res.json({ success: true, data: [] } as ApiResponse);
  }
});

// jp: [테스트] 데이터 수집만
router.get('/briefing-collect-test', async (_req: Request, res: Response) => {
  try {
    const result = await runBriefingCollection();
    if (!result.success || !result.briefing) {
      return res.status(500).json({ success: false, message: result.message });
    }
    const formatted = formatRawDataForDisplay(result.briefing);
    return res.json({
      success: true,
      message: result.message,
      briefingId: result.briefing.id,
      date: result.briefing.date,
      slot: result.briefing.slot,
      status: result.briefing.status,
      fetchedCount: result.briefing.raw_data?.fetchedCount,
      totalCount: result.briefing.raw_data?.totalCount,
      displayText: formatted,
      rawData: result.briefing.raw_data,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, message: msg });
  }
});

// jp: [테스트] 최신 미완료 brief AI 분석
router.get('/briefing-ai-test', async (_req: Request, res: Response) => {
  try {
    const { briefing } = await getLatestBriefingForApi();
    if (!briefing) {
      return res.status(404).json({ success: false, message: '수집된 브리핑이 없어요.' });
    }
    if (briefing.status === 'completed') {
      return res.json({ success: true, message: '이미 완료', analysis: briefing.analysis });
    }
    const result = await runBriefingAI(briefing);
    if (!result.success) {
      return res.status(500).json({ success: false, message: result.message });
    }
    return res.json({ success: true, message: result.message, analysis: result.analysis });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, message: msg });
  }
});

// jp: [테스트] 특정 slot AI 분석
router.get('/briefing-ai-slot', async (req: Request, res: Response) => {
  try {
    const date = String(req.query.date || '').trim();
    const slot = String(req.query.slot || '').trim();
    if (!date || !slot) {
      return res.status(400).json({ success: false, message: 'date와 slot이 필요해요' });
    }
    const briefing = await getBriefingByDateSlot(date, slot);
    if (!briefing) {
      return res.status(404).json({ success: false, message: '해당 브리핑이 없어요' });
    }
    if (briefing.status === 'completed') {
      return res.json({ success: true, message: '이미 완료', analysis: briefing.analysis });
    }
    const result = await runBriefingAI(briefing);
    if (!result.success) {
      return res.status(500).json({ success: false, message: result.message });
    }
    return res.json({ success: true, message: result.message, analysis: result.analysis });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, message: msg });
  }
});

// jp: GET /api/market/briefing - 최신 브리핑 (회원=전체, 비회원=요약만)
router.get('/briefing', optionalAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const result = await getLatestBriefingForApi();
    if (!result.briefing) {
      return res.json({ success: true, data: null });
    }
    // jp: 비회원이면 잘라서 전송
    if (!req.userId) {
      return res.json({ success: true, data: toGuestBriefing(result.briefing) });
    }
    // jp: 회원 - 전체 + 현재 브리핑에 관련된 통계 (C방식)
    const relevantStats = await getRelevantStats(result.briefing.raw_data);
    return res.json({ success: true, data: { ...result.briefing, relevantStats } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, message: msg });
  }
});

// jp: GET /api/market/briefing-history - 회원만. 비회원은 빈 배열 + locked
router.get('/briefing-history', optionalAuth, async (req: AuthedRequest, res: Response) => {
  try {
    // jp: 비회원은 히스토리 통째로 잠금
    if (!req.userId) {
      return res.json({ success: true, data: [], locked: true });
    }
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '30'), 10) || 30, 1), 100);
    const all = await getRecentBriefings(limit);
    const completed = all.filter(b => b.status === 'completed');
    return res.json({ success: true, data: completed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, message: msg });
  }
});

// jp: GET /api/market/briefing-by-date - 회원만
router.get('/briefing-by-date', optionalAuth, async (req: AuthedRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.json({ success: true, data: [], locked: true });
    }
    const date = String(req.query.date || '').trim();
    if (!date) {
      return res.status(400).json({ success: false, message: 'date가 필요해요 (YYYY-MM-DD)' });
    }
    const list = await getBriefingsByDate(date);
    const completed = list.filter(b => b.status === 'completed');
    return res.json({ success: true, data: completed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, message: msg });
  }
});

// jp: [테스트] 특정 slot 브리핑 알림 강제 발송
router.get('/briefing-notify-test', async (req: Request, res: Response) => {
  try {
    const date = String(req.query.date || '').trim();
    const slot = String(req.query.slot || '').trim();
    if (!date || !slot) {
      return res.status(400).json({ success: false, message: 'date와 slot이 필요해요' });
    }
    const briefing = await getBriefingByDateSlot(date, slot);
    if (!briefing) {
      return res.status(404).json({ success: false, message: '해당 브리핑이 없어요' });
    }
    await notifyBriefing(briefing);
    return res.json({
      success: true,
      message: '알림 발송 시도 완료 (로그 확인)',
      slot: briefing.slot,
      isImportant: (briefing.analysis as Record<string, unknown> | null)?.is_important ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, message: msg });
  }
});

// jp: GET /api/market/briefing-stats - 사용자용. 관리자가 노출 ON한 통계만.
router.get('/briefing-stats', async (_req: Request, res: Response) => {
  try {
    const [stats, visibility] = await Promise.all([
      computeAllStats(),
      getStatVisibility(),
    ]);
    // jp: 노출 ON + 표본 충분한 것만 사용자에게
    const visible = stats
      .filter(s => visibility[s.key] === true)
      .map(s => ({
        key: s.key,
        label: s.label,
        desc: s.desc,
        values: s.values,
        hitInfo: s.hitInfo,
      }));
    res.json({ success: true, data: visible });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, message: msg });
  }
});

export default router;
