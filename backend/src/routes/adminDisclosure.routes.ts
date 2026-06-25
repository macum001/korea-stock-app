// jp: 관리자용 공시 라우트
// jp: TODO: 나중에 관리자 인증 미들웨어 추가 필요

import { Router, Request, Response } from 'express';
import { syncDartCompanies } from '../services/disclosure/dartCompany.service';
import { syncLatestDisclosures, syncDisclosuresByStockCode } from '../services/disclosure/disclosureSync.service';
import { invalidateDisclosureCaches } from '../services/disclosure/disclosureCache.service';
import { checkDartApiHealth } from '../services/disclosure/dartApi.service';
import { startBackfill, getBackfillStatus, backfillSingleStock } from '../services/disclosure/disclosureBackfill.service';
import { classifyDisclosure } from '../services/disclosure/disclosureClassifier.service';
import { query, isDbReady } from '../config/db';

const router = Router();

// jp: POST /api/admin/dart/sync-companies - corp_code 동기화
router.post('/dart/sync-companies', async (_req: Request, res: Response) => {
  try {
    const result = await syncDartCompanies();
    res.json({ success: true, data: result });
  } catch {
    res.status(500).json({ success: false, error: '회사 코드 정보를 동기화하지 못했어요.' });
  }
});

// jp: POST /api/admin/disclosures/sync - 최신 공시 수동 동기화
router.post('/disclosures/sync', async (_req: Request, res: Response) => {
  try {
    const result = await syncLatestDisclosures();
    res.json({ success: true, data: result });
  } catch {
    res.status(500).json({ success: false, error: '최신 공시를 동기화하지 못했어요.' });
  }
});

// jp: POST /api/admin/disclosures/reclassify - 기존 공시 전체 재분류 (분류 규칙 변경 시)
// jp: DB의 모든 공시를 reportName으로 다시 분류해 importance/sentiment/점수 갱신
router.post('/disclosures/reclassify', async (_req: Request, res: Response) => {
  if (!isDbReady()) {
    res.status(503).json({ success: false, error: 'DB 미연결' });
    return;
  }
  try {
    // jp: 전체 공시를 배치로 가져와 재분류
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
    // jp: 재분류 후 캐시 무효화 (옛 분류 캐시 제거 → 화면에 즉시 반영)
    await invalidateDisclosureCaches();
    res.json({ success: true, data: { total: rows.length, updated } });
  } catch (err) {
    res.status(500).json({ success: false, error: '재분류 실패: ' + (err instanceof Error ? err.message : '알 수 없는 오류') });
  }
});

// jp: POST /api/admin/stocks/:stockCode/disclosures/sync - 종목 공시 동기화
router.post('/stocks/:stockCode/disclosures/sync', async (req: Request, res: Response) => {
  try {
    const result = await syncDisclosuresByStockCode(req.params.stockCode);
    res.json({ success: true, data: result });
  } catch {
    res.status(500).json({ success: false, error: '종목 공시를 동기화하지 못했어요.' });
  }
});

// jp: GET /api/admin/health/dart - DART API 연결 상태
router.get('/health/dart', async (_req: Request, res: Response) => {
  const health = await checkDartApiHealth();
  res.json({ success: true, data: health });
});

// jp: POST /api/admin/disclosures/backfill-10y - 전 종목 10년치 공시 수집 시작
// jp: body { resume: true } 면 중단된 작업 이어서
router.post('/disclosures/backfill-10y', async (req: Request, res: Response) => {
  const resume = req.body?.resume === true;
  const result = await startBackfill(resume);
  res.json({ success: result.started, data: result });
});

// jp: GET /api/admin/disclosures/backfill-status - 진행률 조회
router.get('/disclosures/backfill-status', async (_req: Request, res: Response) => {
  const status = await getBackfillStatus();
  res.json({ success: true, data: status });
});

// jp: POST /api/admin/stocks/:stockCode/disclosures/backfill-10y - 단일 종목 10년치
router.post('/stocks/:stockCode/disclosures/backfill-10y', async (req: Request, res: Response) => {
  const { stockCode } = req.params;
  if (!/^\d{6}$/.test(stockCode)) {
    return res.status(400).json({ success: false, error: '올바른 종목 코드가 필요해요.' });
  }
  const result = await backfillSingleStock(stockCode);
  res.json({ success: true, data: result });
});

export default router;
