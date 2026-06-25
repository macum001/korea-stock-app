// jp: [임시 검증용] DART 원문 추출 테스트 라우트
// jp: GET /api/ai/doc-test/:receiptNo?name=공시제목
// jp: 원문이 실제로 텍스트로 추출되는지 확인용. 검증 후 제거 가능.

import { Router, Request, Response } from 'express';
import { extractDisclosureCore, fetchDartDocumentText } from '../services/ai/dartDocument.service';
import { ApiResponse } from '../types';

const router = Router();

// jp: GET /api/ai/doc-test/:receiptNo?name=...
router.get('/doc-test/:receiptNo', async (req: Request, res: Response) => {
  const { receiptNo } = req.params;
  const name = (req.query.name as string) || '';

  try {
    // jp: 1) 원문 전체 길이 확인
    const raw = await fetchDartDocumentText(receiptNo);
    // jp: 2) 핵심 섹션 추출 결과
    const core = await extractDisclosureCore(receiptNo, name);

    res.json({
      success: true,
      data: {
        receiptNo,
        reportName: name,
        rawLength: raw?.rawLength ?? 0,
        rawPreview: raw?.text?.slice(0, 500) ?? '(원문 없음)',
        extractMode: core.mode,
        extractedText: core.text,
      },
    } as ApiResponse);
  } catch (err) {
    res.json({ success: false, error: err instanceof Error ? err.message : '실패' } as ApiResponse);
  }
});

export default router;
