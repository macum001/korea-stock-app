// jp: DART 사업보고서 주요정보 조회 서비스
// jp: 5개: 타법인출자 / 최대주주 / 주식총수 / 배당 / 소액주주
// jp: 모두 corp_code + bsns_year + reprt_code(11011 사업보고서) 기반 조회 후 최근 N년 중 데이터 있는 1건
// jp: 캐싱(Redis 24h) → DART API → 즉시 반환. {success,data} 래퍼는 라우터에서 처리

import axios from 'axios';
import { ENV } from '../../config/env';
import { safeGet, safeSetEx } from '../../config/redis';

const BASE = 'https://opendart.fss.or.kr/api';
const REPRT_CODES = ['11011', '11014', '11012', '11013']; // 사업/3분기/반기/1분기
const CACHE_TTL = 60 * 60 * 24;
const YEARS_TRY = 5; // jp: 3 → 5년으로 확대 (섹션 누락 방지)
const TIMEOUT = 8000; // jp: 15000 → 8000으로 단축

// jp: 섹션 출처 메타 (클릭한 공시와 다른 연도/보고서면 화면에서 구분 가능하게)
export interface SectionMeta {
  sourceYear: number | null;       // jp: 실제 데이터를 가져온 연도
  sourceReprtCode: string | null;  // jp: 실제 데이터를 가져온 보고서코드
  isFallback: boolean;             // jp: 클릭한 공시가 아닌 과거 보고서에서 보충했는지
}

// jp: 클릭한 공시 기준 (라우터에서 report_name/disclosed_at 파싱해 전달)
export interface ReportContext {
  year: number | null;       // jp: 클릭한 공시의 사업연도
  reprtCode: string | null;  // jp: 클릭한 공시의 보고서코드
}

// jp: report_name + disclosed_at → 클릭한 공시의 (year, reprtCode) 추출
// jp: 예) "사업보고서 (2025.12)" → { year: 2025, reprtCode: '11011' }
export function parseReportContext(reportName: string, disclosedAt?: string): ReportContext {
  const name = reportName || '';

  // jp: 사업연도 + 결산월 추출 — "(2025.12)" 형태
  const dateM = name.match(/\((\d{4})[.\s]*(\d{2})?\)/);
  let year: number | null = dateM ? parseInt(dateM[1], 10) : null;
  const month = dateM && dateM[2] ? dateM[2] : null; // jp: "12", "09", "06", "03"

  // jp: 보고서코드 추출 — 보고서명 + 결산월 조합으로 정확히 판정
  let reprtCode: string | null = null;
  if (/사업보고서/.test(name)) {
    reprtCode = '11011';
  } else if (/반기보고서/.test(name)) {
    reprtCode = '11012';
  } else if (/분기보고서|분기/.test(name)) {
    // jp: 결산월로 1분기(03)/3분기(09) 구분
    if (month === '03') reprtCode = '11013';
    else if (month === '09') reprtCode = '11014';
    else reprtCode = null; // jp: 월 정보 없으면 아래 disclosed_at으로 추론
  }

  // jp: 사업연도/분기를 못 구했으면 disclosed_at으로 보강
  if (disclosedAt) {
    const d = new Date(disclosedAt);
    if (!isNaN(d.getTime())) {
      const m = d.getMonth() + 1; // 1~12
      if (year === null) {
        // jp: 1~4월 공시 = 전년도 결산 보고서, 그 외 = 당해연도
        year = m <= 4 ? d.getFullYear() - 1 : d.getFullYear();
      }
      // jp: 분기보고서인데 코드 못 정했으면 공시월로 추정
      // jp: 1분기보고서는 보통 5월, 3분기보고서는 11월 공시
      if (reprtCode === null && /분기/.test(name)) {
        reprtCode = m >= 10 || m <= 2 ? '11014' : '11013';
      }
    }
  }

  return { year, reprtCode };
}

// ===== 공통 유틸 =====
function num(v: unknown): string {
  const s = String(v ?? '').trim();
  return s && s !== '-' ? s : '';
}

// jp: 요청 1건당 DART 실제 호출 수 추적 + 상한
// jp: 캐시 히트는 카운트 안 함 (실제 네트워크 호출만)
export interface CallBudget {
  calls: number;      // jp: 실제 DART API 호출 수 (캐시 미스만)
  cacheHits: number;  // jp: 캐시 히트 수
  limit: number;      // jp: 호출 상한 — 초과 시 조기 중단
  combos: string[];   // jp: 실제 호출한 조합 목록 (디버그용)
}

