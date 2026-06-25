// disclosureStats.service.ts
// 공시 종류별 주가 반응 통계 집계
// disclosure_price_impact(수익률) + disclosures(분류) JOIN
// 기본 분류(제목 키워드/플래그) + 세부 분류(disclosure_subtype) 둘 다 지원
// subtype이 쌓이면 자동으로 세밀한 통계가 추가됨

import { query } from '../../config/db';

export interface DisclosureStatItem {
  key: string;          // 분류 식별자
  label: string;        // 표시 이름
  group: string;        // 'basic'(제목/플래그) | 'subtype'(AI 세부분류)
  sampleSize: number;
  // jp: 시점별 평균 수익률 (d1/d5/d10/d15/d20/d25/d30)
  avg: Record<string, number>;   // { d1, d5, d10, d15, d20, d25, d30 }
  upRate: Record<string, number>; // 시점별 상승확률 %
  stdevD30: number;     // 30일 수익률 표준편차 (변동성)
  hasEnoughData: boolean;
  isVisible: boolean;   // 사용자 노출 여부
}

const MIN_SAMPLE = 10;  // jp: 이 이상이어야 통계 신뢰도 표시

// jp: 노이즈 필터 - 플래그 하나라도 true인 의미있는 공시만
// jp: 임원소유보고서, 주총공고 등 주가무관 공시 제외 (전부 플래그 false라 자동 제외)
const MEANINGFUL_FILTER = `(d.is_good OR d.is_bad OR d.is_capital OR d.is_important) AND d.report_name NOT LIKE '[기재정정]%'`;

// jp: 기본 분류 - 제목 키워드 기반 (subtype 없는 과거 데이터도 잡힘)
// jp: CASE 식으로 report_name을 보고 유형 판정
const BASIC_CASE = `
  CASE
    WHEN d.report_name LIKE '%무상증자%' AND d.report_name LIKE '%유상%' THEN '유무상증자'
    WHEN d.report_name LIKE '%무상증자%' THEN '무상증자'
      WHEN d.report_name LIKE '%유상증자%' AND d.report_name LIKE '%주주배정%' THEN '유상증자_주주배정'
      WHEN d.report_name LIKE '%유상증자%' AND d.report_name LIKE '%제3자%' THEN '유상증자_제3자배정'
      WHEN d.report_name LIKE '%유상증자%' AND d.report_name LIKE '%일반공모%' THEN '유상증자_일반공모'
      WHEN d.report_name LIKE '%유상증자%' THEN '유상증자_기타'
    WHEN d.report_name LIKE '%전환사채%' THEN '전환사채'
    WHEN d.report_name LIKE '%신주인수권부사채%' THEN '신주인수권부사채'
    WHEN d.report_name LIKE '%교환사채%' THEN '교환사채'
    WHEN d.report_name LIKE '%자기주식%취득%' THEN '자사주취득'
    WHEN d.report_name LIKE '%자기주식%처분%' THEN '자사주처분'
    WHEN d.report_name LIKE '%자기주식%신탁%' THEN '자사주신탁'
    WHEN d.report_name LIKE '%단일판매%' OR d.report_name LIKE '%공급계약%' THEN '단일판매공급계약'
      WHEN d.report_name LIKE '%유상감자%' THEN '유상감자'
      WHEN d.report_name LIKE '%무상감자%' THEN '무상감자'
      WHEN d.report_name LIKE '%감자%' THEN '감자_기타'
    WHEN d.report_name LIKE '%주식소각%' THEN '주식소각'
    WHEN d.report_name LIKE '%영업%정지%' THEN '영업정지'
    WHEN d.report_name LIKE '%최대주주변경%' THEN '최대주주변경'
    WHEN d.report_name LIKE '%합병%' THEN '합병'
    WHEN d.report_name LIKE '%분할%' THEN '분할'
    WHEN d.report_name LIKE '%소송%' THEN '소송'
    WHEN d.report_name LIKE '%실적%' OR d.report_name LIKE '%영업(잠정)실적%' THEN '실적공시'
    ELSE NULL
  END`;

interface AggRow {
  type: string;
  cnt: string;
  avg_d1: string | null;  avg_d5: string | null;  avg_d10: string | null;
  avg_d15: string | null; avg_d20: string | null; avg_d25: string | null; avg_d30: string | null;
  up_d1: string;  up_d5: string;  up_d10: string;
  up_d15: string; up_d20: string; up_d25: string; up_d30: string;
  stdev_d30: string | null;
}

