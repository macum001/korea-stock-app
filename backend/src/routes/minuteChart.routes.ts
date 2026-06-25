// jp: 분봉 차트 라우터 (/api/stocks/:code/minute-candles)
// jp: 변경: VALID_UNITS에 15/120/240 추가

import { Router, Request, Response } from 'express';
import { getMinuteCandles, aggregateMinuteCandles } from '../services/kis/kisRest.service';
import {
  getMinuteCandlesFromDb,
  saveMinuteCandles,
  getMinuteCandleCount,
  MinuteCandle,
} from '../repositories/minuteCandle.repository';
import { safeGet, safeSetEx } from '../config/redis';
import { getLatestLiveMinuteCandle, mergeLatestLiveCandle } from '../services/chart/liveCandleEngine.service';
import { ApiResponse } from '../types';

export const minuteChartRouter = Router({ mergeParams: true });

// jp: 15/120/240 추가
const VALID_UNITS = [1, 3, 5, 10, 15, 30, 60, 120, 240];

// jp: 종목별 KIS 동시 요청 방지
const fetchingRaw = new Map<string, Promise<MinuteCandle[]>>();

// jp: 1분봉 원본 조회 (DB 우선 → KIS 폴백)
async function getRawMinuteCandles(code: string, limit = 1000): Promise<MinuteCandle[]> {
  const dbCandles = await getMinuteCandlesFromDb(code, limit);
  if (dbCandles.length > 0) {
    void refreshInBackground(code);
    return dbCandles;
  }

  const inflight = fetchingRaw.get(code);
  if (inflight) return inflight;

  const promise = (async () => {
    const oneMin = await getMinuteCandles(code);
    if (oneMin.length > 0) void saveMinuteCandles(code, oneMin);
    return oneMin.slice(-limit);
  })();

  fetchingRaw.set(code, promise);
  try {
    return await promise;
  } finally {
    fetchingRaw.delete(code);
  }
}

// jp: 백그라운드 1분봉 갱신 (60초 throttle)
async function refreshInBackground(code: string): Promise<void> {
  const throttleKey = `chart:minute:refresh:${code}`;
  try {
    const marked = await safeGet(throttleKey);
    if (marked) return;
    await safeSetEx(throttleKey, 60, '1');
  } catch { return; }

  try {
    const fresh = await getMinuteCandles(code);
    if (fresh.length > 0) void saveMinuteCandles(code, fresh);
  } catch { /* 무시 */ }
}

minuteChartRouter.get('/:code/minute-candles', async (req: Request, res: Response) => {
  const { code } = req.params;
  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ success: false, error: '올바른 종목 코드가 필요합니다.' } as ApiResponse);
  }

  const unitParam = parseInt((req.query.unit as string) || '1', 10);
  const unit = VALID_UNITS.includes(unitParam) ? unitParam : 1;
  // jp: 차트는 기본 1000개, UI 요청에 따라 최대 5000개까지. Redis/DB 폭주 방지용 cap.
  const requestedLimit = parseInt((req.query.limit as string) || (unit === 1 ? '1000' : '700'), 10);
  const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 1000, 100), 5000);

  try {
    // jp: 집계 결과 캐시 (30초). 단, live candle이 있으면 캐시보다 최신 tick을 우선한다.
    const aggCacheKey = `chart:minute:agg:${code}:${unit}:${limit}`;
    const live = await getLatestLiveMinuteCandle(code);
    const cachedAgg = await safeGet(aggCacheKey);
    if (!live && cachedAgg) {
      return res.json({ success: true, data: JSON.parse(cachedAgg), fromCache: true } as ApiResponse);
    }

    const oneMinRaw = await getRawMinuteCandles(code, limit);
    const oneMin = mergeLatestLiveCandle(oneMinRaw, live);
    if (oneMin.length === 0) {
      return res.json({ success: true, data: [], stale: true } as ApiResponse);
    }

    // jp: unit=1이면 그대로, 나머지는 자체 1분봉 기반으로 집계
    const aggregated = (unit === 1 ? oneMin : aggregateMinuteCandles(oneMin, unit)).slice(-limit);

    await safeSetEx(aggCacheKey, 30, JSON.stringify(aggregated));
    res.json({ success: true, data: aggregated } as ApiResponse);
  } catch {
    res.status(500).json({ success: false, error: '분봉 차트를 불러오지 못했습니다.' } as ApiResponse);
  }
});

// jp: 분봉 DB 상태 확인 (관리용)
minuteChartRouter.get('/:code/minute-candles-status', async (req: Request, res: Response) => {
  const { code } = req.params;
  const count = await getMinuteCandleCount(code);
  res.json({ success: true, data: { stockCode: code, dbCount: count } } as ApiResponse);
});