function newBudget(limit = 40): CallBudget {
  return { calls: 0, cacheHits: 0, limit, combos: [] };
}

// jp: 특정 연도+보고서코드 1건 조회 (단일 조합 캐시 — 같은 corp/year/code 재호출 방지)
// jp: budget이 주어지면 실제 호출 수를 카운트하고 상한 초과 시 호출 안 함
async function fetchOne<T>(
  endpoint: string,
  corpCode: string,
  year: number,
  reprtCode: string,
  budget?: CallBudget
): Promise<T[] | null> {
  const cacheKey = `dart:one:${endpoint}:${corpCode}:${year}:${reprtCode}`;
  try {
    const c = await safeGet(cacheKey);
    if (c) {
      if (budget) budget.cacheHits++;
      const parsed = JSON.parse(c) as { list: T[] | null };
      return parsed.list;
    }
  } catch { /* 캐시 무시 */ }

  // jp: 호출 상한 초과 시 네트워크 호출 안 함 (조기 중단)
  if (budget && budget.calls >= budget.limit) {
    console.warn(`[ReportInfo] DART 호출 상한(${budget.limit}) 도달 — ${endpoint} ${year}/${reprtCode} 스킵`);
    return null;
  }

  if (budget) {
    budget.calls++;
    budget.combos.push(`${endpoint}:${year}:${reprtCode}`);
  }

  let result: T[] | null = null;
  try {
    const res = await axios.get(`${BASE}/${endpoint}.json`, {
      params: {
        crtfc_key: ENV.DART.API_KEY,
        corp_code: corpCode,
        bsns_year: String(year),
        reprt_code: reprtCode,
      },
      timeout: TIMEOUT,
    });
    const data = res.data as { status: string; list?: T[] };
    if (data.status === '000' && Array.isArray(data.list) && data.list.length > 0) {
      result = data.list;
    }
  } catch {
    result = null;
  }

  // jp: 결과(null 포함)를 캐시 — 빈 응답도 캐시해서 반복 호출 방지
  try { await safeSetEx(cacheKey, CACHE_TTL, JSON.stringify({ list: result })); } catch { /* 무시 */ }
  return result;
}

// jp: 섹션 1개를 찾기 위한 탐색 순서 생성
// jp: ① 클릭한 공시의 (year, reprtCode) 최우선
// jp: ② 같은 연도의 다른 보고서코드
// jp: ③ 과거 연도(YEARS_TRY) × 보고서코드
// jp: 반환: 데이터가 나온 첫 조합 + 메타(클릭 공시 일치 여부)
async function fetchWithContext<T>(
  endpoint: string,
  corpCode: string,
  ctx: ReportContext,
  budget?: CallBudget
): Promise<{ list: T[]; meta: SectionMeta } | null> {
  const thisYear = new Date().getFullYear();

  // jp: 탐색 순서 구성 — 클릭 공시 우선
  const attempts: Array<{ year: number; code: string; isContext: boolean }> = [];

  // jp: ① 클릭한 공시의 정확한 연도 + 보고서코드
  if (ctx.year && ctx.reprtCode) {
    attempts.push({ year: ctx.year, code: ctx.reprtCode, isContext: true });
  }
  // jp: ② 클릭 공시 연도의 다른 보고서코드 (사업보고서 우선)
  if (ctx.year) {
    for (const code of REPRT_CODES) {
      if (code !== ctx.reprtCode) {
        attempts.push({ year: ctx.year, code, isContext: true });
      }
    }
  }
  // jp: ③ 과거 연도 fallback (최근 → 과거 순, 사업보고서 우선)
  for (let i = 1; i <= YEARS_TRY; i++) {
    const year = thisYear - i;
    if (year === ctx.year) continue; // jp: 이미 위에서 시도함
    for (const code of REPRT_CODES) {
      attempts.push({ year, code, isContext: false });
    }
  }

  // jp: 순차 탐색 — 첫 데이터 발견 시 즉시 반환 (이미 채워진 섹션은 더 호출 안 함)
  for (const { year, code, isContext } of attempts) {
    const list = await fetchOne<T>(endpoint, corpCode, year, code, budget);
    if (list && list.length > 0) {
      return {
        list,
        meta: {
          sourceYear: year,
          sourceReprtCode: code,
          isFallback: !isContext,
        },
      };
    }
    // jp: 상한 도달 시 더 이상 탐색 안 함
    if (budget && budget.calls >= budget.limit) break;
  }
  return null;
}

