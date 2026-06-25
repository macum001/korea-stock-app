// jp: Bootstrap API - 첫 화면 데이터 한 번에

import { Router, Response } from 'express';
import { ApiResponse } from '../types';
import { getBootstrapData } from '../services/bootstrap/bootstrap.service';
import { logPerf, startTimer } from '../services/performance/performanceLogger.service';
import { optionalAuth, AuthedRequest } from '../middleware/requireAuth';

const router = Router();

// jp: GET /api/bootstrap - 로그인했으면 본인 데이터, 아니면 게스트(공개 데이터만)
router.get('/', optionalAuth, async (req: AuthedRequest, res: Response) => {
  const done = startTimer();
  try {
    const data = await getBootstrapData(req.userId || 'default');
    logPerf({ api: 'bootstrap', totalMs: done(), stale: data.stale });
    res.json({ success: true, data } as ApiResponse);
  } catch {
    // jp: 실패해도 빈 구조 반환 (500 금지)
    logPerf({ api: 'bootstrap', totalMs: done(), stale: true, fallback: true });
    res.json({
      success: true,
      data: {
        marketIndices: [], watchlistSummary: { groupCount: 0, itemCount: 0, groups: [] },
        importantDisclosures: [], featuredStocks: [], discoverySummary: null,
        unreadNotificationCount: 0, stale: true, updatedAt: new Date().toISOString(),
      },
    } as ApiResponse);
  }
});

export default router;