function toStatItem(r: AggRow, group: string): DisclosureStatItem {
  const cnt = parseInt(r.cnt);
  const num = (v: string | null) => (v ? parseFloat(v) : 0);
  const rate = (v: string) => (cnt > 0 ? (parseInt(v) / cnt) * 100 : 0);
  return {
    key: `${group}:${r.type}`,
    label: r.type,
    group,
    sampleSize: cnt,
    avg: {
      d1: num(r.avg_d1), d5: num(r.avg_d5), d10: num(r.avg_d10),
      d15: num(r.avg_d15), d20: num(r.avg_d20), d25: num(r.avg_d25), d30: num(r.avg_d30),
    },
    upRate: {
      d1: rate(r.up_d1), d5: rate(r.up_d5), d10: rate(r.up_d10),
      d15: rate(r.up_d15), d20: rate(r.up_d20), d25: rate(r.up_d25), d30: rate(r.up_d30),
    },
    stdevD30: num(r.stdev_d30),
    hasEnoughData: cnt >= MIN_SAMPLE,
    isVisible: false,  // getDisclosureStats에서 실제 값으로 채움
  };
}

// jp: 노출 설정 조회 (전체 맵)
async function loadVisibilityMap(): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>();
  try {
    const rows = await query<{ stat_type: string; is_visible: boolean }>(
      `SELECT stat_type, is_visible FROM disclosure_stat_visibility`
    );
    for (const r of rows) map.set(r.stat_type, r.is_visible);
  } catch { /* 테이블 없으면 전부 false */ }
  return map;
}

// jp: 노출 설정 변경
export async function setStatVisibility(statType: string, isVisible: boolean, updatedBy: string): Promise<void> {
  await query(
    `INSERT INTO disclosure_stat_visibility (stat_type, is_visible, updated_at, updated_by)
     VALUES ($1, $2, now(), $3)
     ON CONFLICT (stat_type) DO UPDATE SET is_visible = $2, updated_at = now(), updated_by = $3`,
    [statType, isVisible, updatedBy]
  );
}

// jp: 기본 분류 통계 (제목 키워드)
async function getBasicStats(): Promise<DisclosureStatItem[]> {
  const rows = await query<AggRow>(
    `SELECT ${BASIC_CASE} AS type,
            COUNT(*) AS cnt,
            ROUND(AVG(p.return_d1)::numeric, 2)  AS avg_d1,
            ROUND(AVG(p.return_d5)::numeric, 2)  AS avg_d5,
            ROUND(AVG(p.return_d10)::numeric, 2) AS avg_d10,
            ROUND(AVG(p.return_d15)::numeric, 2) AS avg_d15,
            ROUND(AVG(p.return_d20)::numeric, 2) AS avg_d20,
            ROUND(AVG(p.return_d25)::numeric, 2) AS avg_d25,
            ROUND(AVG(p.return_d30)::numeric, 2) AS avg_d30,
            COUNT(*) FILTER (WHERE p.return_d1 > 0)  AS up_d1,
            COUNT(*) FILTER (WHERE p.return_d5 > 0)  AS up_d5,
            COUNT(*) FILTER (WHERE p.return_d10 > 0) AS up_d10,
            COUNT(*) FILTER (WHERE p.return_d15 > 0) AS up_d15,
            COUNT(*) FILTER (WHERE p.return_d20 > 0) AS up_d20,
            COUNT(*) FILTER (WHERE p.return_d25 > 0) AS up_d25,
            COUNT(*) FILTER (WHERE p.return_d30 > 0) AS up_d30,
            ROUND(STDDEV_SAMP(p.return_d30)::numeric, 2) AS stdev_d30
       FROM disclosure_price_impact p
       JOIN disclosures d ON d.receipt_no = p.receipt_no
      WHERE p.status = 'complete'
        AND ${MEANINGFUL_FILTER}
        AND ${BASIC_CASE} IS NOT NULL
      GROUP BY type
      HAVING COUNT(*) >= 3
      ORDER BY COUNT(*) DESC`
  );
  return rows.map(r => toStatItem(r, 'basic'));
}