// jp: [구버전 호환] 컨텍스트 없이 최근 데이터 탐색 — getXxx(corpCode) 단독 호출용
async function fetchLatest<T>(
  endpoint: string,
  corpCode: string
): Promise<{ year: number; list: T[] } | null> {
  const r = await fetchWithContext<T>(endpoint, corpCode, { year: null, reprtCode: null });
  if (!r || r.meta.sourceYear === null) return null;
  return { year: r.meta.sourceYear, list: r.list };
}

async function withCache<T>(key: string, fn: () => Promise<T>): Promise<T> {
  try {
    const c = await safeGet(key);
    if (c) return JSON.parse(c) as T;
  } catch { /* 캐시 무시 */ }
  const result = await fn();
  try { await safeSetEx(key, CACHE_TTL, JSON.stringify(result)); } catch { /* 캐시 무시 */ }
  return result;
}

// ============================================================
// 타법인 출자현황
// ============================================================
export interface InvestmentItem {
  corpName: string;
  purpose: string;
  amount: string;
  quantity: string;
  ratio: string;
}
export async function getInvestments(corpCode: string, ctx?: ReportContext, budget?: CallBudget) {
  const empty = { items: [] as InvestmentItem[], year: null as number | null, meta: null as SectionMeta | null };
  if (!ENV.DART?.API_KEY || !corpCode) return empty;
  const c = ctx || { year: null, reprtCode: null };
  return withCache(`dart:invest:${corpCode}:${c.year ?? 'x'}:${c.reprtCode ?? 'x'}`, async () => {
    const r = await fetchWithContext<Record<string, string>>('otrCprInvstmntSttus', corpCode, c, budget);
    if (!r) return empty;
    const items: InvestmentItem[] = r.list.map((x) => ({
      corpName: num(x.inv_prm),
      purpose:  num(x.invstmnt_purps),
      amount:   num(x.trmend_blce_acntbk_amount) || num(x.bsis_blce_acntbk_amount),
      quantity: num(x.trmend_blce_qy) || num(x.bsis_blce_qy),
      ratio:    num(x.trmend_blce_qota_rt) || num(x.bsis_blce_qota_rt),
    })).filter((x) => x.corpName);
    return { items, year: r.meta.sourceYear, meta: r.meta };
  });
}

// ============================================================
// 최대주주 현황
// ============================================================
export interface ShareholderItem {
  name: string;
  relate: string;
  stockKind: string;
  quantity: string;
  ratio: string;
}
export async function getMajorShareholders(corpCode: string, ctx?: ReportContext, budget?: CallBudget) {
  const empty = { items: [] as ShareholderItem[], year: null as number | null, meta: null as SectionMeta | null };
  if (!ENV.DART?.API_KEY || !corpCode) return empty;
  const c = ctx || { year: null, reprtCode: null };
  return withCache(`dart:majorsh:${corpCode}:${c.year ?? 'x'}:${c.reprtCode ?? 'x'}`, async () => {
    const r = await fetchWithContext<Record<string, string>>('hyslrSttus', corpCode, c, budget);
    if (!r) return empty;
    const items: ShareholderItem[] = r.list.map((x) => ({
      name:      num(x.nm),
      relate:    num(x.relate),
      stockKind: num(x.stock_knd),
      quantity:  num(x.trmend_posesn_stock_co),
      ratio:     num(x.trmend_posesn_stock_qota_rt),
    })).filter((x) => x.name);
    return { items, year: r.meta.sourceYear, meta: r.meta };
  });
}

