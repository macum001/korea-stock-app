// jp: 공시 분류 테스트 + 재분류 라우트 (개발/검증용, /api/dev)
// jp: POST /api/dev/classify-test  body: { title } 또는 { titles: [...] }
// jp: POST /api/dev/reclassify      기존 공시 전체 재분류 (인증 없이)

import { Router, Request, Response } from 'express';
import { classifyDisclosure } from '../services/disclosure/disclosureClassifier.service';
import { query, isDbReady } from '../config/db';

const router = Router();

// jp: 분류 테스트
router.post('/classify-test', (req: Request, res: Response) => {
  const body = req.body as { title?: string; titles?: string[] };

  if (Array.isArray(body.titles)) {
    const results = body.titles.map((title) => {
      const c = classifyDisclosure(title);
      return {
        title, category: c.category,
        isCapital: c.isCapital, isBad: c.isBad, isGood: c.isGood,
        isImportant: c.isImportant, isCorrection: c.isCorrection,
        matched: c.matchedKeywords,
      };
    });
    return res.json({ success: true, data: results });
  }

  if (body.title) {
    const c = classifyDisclosure(body.title);
    return res.json({
      success: true,
      data: {
        title: body.title, category: c.category,
        isCapital: c.isCapital, isBad: c.isBad, isGood: c.isGood,
        isImportant: c.isImportant, isCorrection: c.isCorrection,
        matched: c.matchedKeywords, normalizedTitle: c.normalizedTitle,
      },
    });
  }

  res.status(400).json({ success: false, error: 'title 또는 titles가 필요해요.' });
});

// jp: 기존 공시 전체 재분류 (새 키워드 규칙 적용)
router.post('/reclassify', async (_req: Request, res: Response) => {
  if (!isDbReady()) {
    return res.status(503).json({ success: false, error: 'DB 미연결' });
  }
  try {
    const rows = await query<{ id: string; report_name: string }>(
      `SELECT id, report_name FROM disclosures`
    );
    let updated = 0;
    for (const row of rows) {
      const c = classifyDisclosure(row.report_name);
      await query(
        `UPDATE disclosures
            SET importance = $2, sentiment = $3,
                positive_score = $4, negative_score = $5, caution_score = $6,
                matched_keywords = $7,
                is_important = $8, is_capital = $9, is_good = $10, is_bad = $11,
                is_correction = $12, normalized_title = $13, category = $14
          WHERE id = $1`,
        [row.id, c.importance, c.sentiment, c.positiveScore, c.negativeScore, c.cautionScore, c.matchedKeywords,
         c.isImportant, c.isCapital, c.isGood, c.isBad, c.isCorrection, c.normalizedTitle, c.category]
      );
      updated++;
    }
    res.json({ success: true, data: { total: rows.length, updated } });
  } catch (err) {
    res.status(500).json({ success: false, error: '재분류 실패: ' + (err instanceof Error ? err.message : '알 수 없는 오류') });
  }
});

export default router;
