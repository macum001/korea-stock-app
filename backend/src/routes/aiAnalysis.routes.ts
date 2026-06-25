// jp: AI 분석 라우트 (/api/ai/*)
// jp: POST /api/ai/disclosure-analysis - 공시 영수증번호 분석
// jp: POST /api/ai/stock-analysis      - 종목 공시+현재가 분석
// jp: GET  /api/ai/stock-analysis/stream - 종목분석 SSE 스트리밍 (신규)
import { Router, Response } from 'express';
import { z } from 'zod';
import { optionalAuth, AuthedRequest } from '../middleware/requireAuth';
import { analyzeByReceiptNo } from '../services/ai/receiptAnalysis.service';
import { analyzeStock } from '../services/ai/stockAnalysis.service';
import { streamStockAnalysis } from '../services/ai/stockAnalysis.stream';
import { saveHistory } from '../repositories/aiHistory.repository';
import { ENV } from '../config/env';
import { ApiResponse } from '../types';

const router = Router();
const DEFAULT_USER = 'default-user';

const receiptSchema = z.object({
  receiptNo: z.string().trim().min(8).max(50),
});
const stockSchema = z.object({
  query: z.string().trim().min(1).max(50),
});

// jp: POST /api/ai/disclosure-analysis
router.post('/disclosure-analysis', optionalAuth, async (req: AuthedRequest, res: Response) => {
  const parsed = receiptSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.json({ success: false, error: '영수증번호를 입력해주세요.' } as ApiResponse);
  }
  const { receiptNo } = parsed.data;
  try {
    const result = await analyzeByReceiptNo(receiptNo);
    if (!result) {
      return res.json({ success: false, error: '공시를 찾을 수 없습니다.' } as ApiResponse);
    }
    const userId = req.userId ?? DEFAULT_USER;
    void saveHistory(userId, {
      kind: 'receipt',
      question: receiptNo,
      receiptNo: result.receiptNo,
      stockCode: result.stockCode,
      stockName: result.stockName,
      answer: result,
      tokens: result.tokens ?? 0,
      model: ENV.AI_DISCLOSURE.MODEL,
    });
    res.json({ success: true, data: result } as ApiResponse);
  } catch (err) {
    console.error('[AI] 공시 분석 실패:', err instanceof Error ? err.message : err);
    res.json({ success: false, error: '분석 중 오류가 발생했어요.' } as ApiResponse);
  }
});

// jp: POST /api/ai/stock-analysis (기존 - 호환성 유지)
router.post('/stock-analysis', optionalAuth, async (req: AuthedRequest, res: Response) => {
  const parsed = stockSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.json({ success: false, error: '종목명 또는 종목코드를 입력해주세요.' } as ApiResponse);
  }
  const { query } = parsed.data;
  try {
    const result = await analyzeStock(query);
    if (!result) {
      return res.json({ success: false, error: '종목을 찾을 수 없어요. 6자리 코드를 포함해주세요.' } as ApiResponse);
    }
    const userId = req.userId ?? DEFAULT_USER;
    void saveHistory(userId, {
      kind: 'stock',
      question: query,
      stockCode: result.stockCode,
      stockName: result.stockName,
      answer: result,
      tokens: result.tokens ?? 0,
      model: ENV.AI_DISCLOSURE.MODEL,
    });
    res.json({ success: true, data: result } as ApiResponse);
  } catch (err) {
    console.error('[AI] 종목 분석 실패:', err instanceof Error ? err.message : err);
    res.json({ success: false, error: '분석 중 오류가 발생했어요.' } as ApiResponse);
  }
});

// jp: GET /api/ai/stock-analysis/stream - SSE 스트리밍 (신규)
// jp: query param: q=종목명또는코드
router.get('/stock-analysis/stream', optionalAuth, async (req: AuthedRequest, res: Response) => {
  const q = String(req.query.q ?? '').trim();
  if (!q) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.write(`event: error\ndata: ${JSON.stringify({ message: '종목명을 입력해주세요.' })}\n\n`);
    res.end();
    return;
  }

  // jp: 멀티턴 - 이전 대화 맥락 (프론트에서 전달)
  const prevContext = String(req.query.context ?? '').trim().slice(0, 2000);

  const userId = req.userId ?? DEFAULT_USER;

  req.on('close', () => {
    console.log('[스트리밍] 클라이언트 연결 종료');
  });

  await streamStockAnalysis(q, res, userId, prevContext);
});

export default router;