// ============================================================
// 주식의 총수
// ============================================================
export interface StockTotalItem {
  kind: string;
  issuedTotal: string;
  treasury: string;
  distributed: string;
}
export async function getStockTotal(corpCode: string, ctx?: ReportContext, budget?: CallBudget) {
  const empty = { items: [] as StockTotalItem[], year: null as number | null, meta: null as SectionMeta | null };
  if (!ENV.DART?.API_KEY || !corpCode) return empty;
  const c = ctx || { year: null, reprtCode: null };
  return withCache(`dart:stocktot:${corpCode}:${c.year ?? 'x'}:${c.reprtCode ?? 'x'}`, async () => {
    const r = await fetchWithContext<Record<string, string>>('stockTotqySttus', corpCode, c, budget);
    if (!r) return empty;
    const items: StockTotalItem[] = r.list.map((x) => ({
      kind:        num(x.se),
      issuedTotal: num(x.istc_totqy) || num(x.now_to_isu_stock_totqy),
      treasury:    num(x.tesstk_co),
      distributed: num(x.distb_stock_co),
    })).filter((x) => x.kind && x.kind !== '-');
    return { items, year: r.meta.sourceYear, meta: r.meta };
  });
}

// ============================================================
// 배당에 관한 사항
// ============================================================
export interface DividendItem {
  label: string;
  thisYear: string;
  prevYear: string;
  prev2Year: string;
}
export async function getDividends(corpCode: string, ctx?: ReportContext, budget?: CallBudget) {
  const empty = { items: [] as DividendItem[], year: null as number | null, meta: null as SectionMeta | null };
  if (!ENV.DART?.API_KEY || !corpCode) return empty;
  const c = ctx || { year: null, reprtCode: null };
  return withCache(`dart:dividend:${corpCode}:${c.year ?? 'x'}:${c.reprtCode ?? 'x'}`, async () => {
    const r = await fetchWithContext<Record<string, string>>('alotMatter', corpCode, c, budget);
    if (!r) return empty;
    const items: DividendItem[] = r.list.map((x) => ({
      label:     num(x.se),
      thisYear:  num(x.thstrm),
      prevYear:  num(x.frmtrm),
      prev2Year: num(x.lwfr),
    })).filter((x) => x.label && x.label !== '-');
    return { items, year: r.meta.sourceYear, meta: r.meta };
  });
}

// ============================================================
// 소액주주 현황
// ============================================================
export interface MinorityItem {
  label: string;
  shareholders: string;
  quantity: string;
  ratio: string;
}
export async function getMinorityShareholders(corpCode: string, ctx?: ReportContext, budget?: CallBudget) {
  const empty = { items: [] as MinorityItem[], year: null as number | null, meta: null as SectionMeta | null };
  if (!ENV.DART?.API_KEY || !corpCode) return empty;
  const c = ctx || { year: null, reprtCode: null };
  return withCache(`dart:minority:${corpCode}:${c.year ?? 'x'}:${c.reprtCode ?? 'x'}`, async () => {
    const r = await fetchWithContext<Record<string, string>>('mrhlSttus', corpCode, c, budget);
    if (!r) return empty;
    const items: MinorityItem[] = r.list.map((x) => ({
      label:        num(x.se),
      shareholders: num(x.shrholdr_co),
      quantity:     num(x.hold_stock_co),
      ratio:        num(x.hold_stock_rate),
    })).filter((x) => x.label && x.label !== '-');
    return { items, year: r.meta.sourceYear, meta: r.meta };
  });
}

