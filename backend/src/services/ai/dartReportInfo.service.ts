// jp: DART 정기보고서 주요정보 통합 서비스
// jp: 5종: 타법인출자 / 최대주주 / 주식총수 / 배당 / 소액주주
// jp: 모두 corp_code + bsns_year + reprt_code(11011 사업보고서) 방식 → 최근 N년 중 가장 최신 데이터 1건
// jp: 캐시(Redis 24h) → DART API → 정제 반환. {success,data} 래핑은 라우트에서.

import axios from 'axios';
import { ENV } from '../../config/env';
import { safeGet, safeSetEx } from '../../config/redis';

const BASE = 'https://opendart.fss.or.kr/api';
const REPRT = '11011'; // 사업보고서
const CACHE_TTL = 60 * 60 * 24;
const YEARS_TRY = 3; // 최근 3개 연도까지 시도 (가장 최신 데이터 찾기)

// ===== 공통 유틸 =====
function num(v: unknown): string {
  const s = String(v ?? '').trim();
  return s && s !== '-' ? s : '';
}

// jp: 특정 연도 1건 조회 (status 000 + list 있으면 반환, 013 등은 null)
async function fetchYear<T>(endpoint: string, corpCode: string, year: number): Promise<T[] | null> {
  try {
    const res = await axios.get(`${BASE}/${endpoint}.json`, {
      params: { crtfc_key: ENV.DART.API_KEY, corp_code: corpCode, bsns_year: String(year), reprt_code: REPRT },
      timeout: 15000,
    });
    const data = res.data as { status: string; list?: T[] };
    if (data.status === '000' && Array.isArray(data.list) && data.list.length > 0) return data.list;
    return null;
  } catch {
    return null;
  }
}

// jp: 최근 연도부터 내려가며 첫 데이터 있는 연도 반환
async function fetchLatest<T>(endpoint: string, corpCode: string): Promise<{ year: number; list: T[] } | null> {
  const thisYear = new Date().getFullYear();
  for (let i = 1; i <= YEARS_TRY; i++) {
    const year = thisYear - i;
    const list = await fetchYear<T>(endpoint, corpCode, year);
    if (list) return { year, list };
  }
  return null;
}

async function withCache<T>(key: string, fn: () => Promise<T>): Promise<T> {
  try {
    const c = await safeGet(key);
    if (c) return JSON.parse(c) as T;
  } catch { /* 무시 */ }
  const result = await fn();
  try { await safeSetEx(key, CACHE_TTL, JSON.stringify(result)); } catch { /* 무시 */ }
  return result;
}

// ============================================================
// jp: ① 타법인 출자현황
// ============================================================
export interface InvestmentItem {
  corpName: string;   // 법인명
  purpose: string;    // 출자목적
  amount: string;     // 기말 장부가액
  quantity: string;   // 기말 수량
  ratio: string;      // 지분율(%)
}
export async function getInvestments(corpCode: string) {
  if (!ENV.DART?.API_KEY || !corpCode) return { items: [] as InvestmentItem[], year: null as number | null };
  return withCache(`dart:invest:${corpCode}`, async () => {
    const r = await fetchLatest<Record<string, string>>('otrCprInvstmntSttus', corpCode);
    if (!r) return { items: [], year: null };
    const items: InvestmentItem[] = r.list.map((x) => ({
      corpName: num(x.inv_prm),
      purpose:  num(x.invstmnt_purps),
      amount:   num(x.trmend_blce_acntbk_amount) || num(x.bsis_blce_acntbk_amount),
      quantity: num(x.trmend_blce_qy) || num(x.bsis_blce_qy),
      ratio:    num(x.trmend_blce_qota_rt) || num(x.bsis_blce_qota_rt),
    })).filter((x) => x.corpName);
    return { items, year: r.year };
  });
}

