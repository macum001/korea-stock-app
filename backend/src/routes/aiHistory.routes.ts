// jp: AI 분석 히스토리 라우트 (/api/ai/history)
// jp: optionalAuth - 로그인 있으면 userId, 없으면 default-user
// jp: GET 목록 / DELETE 개별 / DELETE 전체

import { Router, Response } from 'express';
import { optionalAuth, AuthedRequest } from '../middleware/requireAuth';
import { listHistory, deleteHistory, clearHistory } from '../repositories/aiHistory.repository';
import { ApiResponse } from '../types';

const router = Router();

const DEFAULT_USER = 'default-user';
function uid(req: AuthedRequest): string {
  return req.userId ?? DEFAULT_USER;
}

// jp: GET /api/ai/history - 목록 (최근 30, 90일 이내)
router.get('/history', optionalAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const rows = await listHistory(uid(req));
    // jp: DB row → 프론트 형식
    const data = rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      question: r.question,
      receiptNo: r.receipt_no,
      stockCode: r.stock_code,
      stockName: r.stock_name,
      answer: r.answer,
      createdAt: r.created_at,
    }));
    res.json({ success: true, data } as ApiResponse);
  } catch (err) {
    console.error('[AI히스토리] 목록 실패:', err instanceof Error ? err.message : err);
    res.json({ success: true, data: [] } as ApiResponse);
  }
});

// jp: DELETE /api/ai/history/:id - 개별 삭제
router.delete('/history/:id', optionalAuth, async (req: AuthedRequest, res: Response) => {
  try {
    await deleteHistory(uid(req), req.params.id);
    res.json({ success: true } as ApiResponse);
  } catch (err) {
    console.error('[AI히스토리] 삭제 실패:', err instanceof Error ? err.message : err);
    res.status(500).json({ success: false, error: '삭제에 실패했어요.' } as ApiResponse);
  }
});

// jp: DELETE /api/ai/history - 전체 삭제
router.delete('/history', optionalAuth, async (req: AuthedRequest, res: Response) => {
  try {
    await clearHistory(uid(req));
    res.json({ success: true } as ApiResponse);
  } catch (err) {
    console.error('[AI히스토리] 전체삭제 실패:', err instanceof Error ? err.message : err);
    res.status(500).json({ success: false, error: '전체 삭제에 실패했어요.' } as ApiResponse);
  }
});

export default router;
