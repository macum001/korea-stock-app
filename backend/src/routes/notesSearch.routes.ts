// ============================================================
// jp: 주석 의미 검색 라우트 (RAG) — V2 + 표준 응답 계약
// jp: 위치: backend/src/routes/notesSearch.routes.ts
// jp: 모든 결과를 NotesSearchResultStd로 normalize해서 내려준다.
// jp: 프론트는 이 표준 계약만 믿고 렌더링 (내부 필드 추측 금지).
// ============================================================
import { Router, Response } from 'express';
import { z } from 'zod';
import { optionalAuth, AuthedRequest } from '../middleware/requireAuth';
import { listEmbeddedStocks, getLatestReceiptForStock } from '../services/ai/notesEmbedding.service';
import { searchNotesV2 } from '../services/ai/notesSearchV2.service';
import { generateNotesAnswerV2 } from '../services/ai/notesAnswerV2.service';
import { getNotesSectionUrl } from '../services/ai/dartSubDocs.service';
import { normalizeV2Chunk, isValidNotesResult } from '../types/notesSearch';
import { ApiResponse } from '../types';

const router = Router();

const searchSchema = z.object({
  query: z.string().trim().min(1).max(200),
  stockCode: z.string().trim().optional(),
  corpCode: z.string().trim().optional(),
  reportPeriod: z.string().trim().optional(),
  limit: z.number().int().min(1).max(8).optional(),
});

router.post('/search', optionalAuth, async (req: AuthedRequest, res: Response) => {
  const parsed = searchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.json({ success: false, error: '검색어를 입력해주세요.' } as ApiResponse);
  }
  const { query, stockCode, corpCode, reportPeriod, limit } = parsed.data;

  try {
    const v2 = await searchNotesV2(query, { stockCode, corpCode, reportPeriod, limit: limit || 7 });

    // jp: receiptNo별 DART URL 1회 조회 (캐시)
    const urlCache = new Map<string, string | null>();
    const getUrl = async (rcp: string): Promise<string | null> => {
      if (urlCache.has(rcp)) return urlCache.get(rcp)!;
      const u = await getNotesSectionUrl(rcp).catch(() => null);
      urlCache.set(rcp, u);
      return u;
    };

    // jp: ===== normalize — V2 chunk → 표준 타입 =====
    const normalized = await Promise.all(
      v2.chunks.map(async (c) => {
        const dartUrl = await getUrl(c.receiptNo);
        return normalizeV2Chunk(c, dartUrl);
      })
    );

    // jp: null(본문 없는 표 등) + 타입가드 통과만 남김 — 깨진 item은 여기서 제거
    const results = normalized.filter(isValidNotesResult);

    // jp: 결과 0건이면 fallback URL
    let fallbackUrl: string | null = null;
    if (results.length === 0) {
      const latestRcp = await getLatestReceiptForStock({ stockCode, corpCode }).catch(() => null);
      if (latestRcp) fallbackUrl = await getNotesSectionUrl(latestRcp).catch(() => null);
    }

    // jp: AI 답변 (표 포함 근거 → 근거기반)
    let aiAnswer: string | null = null;
    let evidence: unknown[] = [];
    let weak = false;
    if (v2.chunks.length > 0) {
      const ans = await generateNotesAnswerV2(query, v2.chunks).catch(() => null);
      if (ans) { aiAnswer = ans.answer; evidence = ans.evidence; weak = ans.weak; }
    }

    return res.json({
      success: true,
      data: {
        query,
        questionType: v2.questionType,
        count: results.length,
        candidateCount: v2.candidateCount,
        aiAnswer,
        weak,
        evidence,
        results,        // jp: 표준 타입 단일 배열 (prose+table 혼합, kind로 구분)
        fallbackUrl,
      },
    } as ApiResponse);
  } catch (err) {
    console.error('[NotesSearch route] 검색 실패:', err instanceof Error ? err.message : err);
    return res.json({ success: false, error: '검색 중 오류가 발생했어요.' } as ApiResponse);
  }
});

router.get('/stocks', optionalAuth, async (_req: AuthedRequest, res: Response) => {
  try {
    const stocks = await listEmbeddedStocks();
    return res.json({ success: true, data: { count: stocks.length, stocks } } as ApiResponse);
  } catch (err) {
    console.error('[NotesSearch route] 목록 실패:', err instanceof Error ? err.message : err);
    return res.json({ success: false, error: '목록 조회 실패' } as ApiResponse);
  }
});

export default router;