// ============================================================
// jp: 5개 타입 한 번에 병렬 조회 (프론트에서 단일 API 호출용)
// ============================================================
export async function getAllReportInfo(corpCode: string, ctx?: ReportContext) {
  const c = ctx || { year: null, reprtCode: null };
  if (!ENV.DART?.API_KEY || !corpCode) {
    return {
      investments: [] as InvestmentItem[],
      majorShareholders: [] as ShareholderItem[],
      stockTotal: [] as StockTotalItem[],
      dividends: [] as DividendItem[],
      minority: [] as MinorityItem[],
      bonds: [] as UnredeemedBondItem[],
      bondDetails: [] as BondDetailItem[],
      creditRating: null as CreditRatingResult | null,
      financials: { consolidated: null, separate: null, year: null, reportName: '' } as FinancialsResult,
      auditOpinion: { opinion: '', auditor: '', emphasis: '', year: null } as AuditOpinionResult,
      year: null as number | null,
      // jp: 클릭한 공시 컨텍스트 (프론트 표시용)
      context: c,
      // jp: 섹션별 출처 메타 (어느 연도/보고서에서 가져왔는지, fallback인지)
      sectionMeta: {} as Record<string, SectionMeta | null>,
    };
  }

  // jp: 요청 1건당 DART 호출 예산 (5개 섹션 합산)
  // jp: 캐시 히트는 카운트 안 함. 상한 초과 시 fetchOne이 조기 중단
  const budget = newBudget(40);

  // jp: Promise.allSettled — 한 섹션 실패가 전체를 무너뜨리지 않게 격리
  const [inv, major, stock, div, minor, bonds, fin, audit, bondDetails, creditRating] =
    await Promise.allSettled([
      getInvestments(corpCode, c, budget),
      getMajorShareholders(corpCode, c, budget),
      getStockTotal(corpCode, c, budget),
      getDividends(corpCode, c, budget),
      getMinorityShareholders(corpCode, c, budget),
      getUnredeemedBonds(corpCode),
      getFinancials(corpCode),
      getAuditOpinion(corpCode),
      getBondDetails(corpCode),
      getCreditRating(corpCode),
    ]);

  // jp: settled 결과에서 값 추출 (실패 시 빈값)
  const v = <T>(r: PromiseSettledResult<T>, fallback: T): T =>
    r.status === 'fulfilled' ? r.value : fallback;

  const invV    = v(inv,    { items: [] as InvestmentItem[], year: null, meta: null });
  const majorV  = v(major,  { items: [] as ShareholderItem[], year: null, meta: null });
  const stockV  = v(stock,  { items: [] as StockTotalItem[], year: null, meta: null });
  const divV    = v(div,    { items: [] as DividendItem[], year: null, meta: null });
  const minorV  = v(minor,  { items: [] as MinorityItem[], year: null, meta: null });
  const bondsV  = v(bonds,  { items: [] as UnredeemedBondItem[], year: null });
  const finV    = v(fin,    { consolidated: null, separate: null, year: null, reportName: '' } as FinancialsResult);
  const auditV  = v(audit,  { opinion: '', auditor: '', emphasis: '', year: null } as AuditOpinionResult);
  const bondDV  = v(bondDetails, { items: [] as BondDetailItem[] });
  const creditV = v(creditRating, null as CreditRatingResult | null);

  // jp: fallback으로 채워진 섹션 목록 (디버그/모니터링용)
  const fallbackSections = Object.entries({
    investments: invV.meta,
    majorShareholders: majorV.meta,
    stockTotal: stockV.meta,
    dividends: divV.meta,
    minority: minorV.meta,
  })
    .filter(([, m]) => m?.isFallback)
    .map(([k, m]) => `${k}(${m?.sourceYear})`);

  // jp: 요청당 DART 호출 수 디버그 로그
  console.log(
    `[ReportInfo] corp=${corpCode} ctx=${c.year ?? '-'}/${c.reprtCode ?? '-'} ` +
    `DART호출=${budget.calls} 캐시히트=${budget.cacheHits} ` +
    `fallback=[${fallbackSections.join(', ') || '없음'}]`
  );

  return {
    investments: invV.items,
    majorShareholders: majorV.items,
    stockTotal: stockV.items,
    dividends: divV.items,
    minority: minorV.items,
    bonds: bondsV.items,
    bondDetails: bondDV.items,
    creditRating: creditV,
    financials: finV,
    auditOpinion: auditV,
    year: invV.year || majorV.year || stockV.year || divV.year || minorV.year || finV.year || null,
    // jp: 클릭한 공시 컨텍스트
    context: c,
    // jp: 섹션별 출처 메타 — 화면에서 "이 데이터는 2024년 보고서 기준" 같은 표시 가능
    sectionMeta: {
      investments: invV.meta,
      majorShareholders: majorV.meta,
      stockTotal: stockV.meta,
      dividends: divV.meta,
      minority: minorV.meta,
    } as Record<string, SectionMeta | null>,
    // jp: DART 호출 통계 (디버그/모니터링)
    callStats: {
      dartCalls: budget.calls,
      cacheHits: budget.cacheHits,
      combos: budget.combos,
      fallbackSections,
    },
  };
}

// ============================================================
// jp: 재무제표 3종 (매출·영업이익·순이익) — 연결(CFS) + 개별(OFS)
// ============================================================
export interface FinancialTriple {
  revenue: string;        // 매출액
  operatingProfit: string;// 영업이익
  netIncome: string;      // 당기순이익
}
export interface FinancialsResult {
  consolidated: FinancialTriple | null; // 연결
  separate: FinancialTriple | null;     // 개별(별도)
  year: number | null;
  reportName: string;     // 사업보고서/분기보고서 등
}

