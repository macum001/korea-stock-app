// jp: 공시 PostgreSQL 저장소 - receipt_no 중복 방지

import { query } from '../config/db';
import { Disclosure } from '../types/disclosure';
import { AppError } from '../types/errors';

// jp: DB row → Disclosure 변환
function rowToDisclosure(row: Record<string, unknown>): Disclosure {
  return {
    id:              row.id as string,
    stockCode:       row.stock_code as string,
    stockName:       row.stock_name as string,
    corpCode:        row.corp_code as string,
    receiptNo:       row.receipt_no as string,
    reportName:      row.report_name as string,
    disclosureType:  row.disclosure_type as string,
    importance:      row.importance as Disclosure['importance'],
    sentiment:       row.sentiment as Disclosure['sentiment'],
    positiveScore:   Number(row.positive_score ?? 0),
    negativeScore:   Number(row.negative_score ?? 0),
    cautionScore:    Number(row.caution_score ?? 0),
    matchedKeywords: (row.matched_keywords as string[]) ?? [],
    summary:         row.summary as string,
    originalUrl:     row.original_url as string,
    disclosedAt:     (row.disclosed_at as Date)?.toISOString?.() ?? String(row.disclosed_at),
    collectedAt:     (row.collected_at as Date)?.toISOString?.() ?? String(row.collected_at),
    // jp: 탭 분류 플래그
    isImportant:     Boolean(row.is_important),
    isCapital:       Boolean(row.is_capital),
    isGood:          Boolean(row.is_good),
    isBad:           Boolean(row.is_bad),
    isCorrection:    Boolean(row.is_correction),
    normalizedTitle: row.normalized_title as string,
    category:        row.category as string,
    categoryType:    row.category_type as string,
  };
}

// jp: receipt_no로 중복 확인
export async function findDisclosureByReceiptNo(receiptNo: string): Promise<Disclosure | null> {
  try {
    const rows = await query<Record<string, unknown>>(
      'SELECT * FROM disclosures WHERE receipt_no = $1 LIMIT 1',
      [receiptNo]
    );
    return rows.length > 0 ? rowToDisclosure(rows[0]) : null;
  } catch (err) {
    throw new AppError('DATABASE_ERROR', `공시 조회 실패: ${err}`);
  }
}

// jp: 공시 저장 (중복이면 무시) - ON CONFLICT DO NOTHING
export async function upsertDisclosure(d: Disclosure): Promise<{ saved: boolean; disclosure: Disclosure }> {
  try {
    const rows = await query<Record<string, unknown>>(
      `INSERT INTO disclosures (
        stock_code, stock_name, corp_code, receipt_no, report_name,
        disclosure_type, importance, sentiment,
        positive_score, negative_score, caution_score, matched_keywords,
        summary, original_url, disclosed_at,
        is_important, is_capital, is_good, is_bad, is_correction, normalized_title, category, category_type,
        collected_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,NOW())
      ON CONFLICT (receipt_no) DO NOTHING
      RETURNING *`,
      [
        d.stockCode ?? null, d.stockName ?? null, d.corpCode, d.receiptNo, d.reportName,
        d.disclosureType ?? null, d.importance, d.sentiment,
        d.positiveScore, d.negativeScore, d.cautionScore, d.matchedKeywords,
        d.summary ?? null, d.originalUrl ?? null, d.disclosedAt,
        d.isImportant ?? false, d.isCapital ?? false, d.isGood ?? false, d.isBad ?? false,
        d.isCorrection ?? false, d.normalizedTitle ?? null, d.category ?? null,
        d.categoryType ?? null,
      ]
    );

    if (rows.length > 0) {
      return { saved: true, disclosure: rowToDisclosure(rows[0]) };
    }
    const existing = await findDisclosureByReceiptNo(d.receiptNo);
    return { saved: false, disclosure: existing ?? d };
  } catch (err) {
    throw new AppError('DATABASE_ERROR', `공시 저장 실패: ${err}`);
  }
}

