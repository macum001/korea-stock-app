// jp: 발견 화면 API - 실제 KIS 시세 + DB 공시 기반 계산
// jp: USE_MOCK_DATA=true 또는 KIS 미응답 시 프론트가 mock fallback

import { Router, Request, Response } from 'express';
import { ApiResponse } from '../types';
import { getVolumeRank, getFluctuationRank } from '../services/kis/kisRest.service';
import { getImportantDisclosures } from '../repositories/disclosure.repository';
import { computeThemes } from '../services/discovery/themeDiscovery.service';
import { safeGet } from '../config/redis';
import { DISCOVERY_KEYS } from '../services/discovery/discoverySummary.service';
import { logPerf, startTimer } from '../services/performance/performanceLogger.service';
import { isDbReady } from '../config/db';
import { ENV } from '../config/env';

const router = Router();


// jp: 전체 발견 데이터 한 번에
router.get('/', async (_req: Request, res: Response) => {
  // jp: mock 모드면 프론트가 알아서 mock 쓰도록 503
  if (ENV.USE_MOCK_DATA) {
    return res.status(503).json({ success: false, error: 'mock 모드' } as ApiResponse);
  }

  try {
    // jp: ===== 1. 오늘의 급등 = 등락률 순위 API (전 종목) =====
    // jp: 명세: 등락률 +10% 이상, 최대 20개 (10개면 10개만 자연히 노출)
    let gainers: unknown[] = [];
    try {
      const fluctuation = await getFluctuationRank(40);
      gainers = fluctuation
        .filter(s => s.changeRate >= 10)   // jp: 명세 +10% 이상
        .slice(0, 10)                       // jp: 최대 10개
        .map(s => ({
          code: s.code, name: s.name, price: s.price,
          changeRate: s.changeRate, volume: s.volume,
          // jp: 등급 분류 (명세)
          grade: s.changeRate >= 29.5 ? '상한가' : s.changeRate >= 20 ? '초강세' : s.changeRate >= 10 ? '급등' : '강세',
          reason: `등락률 +${s.changeRate.toFixed(1)}% (등락률 순위 ${s.rank}위)`,
        }));
    } catch (e) {
      console.warn('[발견] 등락률순위 실패 (모의투자 미지원 가능):', e instanceof Error ? e.message : e);
    }

    // jp: ===== 4. 장중 특징주 = 거래량 300% 급증 (거래량 순위 API) =====
    // jp: 명세: 거래량 증가율(vol_inrt) 300% 이상
    let volumeSpikes: unknown[] = [];
    try {
      const volumeRank = await getVolumeRank(40);
      volumeSpikes = volumeRank
        .filter(s => s.volumeIncreaseRate >= 300)  // jp: 거래량 증가율 300%↑
        .slice(0, 20)
        .map(s => ({
          code: s.code, name: s.name, price: s.price,
          changeRate: s.changeRate, volume: s.volume,
          tradingValue: s.tradingValue,
          volumeIncreaseRate: s.volumeIncreaseRate,
          reason: `거래량 ${Math.round(s.volumeIncreaseRate)}% 급증 (거래대금 ${(s.tradingValue / 1e8).toFixed(0)}억)`,
        }));
    } catch (e) {
      console.warn('[발견] 거래량순위 실패 (모의투자 미지원 가능):', e instanceof Error ? e.message : e);
    }

    // jp: ===== 3. 오늘의 주요공시 = 중요 + 호재 10개 =====
    let disclosures: unknown[] = [];
    if (isDbReady()) {
      try {
        const important = await getImportantDisclosures(50);
        // jp: 호재(positive)만 필터 → 10개
        disclosures = (important as { sentiment?: string }[])
          .filter(d => d.sentiment === 'positive')
          .slice(0, 10);
      } catch { /* skip */ }
    }

    // jp: ===== 2. 테마별 종목 = 매핑 테이블 기반 (평균상승률/대장주/상승비율) =====
    let themes: unknown[] = [];
    try {
      themes = await computeThemes();
    } catch (e) {
      console.warn('[발견] 테마 계산 실패:', e instanceof Error ? e.message : e);
    }

    res.json({ success: true, data: { gainers, volumeSpikes, themes, disclosures } } as ApiResponse);
  } catch {
    res.status(500).json({ success: false, error: '발견 데이터 조회 실패' } as ApiResponse);
  }
});

// jp: Redis 사전계산 결과를 읽어 반환하는 헬퍼 (없으면 stale 빈 데이터)
async function serveFromPrecompute(res: Response, key: string, api: string) {
  const done = startTimer();
  try {
    const cached = await safeGet(key);
    if (cached) {
      logPerf({ api, cache: 'hit', totalMs: done() });
      return res.json({ success: true, data: JSON.parse(cached), stale: false } as ApiResponse);
    }
    // jp: 사전계산 전이면 빈 데이터 + stale (가짜 데이터 금지)
    logPerf({ api, cache: 'miss', totalMs: done(), stale: true });
    res.json({ success: true, data: null, stale: true, staleReason: 'NOT_COMPUTED' } as ApiResponse);
  } catch {
    res.json({ success: true, data: null, stale: true, staleReason: 'REDIS_ERROR' } as ApiResponse);
  }
}

// jp: GET /api/discovery/summary - 사전 계산된 발견 요약
router.get('/summary', (_req, res) => serveFromPrecompute(res, DISCOVERY_KEYS.summary, 'discoverySummary'));
router.get('/top-gainers', (_req, res) => serveFromPrecompute(res, DISCOVERY_KEYS.summary, 'topGainers'));
router.get('/top-losers', (_req, res) => serveFromPrecompute(res, DISCOVERY_KEYS.summary, 'topLosers'));
router.get('/volume-spikes', (_req, res) => serveFromPrecompute(res, DISCOVERY_KEYS.volumeSpikes, 'volumeSpikes'));
router.get('/themes', (_req, res) => serveFromPrecompute(res, DISCOVERY_KEYS.themes, 'themes'));
router.get('/today-disclosures', (_req, res) => serveFromPrecompute(res, DISCOVERY_KEYS.todayDisclosures, 'todayDisclosures'));

export default router;