// jp: account_nm으로 매출/영익/순익 추출 (IS 우선, 중복 시 첫 값)
function pickTriple(list: Array<Record<string, string>>): FinancialTriple | null {
  const find = (re: RegExp, sjPrefer?: string) => {
    // jp: sj_div=IS 우선, 없으면 아무거나
    const matches = list.filter((x) => re.test((x.account_nm || '').replace(/\s/g, '')));
    if (matches.length === 0) return '';
    const isRow = matches.find((x) => x.sj_div === 'IS') || matches[0];
    return num(isRow.thstrm_amount);
  };
  const revenue = find(/^매출액$|^수익\(매출액\)$|^영업수익$/);
  const operatingProfit = find(/^영업이익$|^영업이익\(손실\)$/);
  const netIncome = find(/^당기순이익$|^당기순이익\(손실\)$/);
  if (!revenue && !operatingProfit && !netIncome) return null;
  return { revenue, operatingProfit, netIncome };
}

async function fetchFinancialsByFsDiv(
  corpCode: string,
  year: number,
  reprtCode: string,
  fsDiv: string
): Promise<FinancialTriple | null> {
  try {
    const res = await axios.get(`${BASE}/fnlttSinglAcntAll.json`, {
      params: {
        crtfc_key: ENV.DART.API_KEY, corp_code: corpCode,
        bsns_year: String(year), reprt_code: reprtCode, fs_div: fsDiv,
      },
      timeout: TIMEOUT,
    });
    const data = res.data as { status: string; list?: Array<Record<string, string>> };
    if (data.status === '000' && Array.isArray(data.list) && data.list.length > 0) {
      return pickTriple(data.list);
    }
    return null;
  } catch {
    return null;
  }
}

const REPRT_NAMES: Record<string, string> = {
  '11011': '사업보고서', '11014': '3분기보고서', '11012': '반기보고서', '11013': '1분기보고서',
};

export async function getFinancials(corpCode: string): Promise<FinancialsResult> {
  const empty: FinancialsResult = { consolidated: null, separate: null, year: null, reportName: '' };
  if (!ENV.DART?.API_KEY || !corpCode) return empty;
  return withCache(`dart:financials:${corpCode}`, async () => {
    const thisYear = new Date().getFullYear();
    for (let i = 1; i <= YEARS_TRY; i++) {
      const year = thisYear - i;
      for (const code of REPRT_CODES) {
        // jp: 연결 먼저 시도
        const cfs = await fetchFinancialsByFsDiv(corpCode, year, code, 'CFS');
        const ofs = await fetchFinancialsByFsDiv(corpCode, year, code, 'OFS');
        if (cfs || ofs) {
          return { consolidated: cfs, separate: ofs, year, reportName: REPRT_NAMES[code] || '' };
        }
      }
    }
    return empty;
  });
}

// ============================================================
// jp: 감사의견
// ============================================================
export interface AuditOpinionResult {
  opinion: string;   // 적정의견 등
  auditor: string;   // 회계법인
  emphasis: string;  // 강조사항
  year: number | null;
}
export async function getAuditOpinion(corpCode: string): Promise<AuditOpinionResult> {
  const empty: AuditOpinionResult = { opinion: '', auditor: '', emphasis: '', year: null };
  if (!ENV.DART?.API_KEY || !corpCode) return empty;
  return withCache(`dart:audit:${corpCode}`, async () => {
    const r = await fetchLatest<Record<string, string>>('accnutAdtorNmNdAdtOpinion', corpCode);
    if (!r || r.list.length === 0) return empty;
    const row = r.list[0];
    return {
      opinion:  num(row.adt_opinion),
      auditor:  num(row.adtor),
      emphasis: num(row.emphs_matter),
      year: r.year,
    };
  });
}

// ============================================================
// jp: 미상환 사채 (전환사채 CB + 신주인수권부사채 BW) 통합
// ============================================================
export interface UnredeemedBondItem {
  type: string;       // 전환사채(CB) / 신주인수권부사채(BW)
  category: string;   // 공모 / 사모
  total: string;      // 미상환 잔액 합계
  within1y: string;   // 1년 이내 만기
}
export interface UnredeemedBondsResult {
  items: UnredeemedBondItem[];
  year: number | null;
}

