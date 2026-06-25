// jp: 체결목록 라우터 (/api/stocks/:code/trades)
// jp: 화면 기본 300개, Redis 서버 캐시 1000개. REST는 초기/복구용 보조만 사용.

import { Router, Request, Response } from 'express';
import { getTradeTicks } from '../services/kis/kisRest.service';
import { ApiResponse } from '../types';
import { getMarketStatus } from '../utils/marketTime';
import {
  getRecentTrades,
  getMarketSnapshot,
  replaceRecentTrades,
} from '../services/market/marketSnapshot.service';

export const tradesRouter = Router({ mergeParams: true });

function parseLimit(value: unknown): number {
  const n = Number(value ?? 300);
  if (!Number.isFinite(n)) return 300;
  return Math.min(Math.max(Math.floor(n), 1), 1000);
}

tradesRouter.get('/:code/trades', async (req: Request, res: Response) => {
  const { code } = req.params;
  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ success: false, error: '올바른 종목 코드가 필요합니다.' } as ApiResponse);
  }

  const limit = parseLimit(req.query.limit);
  const marketStatus = getMarketStatus();

  try {
    // jp: 1. WS가 append한 최근 체결 캐시 우선
    const cached = await getRecentTrades(code, limit);
    if (cached.length > 0) {
      return res.json({ success: true, data: cached, marketStatus, source: 'redis_recent' } as ApiResponse);
    }

    // jp: 2. 장마감/재시작 후 snapshot 보존 데이터 반환. CLOSED는 NO_DATA가 아님.
    const snapshot = await getMarketSnapshot(code);
    if (snapshot?.trades?.length) {
      return res.json({
        success: true,
        data: snapshot.trades.slice(0, limit),
        marketStatus,
        snapshotStatus: snapshot.status,
        message: marketStatus === 'CLOSED' ? '종가 기준으로 표시 중입니다.' : undefined,
        source: 'market_snapshot',
      } as ApiResponse);
    }

    // jp: 3. 장중 초기 진입/Redis 비어있을 때만 REST 1회 보조 조회 후 최근 체결 캐시 저장
    if (marketStatus === 'REGULAR_OPEN' || marketStatus === 'AFTER_HOURS') {
      const ticks = await getTradeTicks(code);
      if (ticks.length > 0) {
        await replaceRecentTrades(code, ticks, marketStatus);
        return res.json({ success: true, data: ticks.slice(0, limit), marketStatus, source: 'kis_rest_bootstrap' } as ApiResponse);
      }
    }

    return res.json({ success: true, data: [], marketStatus, stale: true, noData: true } as ApiResponse);
  } catch {
    const snapshot = await getMarketSnapshot(code).catch(() => null);
    if (snapshot?.trades?.length) {
      return res.json({ success: true, data: snapshot.trades.slice(0, limit), marketStatus, stale: true, source: 'market_snapshot' } as ApiResponse);
    }
    res.json({ success: true, data: [], marketStatus, stale: true } as ApiResponse);
  }
});
