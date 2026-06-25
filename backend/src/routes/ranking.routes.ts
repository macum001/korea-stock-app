// jp: 시장 랭킹 조회 라우트 (/api/ranking/*)
// jp: 스캐너가 Redis에 저장한 랭킹을 그대로 반환 (계산 X, 캐시 읽기만)

import { Router, Request, Response } from 'express';
import { safeGet } from '../config/redis';
import { RANKING_KEYS } from '../services/scanner/marketScanner.service';
import { ApiResponse } from '../types';

const router = Router();

// jp: 키 매핑
const ENDPOINT_MAP: Record<string, string> = {
  'top-gainers': RANKING_KEYS.topGainers,
  'top-losers': RANKING_KEYS.topLosers,
  'top-volume': RANKING_KEYS.topVolume,
  'top-value': RANKING_KEYS.topValue,
  'near-high': RANKING_KEYS.nearHigh,
  'near-low': RANKING_KEYS.nearLow,
};

// jp: GET /api/ranking/:type - 특정 랭킹
router.get('/:type', async (req: Request, res: Response) => {
  const key = ENDPOINT_MAP[req.params.type];
  if (!key) {
    return res.status(400).json({ success: false, error: '없는 랭킹 종류예요.' } as ApiResponse);
  }
  try {
    const cached = await safeGet(key);
    const data = cached ? JSON.parse(cached) : [];
    res.json({ success: true, data } as ApiResponse);
  } catch {
    res.json({ success: true, data: [] } as ApiResponse);
  }
});

// jp: GET /api/ranking - 전체 랭킹 한 번에 (대시보드용)
router.get('/', async (_req: Request, res: Response) => {
  try {
    const [gainers, losers, volume, value, nearHigh, nearLow, updatedAt] = await Promise.all([
      safeGet(RANKING_KEYS.topGainers),
      safeGet(RANKING_KEYS.topLosers),
      safeGet(RANKING_KEYS.topVolume),
      safeGet(RANKING_KEYS.topValue),
      safeGet(RANKING_KEYS.nearHigh),
      safeGet(RANKING_KEYS.nearLow),
      safeGet(RANKING_KEYS.updatedAt),
    ]);

    res.json({
      success: true,
      data: {
        topGainers: gainers ? JSON.parse(gainers) : [],
        topLosers: losers ? JSON.parse(losers) : [],
        topVolume: volume ? JSON.parse(volume) : [],
        topValue: value ? JSON.parse(value) : [],
        nearHigh: nearHigh ? JSON.parse(nearHigh) : [],
        nearLow: nearLow ? JSON.parse(nearLow) : [],
        updatedAt: updatedAt || null,
      },
    } as ApiResponse);
  } catch {
    res.json({ success: true, data: {} } as ApiResponse);
  }
});

export default router;
