// disclosureStatsUser.service.ts
// 사용자용 공시 통계 - 특정 공시의 "유형"에 대한 과거 주가반응 통계
// 공시 상세 시트에서 "💡 과거 이런 공시 후 평균 +X%" 표시용

import { query } from '../../config/db';

// jp: 노이즈 제외 - 의미있는 공시만
const MEANINGFUL_FILTER = `(d.is_good OR d.is_bad OR d.is_capital OR d.is_important) AND d.report_name NOT LIKE '[기재정정]%'`;

// jp: 이 유형이 사용자에게 노출 설정됐는지 확인 (기본 false)
async function isTypeVisible(statType: string): Promise<boolean> {
  try {
    const rows = await query<{ is_visible: boolean }>(
      `SELECT is_visible FROM disclosure_stat_visibility WHERE stat_type = $1 LIMIT 1`,
      [statType]
    );
    return rows.length > 0 ? rows[0].is_visible : false;
  } catch {
    return false;
  }
}

// jp: 제목 키워드 → 유형 (관리자 BASIC_CASE와 동일)
const BASIC_CASE = `
  CASE
    WHEN d.report_name LIKE '%무상증자%' AND d.report_name LIKE '%유상%' THEN '유무상증자'
    WHEN d.report_name LIKE '%무상증자%' THEN '무상증자'
    WHEN d.report_name LIKE '%유상증자%' THEN '유상증자'
    WHEN d.report_name LIKE '%전환사채%' THEN '전환사채'
    WHEN d.report_name LIKE '%신주인수권부사채%' THEN '신주인수권부사채'
    WHEN d.report_name LIKE '%교환사채%' THEN '교환사채'
    WHEN d.report_name LIKE '%자기주식%취득%' THEN '자사주취득'
    WHEN d.report_name LIKE '%자기주식%처분%' THEN '자사주처분'
    WHEN d.report_name LIKE '%자기주식%신탁%' THEN '자사주신탁'
    WHEN d.report_name LIKE '%단일판매%' OR d.report_name LIKE '%공급계약%' THEN '단일판매공급계약'
    WHEN d.report_name LIKE '%감자%' THEN '감자'
    WHEN d.report_name LIKE '%주식소각%' THEN '주식소각'
    WHEN d.report_name LIKE '%영업%정지%' THEN '영업정지'
    WHEN d.report_name LIKE '%최대주주변경%' THEN '최대주주변경'
    WHEN d.report_name LIKE '%합병%' THEN '합병'
    WHEN d.report_name LIKE '%분할%' THEN '분할'
    WHEN d.report_name LIKE '%소송%' THEN '소송'
    WHEN d.report_name LIKE '%실적%' OR d.report_name LIKE '%영업(잠정)실적%' THEN '실적공시'
    ELSE NULL
  END`;

export interface UserDisclosureStat {
  found: boolean;
  type: string | null;        // 매칭된 유형 (예: '유상증자')
  sampleSize: number;
  avgD5: number;
  avgD30: number;
  upRateD30: number;          // 30일 상승확률 %
  // jp: 한 줄 해설 (단기/장기 흐름)
  trend: 'up' | 'down' | 'mixed' | 'flat';
}

// jp: receiptNo로 그 공시의 유형 통계 조회
// jp: 1) 그 공시의 report_name으로 유형 판정 → 2) 같은 유형 전체 통계
export async function getUserStatByReceiptNo(receiptNo: string): Promise<UserDisclosureStat> {
  const notFound: UserDisclosureStat = {
    found: false, type: null, sampleSize: 0, avgD5: 0, avgD30: 0, upRateD30: 0, trend: 'flat',
  };

  // jp: 이 공시의 유형 판정 (subtype 우선, 없으면 제목 키워드)
  const typeRow = await query<{ subtype: string | null; basic_type: string | null }>(
    `SELECT d.disclosure_subtype AS subtype, ${BASIC_CASE} AS basic_type
       FROM disclosures d
      WHERE d.receipt_no = $1
      LIMIT 1`,
    [receiptNo]
  );

  if (!typeRow || typeRow.length === 0) return notFound;

  const subtype = typeRow[0].subtype;
  const basicType = typeRow[0].basic_type;

  // jp: subtype 있으면 subtype 기준, 없으면 basic 기준
  let stat: UserDisclosureStat;
  if (subtype) {
    stat = await aggregateBySubtype(subtype);
    if (stat.found) return stat;
  }
  if (basicType) {
    stat = await aggregateByBasic(basicType);
    if (stat.found) return stat;
  }
  return notFound;
}

