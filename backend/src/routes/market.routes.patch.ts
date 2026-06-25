// jp: market.routes.ts 추가 라우터 (기존 파일 끝에 붙이는 용도)
// jp: 수정: Router, Request, Response 선언 추가 → 독립 컴파일 가능

import { Router, Request, Response } from 'express';
import {
  runBriefingCollection,
  getLatestBriefingForApi,
  formatRawDataForDisplay,
} from '../services/briefing/briefingCollector.service';

const router = Router();

// ─────────────────────────────────────────
// GET /api/market/briefing-collect-test
// 실제 수집 및 DB 저장 결과 반환 (개발용)
// ─────────────────────────────────────────
router.get('/briefing-collect-test', async (_req: Request, res: Response) => {
  try {
    console.log('[Test] 브리핑 수집 테스트 시작');
    const result = await runBriefingCollection();

    if (!result.success || !result.briefing) {
      return res.status(500).json({
        success: false,
        message: result.message,
      });
    }

    const formatted = formatRawDataForDisplay(result.briefing);
    return res.json({
      success:      true,
      message:      result.message,
      briefingId:   result.briefing.id,
      date:         result.briefing.date,
      status:       result.briefing.status,
      fetchedCount: (result.briefing.raw_data as { fetchedCount?: number } | undefined)?.fetchedCount,
      totalCount:   (result.briefing.raw_data as { totalCount?: number } | undefined)?.totalCount,
      displayText:  formatted,
      rawData:      result.briefing.raw_data,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, message: msg });
  }
});

// ─────────────────────────────────────────
// GET /api/market/briefing
// 최신 브리핑 조회 (클라이언트용)
// ─────────────────────────────────────────
router.get('/briefing', async (_req: Request, res: Response) => {
  try {
    const result = await getLatestBriefingForApi();
    return res.json({
      success:     true,
      data:        result.briefing,
      isToday:     result.isToday,
      todayStatus: result.todayStatus,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, message: msg });
  }
});

export default router;
