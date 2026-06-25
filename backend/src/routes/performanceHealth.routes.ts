// jp: 서버 health / 실데이터 상태 점검 라우트 (warm-up용)

import { Router, Request, Response } from 'express';
import { ApiResponse } from '../types';
import { isDbReady } from '../config/db';
import { isRedisReady } from '../config/redis';
import { getCircuitStates } from '../services/performance/circuitBreaker.service';
import { getInFlightCount } from '../services/performance/inFlightDedupe.service';
import { ENV } from '../config/env';

const router = Router();

// jp: GET /api/health - 기본 헬스체크 (cron warm-up용)
router.get('/health', (_req: Request, res: Response) => {
  res.json({ success: true, data: { status: 'ok', time: new Date().toISOString() } } as ApiResponse);
});

export default router;

// jp: 관리자 헬스 (실데이터 연결 상태)
export const adminHealthRouter = Router();

adminHealthRouter.get('/health/real-data', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      db: isDbReady(),
      redis: isRedisReady(),
      useMockData: ENV.USE_MOCK_DATA,
      useMockDisclosure: ENV.USE_MOCK_DISCLOSURE,
      circuits: getCircuitStates(),
      inFlightRequests: getInFlightCount(),
      time: new Date().toISOString(),
    },
  } as ApiResponse);
});