async function fetchBond(
  endpoint: string,
  typeLabel: string,
  corpCode: string
): Promise<{ year: number; items: UnredeemedBondItem[] } | null> {
  const thisYear = new Date().getFullYear();
  for (let i = 1; i <= YEARS_TRY; i++) {
    const year = thisYear - i;
    for (const code of REPRT_CODES) {
      try {
        const res = await axios.get(`${BASE}/${endpoint}.json`, {
          params: { crtfc_key: ENV.DART.API_KEY, corp_code: corpCode, bsns_year: String(year), reprt_code: code },
          timeout: TIMEOUT,
        });
        const data = res.data as { status: string; list?: Array<Record<string, string>> };
        if (data.status === '000' && Array.isArray(data.list) && data.list.length > 0) {
          const items = data.list
            .map((x) => ({
              type: typeLabel,
              category: num(x.remndr_exprtn2),
              total: num(x.sm),
              within1y: num(x.yy1_below),
            }))
            .filter((x) => x.total && x.total !== '-');
          if (items.length > 0) return { year, items };
        }
      } catch { /* 다음 시도 */ }
    }
  }
  return null;
}

export async function getUnredeemedBonds(corpCode: string): Promise<UnredeemedBondsResult> {
  const empty: UnredeemedBondsResult = { items: [], year: null };
  if (!ENV.DART?.API_KEY || !corpCode) return empty;
  return withCache(`dart:bonds:${corpCode}`, async () => {
    const [cb, bw] = await Promise.all([
      fetchBond('cprndNrdmpBlce', '전환사채(CB)', corpCode),
      fetchBond('bdNrdmpBlce', '신주인수권부사채(BW)', corpCode),
    ]);
    const items = [...(cb?.items ?? []), ...(bw?.items ?? [])];
    return { items, year: cb?.year ?? bw?.year ?? null };
  });
}

// ============================================================
// jp: 전환사채(CB)·신주인수권부사채(BW) 발행결정 상세
// jp: 회차/발행일/만기/전환가/리픽싱 하한 등 — bgn_de/end_de 기간 방식 API
// ============================================================
export interface BondDetailItem {
  type: string;          // 전환사채(CB) / 신주인수권부사채(BW)
  round: string;         // 회차 (bd_tm)
  kind: string;          // 사채 종류 (bd_knd)
  amount: string;        // 발행금액 (bd_fta)
  issueDate: string;     // 발행일 (sbd)
  maturityDate: string;  // 만기일 (bd_mtd)
  conversionPrice: string;    // 전환가액/행사가액 (cv_prc / ex_pr)
  refixFloor: string;    // 리픽싱 최저 전환가 (act_mktprcfl_cvprc_lwtrsprc)
  convertStart: string;  // 전환청구 시작 (cvrqpd_bgd / es_rs_pd_bgd)
  convertEnd: string;    // 전환청구 종료 (cvrqpd_edd / es_rs_pd_edd)
  surfRate: string;      // 표면이율 (bd_intr_ex)
  matRate: string;       // 만기이율 (bd_intr_sf)
}
export interface BondDetailsResult {
  items: BondDetailItem[];
}