// ============================================================
// jp: ② 최대주주 현황
// ============================================================
export interface ShareholderItem {
  name: string;     // 성명
  relate: string;   // 관계
  stockKind: string;// 주식 종류
  quantity: string; // 기말 소유주식수
  ratio: string;    // 기말 지분율(%)
}
export async function getMajorShareholders(corpCode: string) {
  if (!ENV.DART?.API_KEY || !corpCode) return { items: [] as ShareholderItem[], year: null as number | null };
  return withCache(`dart:majorsh:${corpCode}`, async () => {
    const r = await fetchLatest<Record<string, string>>('hyslrSttus', corpCode);
    if (!r) return { items: [], year: null };
    const items: ShareholderItem[] = r.list.map((x) => ({
      name:      num(x.nm),
      relate:    num(x.relate),
      stockKind: num(x.stock_knd),
      quantity:  num(x.trmend_posesn_stock_co),
      ratio:     num(x.trmend_posesn_stock_qota_rt),
    })).filter((x) => x.name);
    return { items, year: r.year };
  });
}

// ============================================================
// jp: ③ 주식의 총수
// ============================================================
export interface StockTotalItem {
  kind: string;       // 주식 종류(구분)
  issuedTotal: string;// 발행 총수
  treasury: string;   // 자기주식수
  distributed: string;// 유통주식수
}
export async function getStockTotal(corpCode: string) {
  if (!ENV.DART?.API_KEY || !corpCode) return { items: [] as StockTotalItem[], year: null as number | null };
  return withCache(`dart:stocktot:${corpCode}`, async () => {
    const r = await fetchLatest<Record<string, string>>('stockTotqySttus', corpCode);
    if (!r) return { items: [], year: null };
    const items: StockTotalItem[] = r.list.map((x) => ({
      kind:        num(x.se),
      issuedTotal: num(x.istc_totqy) || num(x.now_to_isu_stock_totqy),
      treasury:    num(x.tesstk_co),
      distributed: num(x.distb_stock_co),
    })).filter((x) => x.kind && x.kind !== '-');
    return { items, year: r.year };
  });
}

// ============================================================
// jp: ④ 배당에 관한 사항
// ============================================================
export interface DividendItem {
  label: string;   // 구분(주당배당금, 배당성향 등)
  thisYear: string;// 당기
  prevYear: string;// 전기
  prev2Year: string;// 전전기
}
export async function getDividends(corpCode: string) {
  if (!ENV.DART?.API_KEY || !corpCode) return { items: [] as DividendItem[], year: null as number | null };
  return withCache(`dart:dividend:${corpCode}`, async () => {
    const r = await fetchLatest<Record<string, string>>('alotMatter', corpCode);
    if (!r) return { items: [], year: null };
    const items: DividendItem[] = r.list.map((x) => ({
      label:     num(x.se),
      thisYear:  num(x.thstrm),
      prevYear:  num(x.frmtrm),
      prev2Year: num(x.lwfr),
    })).filter((x) => x.label && x.label !== '-');
    return { items, year: r.year };
  });
}

// ============================================================
// jp: ⑤ 소액주주 현황
// ============================================================
export interface MinorityItem {
  label: string;       // 구분
  shareholders: string;// 주주 수
  quantity: string;    // 보유 주식수
  ratio: string;       // 보유 비율(%)
}
export async function getMinorityShareholders(corpCode: string) {
  if (!ENV.DART?.API_KEY || !corpCode) return { items: [] as MinorityItem[], year: null as number | null };
  return withCache(`dart:minority:${corpCode}`, async () => {
    const r = await fetchLatest<Record<string, string>>('mrhlSttus', corpCode);
    if (!r) return { items: [], year: null };
    const items: MinorityItem[] = r.list.map((x) => ({
      label:        num(x.se),
      shareholders: num(x.shrholdr_co),
      quantity:     num(x.hold_stock_co),
      ratio:        num(x.hold_stock_rate),
    })).filter((x) => x.label && x.label !== '-');
    return { items, year: r.year };
  });
}
