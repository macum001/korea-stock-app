// jp: AI 토큰 사용량 통계 API (/api/admin/token-stats)
// jp: 공시 분석 토큰 + 시황 브리핑 토큰 합산
// jp: requireAdmin으로 보호 (app.ts에서 적용)

import { Router, Response } from 'express';
import { query } from '../../config/db';
import { AdminRequest } from '../../middleware/requireAdmin';
import { ApiResponse } from '../../types';

const router = Router();

// jp: GET /api/admin/token-stats - 토큰 사용량 종합
router.get('/', async (_req: AdminRequest, res: Response) => {
  try {
    // jp: 1) 공시 분석 토큰 (누적)
    const discTotal = await query<{
      cnt: string; total_tokens: string | null; prompt: string | null; completion: string | null;
    }>(
      `SELECT COUNT(*)::text AS cnt,
              COALESCE(SUM(ai_total_tokens), 0)::text AS total_tokens,
              COALESCE(SUM(ai_prompt_tokens), 0)::text AS prompt,
              COALESCE(SUM(ai_completion_tokens), 0)::text AS completion
         FROM disclosures
        WHERE ai_analyzed_at IS NOT NULL AND ai_total_tokens IS NOT NULL`
    );

    // jp: 2) 공시 분석 토큰 (오늘, KST)
    const discToday = await query<{ cnt: string; total_tokens: string | null }>(
      `SELECT COUNT(*)::text AS cnt,
              COALESCE(SUM(ai_total_tokens), 0)::text AS total_tokens
         FROM disclosures
        WHERE ai_total_tokens IS NOT NULL
          AND DATE(ai_analyzed_at AT TIME ZONE 'Asia/Seoul') = DATE(now() AT TIME ZONE 'Asia/Seoul')`
    );

    // jp: 3) 시황 브리핑 토큰 (누적 + 오늘)
    const brfTotal = await query<{ cnt: string; total_tokens: string | null }>(
      `SELECT COUNT(*)::text AS cnt,
              COALESCE(SUM(ai_tokens), 0)::text AS total_tokens
         FROM market_briefings
        WHERE ai_tokens IS NOT NULL AND ai_tokens > 0`
    );
    const brfToday = await query<{ cnt: string; total_tokens: string | null }>(
      `SELECT COUNT(*)::text AS cnt,
              COALESCE(SUM(ai_tokens), 0)::text AS total_tokens
         FROM market_briefings
        WHERE ai_tokens IS NOT NULL AND ai_tokens > 0
          AND date = DATE(now() AT TIME ZONE 'Asia/Seoul')`
    );

    // jp: 4) 종목 분석 토큰 (ai_analysis_history, kind=stock만 - 공시는 disclosures에서 잡으므로 중복 방지)
    const stkTotal = await query<{ cnt: string; total_tokens: string | null }>(
      `SELECT COUNT(*)::text AS cnt,
              COALESCE(SUM(ai_tokens), 0)::text AS total_tokens
         FROM ai_analysis_history
        WHERE kind = 'stock' AND ai_tokens IS NOT NULL AND ai_tokens > 0`
    );
    const stkToday = await query<{ cnt: string; total_tokens: string | null }>(
      `SELECT COUNT(*)::text AS cnt,
              COALESCE(SUM(ai_tokens), 0)::text AS total_tokens
         FROM ai_analysis_history
        WHERE kind = 'stock' AND ai_tokens IS NOT NULL AND ai_tokens > 0
          AND DATE(created_at AT TIME ZONE 'Asia/Seoul') = DATE(now() AT TIME ZONE 'Asia/Seoul')`
    );

    const n = (v: string | null | undefined) => parseInt(v || '0');

    // jp: 공시 비용 (claude 가격: input $3/MTok, output $15/MTok)
    const discPrompt = n(discTotal[0]?.prompt);
    const discCompletion = n(discTotal[0]?.completion);
    const discCostUsd = (discPrompt / 1000000 * 3) + (discCompletion / 1000000 * 15);

    const discTotalTokens = n(discTotal[0]?.total_tokens);
    const brfTotalTokens = n(brfTotal[0]?.total_tokens);
    const discTodayTokens = n(discToday[0]?.total_tokens);
    const brfTodayTokens = n(brfToday[0]?.total_tokens);
    const stkTotalTokens = n(stkTotal[0]?.total_tokens);
    const stkTodayTokens = n(stkToday[0]?.total_tokens);

    res.json({
      success: true,
      data: {
        // 합산 (공시 + 브리핑 + 종목)
        totalTokens: discTotalTokens + brfTotalTokens + stkTotalTokens,
        todayTokens: discTodayTokens + brfTodayTokens + stkTodayTokens,
        estimatedCostUsd: Number(discCostUsd.toFixed(2)),
        // 공시 분석
        disclosure: {
          totalTokens: discTotalTokens,
          todayTokens: discTodayTokens,
          totalCount: n(discTotal[0]?.cnt),
          todayCount: n(discToday[0]?.cnt),
        },
        // 시황 브리핑
        briefing: {
          totalTokens: brfTotalTokens,
          todayTokens: brfTodayTokens,
          totalCount: n(brfTotal[0]?.cnt),
          todayCount: n(brfToday[0]?.cnt),
        },
        // 종목 분석
        stock: {
          totalTokens: stkTotalTokens,
          todayTokens: stkTodayTokens,
          totalCount: n(stkTotal[0]?.cnt),
          todayCount: n(stkToday[0]?.cnt),
        },
      },
    } as ApiResponse);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[토큰통계] 조회 실패:', msg);
    res.status(500).json({ success: false, error: msg } as ApiResponse);
  }
});

// jp: GET /api/admin/token-stats/daily - 날짜별 공시 토큰 (최근 14일)
router.get('/daily', async (_req: AdminRequest, res: Response) => {
  try {
    const rows = await query<{
      stat_date: string; requests: string; total_tokens: string; estimated_cost_usd: string;
    }>(
      `SELECT stat_date::text AS stat_date,
              SUM(requests)::text AS requests,
              SUM(total_tokens)::text AS total_tokens,
              SUM(estimated_cost_usd)::text AS estimated_cost_usd
         FROM v_ai_token_daily
        GROUP BY stat_date
        ORDER BY stat_date DESC
        LIMIT 14`
    );
    res.json({ success: true, data: rows } as ApiResponse);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg } as ApiResponse);
  }
});

export default router;