function clampDate(s: string): string {
  // jp: "2026년 04월 05일" → "2026.04.05"
  const m = (s || '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (m) return `${m[1]}.${m[2].padStart(2, '0')}.${m[3].padStart(2, '0')}`;
  return s && s !== '-' ? s : '';
}

async function fetchBondDecision(
  endpoint: string,
  typeLabel: string,
  corpCode: string
): Promise<BondDetailItem[]> {
  try {
    const thisYear = new Date().getFullYear();
    const bgn = `${thisYear - 4}0101`;
    const end = `${thisYear}1231`;
    const res = await axios.get(`${BASE}/${endpoint}.json`, {
      params: { crtfc_key: ENV.DART.API_KEY, corp_code: corpCode, bgn_de: bgn, end_de: end },
      timeout: TIMEOUT,
    });
    const data = res.data as { status: string; list?: Array<Record<string, string>> };
    if (data.status !== '000' || !Array.isArray(data.list)) return [];
    return data.list.map((x) => ({
      type: typeLabel,
      round: num(x.bd_tm),
      kind: num(x.bd_knd),
      amount: num(x.bd_fta),
      issueDate: clampDate(x.sbd),
      maturityDate: clampDate(x.bd_mtd),
      // jp: CB는 cv_prc, BW는 ex_pr 또는 exavivppc
      conversionPrice: num(x.cv_prc) || num(x.ex_pr) || num(x.exavivppc),
      refixFloor: num(x.act_mktprcfl_cvprc_lwtrsprc) || num(x.act_mktprcfl_exprc_lwtrsprc),
      convertStart: clampDate(x.cvrqpd_bgd || x.expd_bgd || x.es_rs_pd_bgd),
      convertEnd: clampDate(x.cvrqpd_edd || x.expd_edd || x.es_rs_pd_edd),
      surfRate: num(x.bd_intr_ex),
      matRate: num(x.bd_intr_sf),
    }));
  } catch {
    return [];
  }
}

export async function getBondDetails(corpCode: string): Promise<BondDetailsResult> {
  if (!ENV.DART?.API_KEY || !corpCode) return { items: [] };
  return withCache(`dart:bonddetail:${corpCode}`, async () => {
    const [cb, bw] = await Promise.all([
      fetchBondDecision('cvbdIsDecsn', '전환사채(CB)', corpCode),
      fetchBondDecision('bdwtIsDecsn', '신주인수권부사채(BW)', corpCode),
    ]);
    return { items: [...cb, ...bw] };
  });
}

// ============================================================
// jp: 신용등급 (채무증권 발행실적 detScritsIsuAcmslt의 evl_grad_instt)
// jp: 회사채 발행 시 신용평가 결과 — 가장 최근 발행분의 등급 사용
// ============================================================
export interface CreditRatingResult {
  grade: string;   // 예: B+
  agency: string;  // 예: 나이스신용평가
  raw: string;     // 원본 "B+ (나이스신용평가)"
  issueDate: string;
}

// jp: "B+ (나이스신용평가)" → { grade: 'B+', agency: '나이스신용평가' }
function parseCreditGrade(raw: string): { grade: string; agency: string } {
  const s = (raw || '').trim();
  if (!s || s === '-') return { grade: '', agency: '' };
  // jp: 등급은 보통 AAA/AA+/A/BBB+/BB/B+/CCC/C/D 형태
  const gm = s.match(/(AAA|AA[+-]?|A[+-]?|BBB[+-]?|BB[+-]?|B[+-]?|CCC[+-]?|CC[+-]?|C[+-]?|D)\b/);
  const am = s.match(/\(([^)]+)\)/);
  return {
    grade: gm ? gm[1] : '',
    agency: am ? am[1].trim() : '',
  };
}

export async function getCreditRating(corpCode: string): Promise<CreditRatingResult | null> {
  if (!ENV.DART?.API_KEY || !corpCode) return null;
  return withCache(`dart:credit:${corpCode}`, async () => {
    const thisYear = new Date().getFullYear();
    // jp: 최근 연도부터 역순으로, 등급이 실제 있는 가장 최근 발행분 탐색
    let best: CreditRatingResult | null = null;
    for (let i = 0; i <= YEARS_TRY; i++) {
      const year = thisYear - i;
      try {
        const res = await axios.get(`${BASE}/detScritsIsuAcmslt.json`, {
          params: { crtfc_key: ENV.DART.API_KEY, corp_code: corpCode, bsns_year: String(year), reprt_code: '11011' },
          timeout: TIMEOUT,
        });
        const data = res.data as { status: string; list?: Array<Record<string, string>> };
        if (data.status !== '000' || !Array.isArray(data.list)) continue;
        // jp: evl_grad_instt에 실제 등급이 있는 행만
        for (const row of data.list) {
          const rawGrade = (row.evl_grad_instt || '').trim();
          if (!rawGrade || rawGrade === '-') continue;
          const { grade, agency } = parseCreditGrade(rawGrade);
          if (!grade) continue;
          const issueDate = (row.isu_de || '').trim();
          // jp: 가장 최근 발행일의 등급 선택
          if (!best || issueDate > best.issueDate) {
            best = { grade, agency, raw: rawGrade, issueDate };
          }
        }
        // jp: 해당 연도에서 등급을 찾았으면 더 과거는 안 봐도 됨 (최신 우선)
        if (best) break;
      } catch { /* 다음 연도 */ }
    }
    return best;
  });
}