// jp: 세부 분류 통계 (disclosure_subtype - AI가 분류한 것)
async function getSubtypeStats(): Promise<DisclosureStatItem[]> {
  const rows = await query<AggRow>(
    `SELECT d.disclosure_subtype AS type,
            COUNT(*) AS cnt,
            ROUND(AVG(p.return_d1)::numeric, 2)  AS avg_d1,
            ROUND(AVG(p.return_d5)::numeric, 2)  AS avg_d5,
            ROUND(AVG(p.return_d10)::numeric, 2) AS avg_d10,
            ROUND(AVG(p.return_d15)::numeric, 2) AS avg_d15,
            ROUND(AVG(p.return_d20)::numeric, 2) AS avg_d20,
            ROUND(AVG(p.return_d25)::numeric, 2) AS avg_d25,
            ROUND(AVG(p.return_d30)::numeric, 2) AS avg_d30,
            COUNT(*) FILTER (WHERE p.return_d1 > 0)  AS up_d1,
            COUNT(*) FILTER (WHERE p.return_d5 > 0)  AS up_d5,
            COUNT(*) FILTER (WHERE p.return_d10 > 0) AS up_d10,
            COUNT(*) FILTER (WHERE p.return_d15 > 0) AS up_d15,
            COUNT(*) FILTER (WHERE p.return_d20 > 0) AS up_d20,
            COUNT(*) FILTER (WHERE p.return_d25 > 0) AS up_d25,
            COUNT(*) FILTER (WHERE p.return_d30 > 0) AS up_d30,
            ROUND(STDDEV_SAMP(p.return_d30)::numeric, 2) AS stdev_d30
       FROM disclosure_price_impact p
       JOIN disclosures d ON d.receipt_no = p.receipt_no
      WHERE p.status = 'complete'
        AND d.disclosure_subtype IS NOT NULL
        AND d.report_name NOT LIKE '[기재정정]%'
      GROUP BY d.disclosure_subtype
      HAVING COUNT(*) >= 3
      ORDER BY COUNT(*) DESC`
  );
  return rows.map(r => toStatItem(r, 'subtype'));
}

// jp: 전체 통계 (기본 + 세부)
export async function getDisclosureStats(): Promise<{
  basic: DisclosureStatItem[];
  subtype: DisclosureStatItem[];
  totalSamples: number;
}> {
  const [basic, subtype] = await Promise.all([getBasicStats(), getSubtypeStats()]);

  // jp: 노출 설정 채우기
  const visMap = await loadVisibilityMap();
  for (const s of basic) s.isVisible = visMap.get(s.label) ?? false;
  for (const s of subtype) s.isVisible = visMap.get(s.label) ?? false;

  const totalRow = await query<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt
       FROM disclosure_price_impact p
       JOIN disclosures d ON d.receipt_no = p.receipt_no
      WHERE p.status = 'complete' AND ${MEANINGFUL_FILTER}`
  );
  const totalSamples = parseInt(totalRow[0]?.cnt || '0');

  return { basic, subtype, totalSamples };
}

// jp: 특정 분류의 일자별 상세 (검증용)
export interface DisclosureStatDetailRow {
  receiptNo: string;
  stockCode: string;
  stockName: string;
  disclosedDate: string;
  reportName: string;
  returns: Record<string, number | null>;  // d1~d30
}

// jp: group/type으로 상세 조회 (예: basic/유상증자, subtype/유상증자_제3자배정)
export async function getDisclosureStatDetail(group: string, type: string, limit = 100): Promise<DisclosureStatDetailRow[]> {
  let whereClause: string;
  const params: (string | number)[] = [];

  if (group === 'subtype') {
    whereClause = `d.disclosure_subtype = $1`;
    params.push(type);
  } else {
    // jp: basic - 제목 키워드로 역매칭 (type에 해당하는 LIKE 조건)
    whereClause = `${BASIC_CASE} = $1`;
    params.push(type);
  }
  params.push(limit);

  const rows = await query<{
    receipt_no: string; stock_code: string; stock_name: string;
    disclosed_date: string; report_name: string;
    return_d1: string | null; return_d5: string | null; return_d10: string | null;
    return_d15: string | null; return_d20: string | null; return_d25: string | null; return_d30: string | null;
  }>(
    `SELECT d.receipt_no, d.stock_code, d.stock_name,
            p.disclosed_date::text AS disclosed_date, d.report_name,
            p.return_d1, p.return_d5, p.return_d10, p.return_d15, p.return_d20, p.return_d25, p.return_d30
       FROM disclosure_price_impact p
       JOIN disclosures d ON d.receipt_no = p.receipt_no
      WHERE p.status = 'complete' AND ${whereClause}
      ORDER BY p.disclosed_date DESC
      LIMIT $${params.length}`,
    params
  );

  return rows.map(r => ({
    receiptNo: r.receipt_no,
    stockCode: r.stock_code,
    stockName: r.stock_name,
    disclosedDate: r.disclosed_date,
    reportName: r.report_name,
    returns: {
      d1: r.return_d1 ? parseFloat(r.return_d1) : null,
      d5: r.return_d5 ? parseFloat(r.return_d5) : null,
      d10: r.return_d10 ? parseFloat(r.return_d10) : null,
      d15: r.return_d15 ? parseFloat(r.return_d15) : null,
      d20: r.return_d20 ? parseFloat(r.return_d20) : null,
      d25: r.return_d25 ? parseFloat(r.return_d25) : null,
      d30: r.return_d30 ? parseFloat(r.return_d30) : null,
    },
  }));
}