// jp: 제목 키워드 유형으로 직접 조회 (receiptNo 없이 유형명으로)
export async function getUserStatByType(typeName: string): Promise<UserDisclosureStat> {
  return aggregateByBasic(typeName);
}

function makeTrend(d5: number, d30: number): 'up' | 'down' | 'mixed' | 'flat' {
  const up5 = d5 > 0.5, down5 = d5 < -0.5;
  const up30 = d30 > 0.5, down30 = d30 < -0.5;
  if (up5 && up30) return 'up';
  if (down5 && down30) return 'down';
  if ((up5 && down30) || (down5 && up30)) return 'mixed';
  if (up30) return 'up';
  if (down30) return 'down';
  return 'flat';
}

interface AggRow {
  cnt: string; avg_d5: string | null; avg_d30: string | null; up_d30: string;
}

async function aggregateByBasic(typeName: string): Promise<UserDisclosureStat> {
  // jp: 노출 OFF면 통계 안 보여줌
  if (!(await isTypeVisible(typeName))) {
    return { found: false, type: null, sampleSize: 0, avgD5: 0, avgD30: 0, upRateD30: 0, trend: 'flat' };
  }
  const rows = await query<AggRow>(
    `SELECT COUNT(*) AS cnt,
            ROUND(AVG(p.return_d5)::numeric, 1)  AS avg_d5,
            ROUND(AVG(p.return_d30)::numeric, 1) AS avg_d30,
            COUNT(*) FILTER (WHERE p.return_d30 > 0) AS up_d30
       FROM disclosure_price_impact p
       JOIN disclosures d ON d.receipt_no = p.receipt_no
      WHERE p.status = 'complete'
        AND ${MEANINGFUL_FILTER}
        AND ${BASIC_CASE} = $1`,
    [typeName]
  );
  return buildStat(typeName, rows[0]);
}

async function aggregateBySubtype(subtype: string): Promise<UserDisclosureStat> {
  // jp: 노출 OFF면 통계 안 보여줌
  if (!(await isTypeVisible(subtype))) {
    return { found: false, type: null, sampleSize: 0, avgD5: 0, avgD30: 0, upRateD30: 0, trend: 'flat' };
  }
  const rows = await query<AggRow>(
    `SELECT COUNT(*) AS cnt,
            ROUND(AVG(p.return_d5)::numeric, 1)  AS avg_d5,
            ROUND(AVG(p.return_d30)::numeric, 1) AS avg_d30,
            COUNT(*) FILTER (WHERE p.return_d30 > 0) AS up_d30
       FROM disclosure_price_impact p
       JOIN disclosures d ON d.receipt_no = p.receipt_no
      WHERE p.status = 'complete'
        AND d.disclosure_subtype = $1
        AND d.report_name NOT LIKE '[기재정정]%'`,
    [subtype]
  );
  return buildStat(subtype, rows[0]);
}

function buildStat(typeName: string, r: AggRow | undefined): UserDisclosureStat {
  const cnt = r ? parseInt(r.cnt) : 0;
  // jp: 3건 미만은 통계로 안 보여줌 (너무 적음)
  if (cnt < 3) {
    return { found: false, type: null, sampleSize: 0, avgD5: 0, avgD30: 0, upRateD30: 0, trend: 'flat' };
  }
  const avgD5 = r!.avg_d5 ? parseFloat(r!.avg_d5) : 0;
  const avgD30 = r!.avg_d30 ? parseFloat(r!.avg_d30) : 0;
  const upRateD30 = cnt > 0 ? Math.round((parseInt(r!.up_d30) / cnt) * 100) : 0;
  return {
    found: true,
    type: typeName,
    sampleSize: cnt,
    avgD5, avgD30, upRateD30,
    trend: makeTrend(avgD5, avgD30),
  };
}
