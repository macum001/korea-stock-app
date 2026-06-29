// jp: 정기보고서 주요정보 통합 라우터 (5종 + financial-risk + all)
// jp: GET /api/report-info/:receiptNo/:type
// jp:   type: investments | major-shareholders | stock-total | dividends | minority

import { Router, Request, Response } from 'express';
import { query } from '../config/db';
import {
  getInvestments,
  getMajorShareholders,
  getStockTotal,
  getDividends,
  getMinorityShareholders,
  getAllReportInfo,
  getFinancials,
  getAuditOpinion,
  getUnredeemedBonds,
  getBondDetails,
  getCreditRating,
  parseReportContext,
} from '../services/ai/dartReportInfo.service';
import { getFinancialRisk } from '../services/ai/dartFinancialRisk.service';

const router = Router();

// jp: GET /api/report-info/:receiptNo/financial-risk - 자본잠식·상장폐지 위험 판정
router.get('/:receiptNo/financial-risk', async (req: Request, res: Response) => {
  const { receiptNo } = req.params;
  if (!receiptNo || !/^\d{14}$/.test(receiptNo)) {
    return res.status(400).json({ success: false, error: '잘못된 접수번호 형식입니다.' });
  }
  try {
    const rows = await query<{ corp_code: string | null }>(
      `SELECT corp_code FROM disclosures WHERE receipt_no = $1 LIMIT 1`,
      [receiptNo]
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, error: '공시를 찾을 수 없습니다.' });
    }
    const corpCode = rows[0].corp_code;
    if (!corpCode) {
      return res.json({ success: true, data: { signals: [], overallLevel: 'unknown' } });
    }
    const result = await getFinancialRisk(corpCode);
    if (!result) {
      return res.json({ success: true, data: { signals: [], overallLevel: 'unknown' } });
    }
    return res.json({ success: true, data: result });
  } catch (err) {
    console.error('[financial-risk] 오류:', err instanceof Error ? err.message : err);
    return res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
  }
});

// jp: GET /api/report-info/:receiptNo/all — 5개 타입 한 번에 병렬 조회 (속도 최적화)
// jp: 클릭한 공시(receiptNo)의 report_name/disclosed_at로 컨텍스트를 만들어
// jp: 해당 공시 연도·보고서 우선 → 없으면 섹션별 과거 fallback
router.get('/:receiptNo/all', async (req: Request, res: Response) => {
  const { receiptNo } = req.params;
  if (!receiptNo || !/^\d{14}$/.test(receiptNo)) {
    return res.status(400).json({ success: false, error: '잘못된 접수번호 형식입니다.' });
  }
  try {
    const rows = await query<{ corp_code: string | null; report_name: string | null; disclosed_at: string | null }>(
      `SELECT corp_code, report_name, disclosed_at FROM disclosures WHERE receipt_no = $1 LIMIT 1`,
      [receiptNo]
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, error: '공시를 찾을 수 없습니다.' });
    }
    const corpCode = rows[0].corp_code;
    if (!corpCode) {
      return res.json({ success: true, data: {
        investments: [], majorShareholders: [], stockTotal: [],
        dividends: [], minority: [], year: null,
        context: { year: null, reprtCode: null }, sectionMeta: {},
      }});
    }
    // jp: 클릭한 공시의 연도·보고서코드 파싱 → 해당 공시 우선 조회
    const ctx = parseReportContext(rows[0].report_name || '', rows[0].disclosed_at || undefined);
    const result = await getAllReportInfo(corpCode, ctx);
    return res.json({ success: true, data: result });
  } catch (err) {
    console.error('[report-info/all] 오류:', err instanceof Error ? err.message : err);
    return res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
  }
});

type Handler = (corpCode: string, ctx?: { year: number | null; reprtCode: string | null }) =>
  Promise<{ items: unknown[]; year: number | null; meta?: unknown }>;

const HANDLERS: Record<string, Handler> = {
  'investments':        getInvestments,
  'major-shareholders': getMajorShareholders,
  'stock-total':        getStockTotal,
  'dividends':          getDividends,
  'minority':           getMinorityShareholders,
};

router.get('/:receiptNo/:type', async (req: Request, res: Response) => {
  const { receiptNo, type } = req.params;

  if (!receiptNo || !/^\d{14}$/.test(receiptNo)) {
    return res.status(400).json({ success: false, error: '잘못된 접수번호 형식입니다.' });
  }

  const handler = HANDLERS[type];
  if (!handler) {
    return res.status(400).json({ success: false, error: '지원하지 않는 정보 유형입니다.' });
  }

  try {
    const rows = await query<{ corp_code: string | null; report_name: string | null; disclosed_at: string | null }>(
      `SELECT corp_code, report_name, disclosed_at FROM disclosures WHERE receipt_no = $1 LIMIT 1`,
      [receiptNo]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, error: '공시를 찾을 수 없습니다.' });
    }

    const corpCode = rows[0].corp_code;
    if (!corpCode) {
      return res.json({ success: true, data: { items: [], year: null } });
    }

    // jp: 클릭한 공시 컨텍스트로 해당 연도·보고서 우선 조회
    const ctx = parseReportContext(rows[0].report_name || '', rows[0].disclosed_at || undefined);
    const result = await handler(corpCode, ctx);
    return res.json({ success: true, data: { ...result, corpCode } });
  } catch (err) {
    console.error(`[report-info/${type}] 오류:`, err instanceof Error ? err.message : err);
    return res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
  }
});

export default router;
