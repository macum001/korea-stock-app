// jp: 오늘의 AI 예시 질문 API (/api/ai/daily-examples)
// jp: GET → Redis에서 오늘의 예시 5개 반환 (없으면 즉시 생성)

import { Router, Request, Response } from 'express';
import { getDailyExamples } from '../jobs/dailyExamples.job';
import { ApiResponse } from '../types';

const router = Router();

// jp: GET /api/ai/daily-examples
router.get('/daily-examples', async (_req: Request, res: Response) => {
  try {
    const examples = await getDailyExamples();
    res.json({ success: true, data: examples } as ApiResponse);
  } catch (err) {
    console.error('[DailyExamples] API 오류:', err instanceof Error ? err.message : err);
    res.json({ success: true, data: [] } as ApiResponse);
  }
});

export default router;
