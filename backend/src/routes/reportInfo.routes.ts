// jp: 정기보고서 주요정보 통합 라우트 (5종 + 재무/자본잠식 디버그)
// jp: GET /api/report-info/:receiptNo/:type
// jp:   type: investments | major-shareholders | stock-total | dividends | minority

import { Router, Request, Response } from 'express';
import axios from 'axios';
import { query } from '../config/db';
import { ENV } from '../config/env';
import {
  getInvestments,
  getMajorShareholders,
  getStockTotal,
  getDividends,
  getMinorityShareholders,
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
    console.error('[자본잠식판정] 오류:', err instanceof Error ? err.message : err);
    return res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
  }
});

// jp: [디버그 임시] 재무제표 원응답에서 자본 관련 계정 확인
router.get('/debug-fin/:receiptNo', async (req: Request, res: Response) => {
  const { receiptNo } = req.params;
  try {
    const rows = await query<{ corp_code: string | null }>(
      `SELECT corp_code FROM disclosures WHERE receipt_no = $1 LIMIT 1`,
      [receiptNo]
    );
    const corpCode = rows?.[0]?.corp_code;
    if (!corpCode) return res.json({ step: 'no_corp_code' });

    const thisYear = new Date().getFullYear();
    // jp: 최근 연도부터 CFS(연결) 시도, 없으면 OFS(별도)
    for (let i = 1; i <= 3; i++) {
      const year = thisYear - i;
      for (const fsDiv of ['CFS', 'OFS']) {
        const r = await axios.get('https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json', {
          params: { crtfc_key: ENV.DART?.API_KEY, corp_code: corpCode, bsns_year: String(year), reprt_code: '11011', fs_div: fsDiv },
          timeout: 15000,
        });
        const data = r.data as { status: string; list?: Array<Record<string, string>> };
        if (data.status === '000' && Array.isArray(data.list)) {
          // jp: 자본 관련 계정만 추출
          const KEYS = ['자본금', '자본총계', '부채총계', '자산총계', '영업이익', '영업손실'];
          const found = data.list
            .filter((x) => KEYS.some((k) => (x.account_nm || '').includes(k)))
            .map((x) => ({
              account_nm: x.account_nm,
              sj_nm: x.sj_nm,
              thstrm_amount: x.thstrm_amount,
              currency: x.currency,
            }));
          return res.json({ step: 'ok', year, fsDiv, corpCode, found });
        }
      }
    }
    return res.json({ step: 'no_data', corpCode });
  } catch (err: any) {
    return res.json({ step: 'error', message: err?.message, dartResponse: err?.response?.data ?? null });
  }
});

type Handler = (corpCode: string) => Promise<{ items: unknown[]; year: number | null }>;

const HANDLERS: Record<string, Handler> = {
  'investments':       getInvestments,
  'major-shareholders': getMajorShareholders,
  'stock-total':       getStockTotal,
  'dividends':         getDividends,
  'minority':          getMinorityShareholders,
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
    const rows = await query<{ corp_code: string | null }>(
      `SELECT corp_code FROM disclosures WHERE receipt_no = $1 LIMIT 1`,
      [receiptNo]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, error: '공시를 찾을 수 없습니다.' });
    }

    const corpCode = rows[0].corp_code;
    if (!corpCode) {
      return res.json({ success: true, data: { items: [], year: null } });
    }

    const result = await handler(corpCode);
    return res.json({ success: true, data: { ...result, corpCode } });
  } catch (err) {
    console.error(`[정기보고서:${type}] 오류:`, err instanceof Error ? err.message : err);
    return res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
  }
});

export default router;