// jp: 최신 공시 목록 조회
export async function getLatestDisclosures(limit = 50, offset = 0): Promise<Disclosure[]> {
  try {
    const rows = await query<Record<string, unknown>>(
      'SELECT * FROM disclosures ORDER BY disclosed_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    return rows.map(rowToDisclosure);
  } catch (err) {
    throw new AppError('DATABASE_ERROR', `최신 공시 조회 실패: ${err}`);
  }
}

// jp: 플래그별 공시 조회 (탭 필터용)
export async function getDisclosuresByFlag(
  flag: 'important' | 'capital' | 'good' | 'bad',
  limit = 200,
  offset = 0
): Promise<Disclosure[]> {
  const colMap: Record<string, string> = {
    important: 'is_important', capital: 'is_capital', good: 'is_good', bad: 'is_bad',
  };
  const col = colMap[flag];
  if (!col) return [];
  try {
    const rows = await query<Record<string, unknown>>(
      `SELECT * FROM disclosures WHERE ${col} = TRUE ORDER BY disclosed_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return rows.map(rowToDisclosure);
  } catch (err) {
    throw new AppError('DATABASE_ERROR', `플래그 공시 조회 실패: ${err}`);
  }
}

// jp: 중요 공시 조회
export async function getImportantDisclosures(limit = 50): Promise<Disclosure[]> {
  try {
    const rows = await query<Record<string, unknown>>(
      `SELECT * FROM disclosures WHERE importance != 'normal'
       ORDER BY disclosed_at DESC LIMIT $1`,
      [limit]
    );
    return rows.map(rowToDisclosure);
  } catch (err) {
    throw new AppError('DATABASE_ERROR', `중요 공시 조회 실패: ${err}`);
  }
}

// jp: 종목별 공시 조회 - ★ offset 추가 (무한스크롤 페이지네이션)
// jp: ORDER BY 에 receipt_no DESC 보조정렬 → disclosed_at 이 날짜만(00:00:00)이라 같은 날 순서 안정화
// jp: 종류 축(category_type) 필터 페이지 조회 — 7개 탭용. idx_disclosures_category_type 인덱스 사용
export async function getDisclosuresByCategoryPage(
  categoryType: string,
  limit = 50,
  offset = 0
): Promise<{ items: Disclosure[]; hasMore: boolean }> {
  try {
    const rows = await query<Record<string, unknown>>(
      'SELECT * FROM disclosures WHERE category_type = $1 ORDER BY disclosed_at DESC, receipt_no DESC LIMIT $2 OFFSET $3',
      [categoryType, limit, offset]
    );
    const items = rows.map(rowToDisclosure);
    return { items, hasMore: items.length >= limit };
  } catch (err) {
    throw new AppError('DATABASE_ERROR', `카테고리 공시 조회 실패: ${err}`);
  }
}

export async function getDisclosuresByStockCode(
  stockCode: string,
  limit = 30,
  offset = 0,
  categoryType?: string
): Promise<Disclosure[]> {
  try {
    const rows = await query<Record<string, unknown>>(
      categoryType
        ? 'SELECT * FROM disclosures WHERE stock_code = $1 AND category_type = $4 ORDER BY disclosed_at DESC, receipt_no DESC LIMIT $2 OFFSET $3'
        : 'SELECT * FROM disclosures WHERE stock_code = $1 ORDER BY disclosed_at DESC, receipt_no DESC LIMIT $2 OFFSET $3',
      categoryType ? [stockCode, limit, offset, categoryType] : [stockCode, limit, offset]
    );
    return rows.map(rowToDisclosure);
  } catch (err) {
    throw new AppError('DATABASE_ERROR', `종목 공시 조회 실패: ${err}`);
  }
}

// jp: 종목별 공시 총 건수 (스크롤 끝 판단용)
export async function countDisclosuresByStockCode(stockCode: string, categoryType?: string): Promise<number> {
  try {
    const rows = await query<{ cnt: string }>(
      categoryType
        ? 'SELECT COUNT(*) AS cnt FROM disclosures WHERE stock_code = $1 AND category_type = $2'
        : 'SELECT COUNT(*) AS cnt FROM disclosures WHERE stock_code = $1',
      categoryType ? [stockCode, categoryType] : [stockCode]
    );
    return Number(rows[0]?.cnt ?? 0);
  } catch {
    return 0;
  }
}

// jp: 공시 검색
export async function searchDisclosures(keyword: string, limit = 50): Promise<Disclosure[]> {
  try {
    const rows = await query<Record<string, unknown>>(
      `SELECT * FROM disclosures
       WHERE report_name ILIKE $1 OR stock_name ILIKE $1
       ORDER BY disclosed_at DESC LIMIT $2`,
      [`%${keyword}%`, limit]
    );
    return rows.map(rowToDisclosure);
  } catch (err) {
    throw new AppError('DATABASE_ERROR', `공시 검색 실패: ${err}`);
  }
}

// jp: AI 분석 결과 타입 (on-demand 저장용)
export interface AiAnalysisDbRow {
  ai_summary: string | null;
  ai_key_points: string[] | null;
  ai_investor_note: string | null;
  ai_risk_note: string | null;
  impact_level: string | null;
  confidence_score: number | null;
  ai_status: string | null;
  ai_model: string | null;
}

// jp: 공시의 저장된 AI 분석 조회
export async function getDisclosureAi(receiptNo: string): Promise<AiAnalysisDbRow | null> {
  try {
    const rows = await query<AiAnalysisDbRow>(
      `SELECT ai_summary, ai_key_points, ai_investor_note, ai_risk_note,
              impact_level, confidence_score, ai_status, ai_model
         FROM disclosures WHERE receipt_no = $1 LIMIT 1`,
      [receiptNo]
    );
    return rows[0] || null;
  } catch {
    return null;
  }
}

// jp: AI 분석 결과 저장
export async function saveDisclosureAi(
  receiptNo: string,
  ai: {
    summary: string; keyPoints: string[]; investorNote: string; riskNote: string;
    impactLevel: string; confidenceScore: number; model: string; status: string;
  }
): Promise<void> {
  try {
    await query(
      `UPDATE disclosures SET
         ai_summary = $1, ai_key_points = $2, ai_investor_note = $3, ai_risk_note = $4,
         impact_level = $5, confidence_score = $6, ai_model = $7, ai_status = $8,
         ai_analyzed_at = NOW()
       WHERE receipt_no = $9`,
      [
        ai.summary, JSON.stringify(ai.keyPoints), ai.investorNote, ai.riskNote,
        ai.impactLevel, ai.confidenceScore, ai.model, ai.status, receiptNo,
      ]
    );
  } catch (err) {
    console.error('[AI공시] DB 저장 실패:', err instanceof Error ? err.message : err);
  }
}
