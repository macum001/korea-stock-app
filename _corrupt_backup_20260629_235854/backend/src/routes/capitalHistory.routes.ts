// jp: 자본금 변동사항 라우트
// jp: GET /api/capital-history/:receiptNo → corp_code 조회 → DART irdsSttus(연도별) → 반환
// jp: ★ 응답 형식: { success, data } — apiClient.get()이 json.data만 꺼내 반환하므로 맞춰야 함

import { Router, Request, Response } from 'express';
import { query } from '../config/db';
import { getCapitalHistory } from '../services/ai/dartCapitalHistory.service';

const router = Router();

// jp: GET /api/capital-history/:receiptNo
router.get('/:receiptNo', async (req: Request, res: Response) => {
  const { receiptNo } = req.params;

  if (!receiptNo || !/^\d{14}$/.test(receiptNo)) {
    return res.status(400).json({ success: false, error: '잘못된 접수번호 형식입니다.' });
  }

  try {
    const rows = await query<{ corp_code: string | null; stock_name: string | null }>(
      `SELECT corp_code, stock_name FROM disclosures WHERE receipt_no = $1 LIMIT 1`,
      [receiptNo]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, error: '공시를 찾을 수 없습니다.' });
    }

    const corpCode = rows[0].corp_code;
    if (!corpCode) {
      return res.json({ success: true, data: { items: [], corpName: '', corpCode: '' } });
    }

    const result = await getCapitalHistory(corpCode);
    if (!result) {
      return res.json({ success: true, data: { items: [], corpName: '', corpCode } });
    }

    return res.json({
      success: true,
      data: {
        corpCode:  result.corpCode,
        corpName:  result.corpName,
        items:     result.items,
        cached:    result.cached ?? false,
      },
    });
  } catch (err) {
    console.error('[자본금변동] 라우트 오류:', err instanceof Error ? err.message : err);
    return res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
  }
});

export default router;
