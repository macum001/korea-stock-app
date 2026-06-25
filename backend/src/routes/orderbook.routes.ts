// jp: 호가 라우터 (/api/stocks/:code/orderbook)
// jp: 실시간 경로는 Redis 최신 호가/market_snapshot 우선. REST는 초기/복구용 보조만 사용.

import { Router, Request, Response } from 'express';
import { getOrderbook } from '../services/kis/kisRest.service';
import { ApiResponse } from '../types';
import { getMarketStatus } from '../utils/marketTime';
import {
  getLatestOrderbook,
  getMarketSnapshot,
  saveLatestOrderbook,
} from '../services/market/marketSnapshot.service';

export const orderbookRouter = Router({ mergeParams: true });

orderbookRouter.get('/:code/orderbook', async (req: Request, res: Response) => {
  const { code } = req.params;
  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ success: false, error: '올바른 종목 코드가 필요합니다.' } as ApiResponse);
  }

  const marketStatus = getMarketStatus();

  try {
    // jp: 1. 실시간 WS가 저장한 최신 호가 우선 반환
    const latest = await getLatestOrderbook(code);
    if (latest) {
      return res.json({ success: true, data: latest, marketStatus, source: 'redis_latest' } as ApiResponse);
    }

    // jp: 2. 장마감/재시작 후에는 market_snapshot의 마지막 호가 반환. CLOSED는 NO_DATA가 아님.
    const snapshot = await getMarketSnapshot(code);
    if (snapshot?.orderbook) {
      return res.json({
        success: true,
        data: snapshot.orderbook,
        marketStatus,
        snapshotStatus: snapshot.status,
        message: marketStatus === 'CLOSED' ? '종가 기준으로 표시 중입니다.' : undefined,
        source: 'market_snapshot',
      } as ApiResponse);
    }

    // jp: 3. 장중 초기 진입/Redis 비어있을 때만 REST로 1회 보조 조회 후 스냅샷 저장
    if (marketStatus === 'REGULAR_OPEN' || marketStatus === 'AFTER_HOURS') {
      const orderbook = await getOrderbook(code);
      if (orderbook) {
        await saveLatestOrderbook(code, orderbook, marketStatus);
        return res.json({ success: true, data: orderbook, marketStatus, source: 'kis_rest_bootstrap' } as ApiResponse);
      }
    }

    return res.json({ success: true, data: null, marketStatus, stale: true, noData: true } as ApiResponse);
  } catch {
    // jp: 장애 시에도 마지막 snapshot을 한 번 더 시도해서 화면이 비지 않게 함
    const snapshot = await getMarketSnapshot(code).catch(() => null);
    if (snapshot?.orderbook) {
      return res.json({ success: true, data: snapshot.orderbook, marketStatus, stale: true, source: 'market_snapshot' } as ApiResponse);
    }
    res.status(500).json({ success: false, error: '호가 정보를 불러오지 못했습니다.' } as ApiResponse);
  }
});
