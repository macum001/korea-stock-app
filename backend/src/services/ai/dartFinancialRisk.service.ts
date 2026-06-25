// jp: DART 재무 기반 자본잠식·상장폐지 위험 판정 서비스
// jp: fnlttSinglAcntAll(전체 재무제표)에서 자본금/자본총계/부채총계/영업손익 추출
// jp: ★ sj_nm='재무상태표'인 계정만 사용 (자본변동표에도 자본총계가 여러개 있어 오염 주의)
// jp: ★ 판정 기준/문구는 promptStore의 financial_risk_config(JSON)에서 읽음. DB 없으면 코드 기본값.
// jp: 캐시(Redis 24h). 주가 조건(1000원/500원)은 프론트에서 합산.

import axios from 'axios';
import { ENV } from '../../config/env';
import { safeGet, safeSetEx } from '../../config/redis';
import { getPrompt } from './promptStore.service';

const URL = 'https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json';
const CACHE_TTL = 60 * 60 * 24;
const YEARS_TRY = 3;

export interface RiskSignal {
  level: 'red' | 'yellow' | 'green';
  text: string;
}

export interface FinancialRiskResult {
  year: number | null;
  fsDiv: string | null;
  capital: number | null;
  totalEquity: number | null;
  totalLiabilities: number | null;
  totalAssets: number | null;
  operatingProfit: number | null;
  impairmentRate: number | null;
  debtRatio: number | null;
  overallLevel: 'red' | 'yellow' | 'green' | 'unknown';
  signals: RiskSignal[];
  cached?: boolean;
}

interface FinRow {
  account_nm?: string;
  sj_nm?: string;
  sj_div?: string;
  thstrm_amount?: string;
}

// jp: 판정 설정 기본값 (DB 비거나 깨질 때 폴백)
interface RiskConfig {
  thresholds: { impairmentRateRed: number; debtRatioWarn: number; operatingLossWarn: boolean };
  messages: {
    fullImpairment: string; impairmentRed: string; impairmentYellow: string;
    impairmentGreen: string; operatingLoss: string; debtHigh: string;
  };
}
const DEFAULT_CONFIG: RiskConfig = {
  thresholds: { impairmentRateRed: 50, debtRatioWarn: 200, operatingLossWarn: true },
  messages: {
    fullImpairment: '완전자본잠식 — 자본총계가 마이너스({equity})입니다. 상장폐지 사유에 해당할 수 있어요.',
    impairmentRed: '자본잠식률 {rate}% — 50% 이상입니다. 2년 연속 시 상장폐지 사유가 될 수 있어요.',
    impairmentYellow: '부분 자본잠식 — 자본잠식률 {rate}%. 자본총계({equity})가 자본금({capital})보다 적어요.',
    impairmentGreen: '자본잠식 없음 — 자본총계({equity})가 자본금({capital})보다 많아요.',
    operatingLoss: '영업손실 {amount} — 영업적자 상태입니다. 4년 연속(코스닥) 시 관리종목 지정 위험이 있어요.',
    debtHigh: '부채비율 {ratio}% — 부채가 자본의 2배를 넘습니다. 재무 건전성에 주의가 필요해요.',
  },
};

// jp: DB(financial_risk_config) 읽어서 파싱. 실패 시 기본값.
async function loadConfig(): Promise<RiskConfig> {
  try {
    const raw = await getPrompt('financial_risk_config');
    if (!raw || !raw.trim()) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<RiskConfig>;
    return {
      thresholds: { ...DEFAULT_CONFIG.thresholds, ...(parsed.thresholds || {}) },
      messages: { ...DEFAULT_CONFIG.messages, ...(parsed.messages || {}) },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

// jp: 문구 자리표시자 치환
function fill(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

function toNum(v: unknown): number | null {
  const s = String(v ?? '').replace(/,/g, '').trim();
  if (!s || s === '-') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function findBS(list: FinRow[], names: string[]): number | null {
  for (const row of list) {
    const sj = row.sj_nm || '';
    const sjDiv = row.sj_div || '';
    if (sj !== '재무상태표' && sjDiv !== 'BS') continue;
    const acc = (row.account_nm || '').replace(/\s/g, '');
    if (names.some((n) => acc === n.replace(/\s/g, ''))) {
      const v = toNum(row.thstrm_amount);
      if (v !== null) return v;
    }
  }
  return null;
}

function findIS(list: FinRow[], names: string[]): number | null {
  for (const row of list) {
    const sj = row.sj_nm || '';
    const sjDiv = row.sj_div || '';
    const isIncome = sj.includes('손익') || sjDiv === 'IS' || sjDiv === 'CIS';
    if (!isIncome) continue;
    const acc = (row.account_nm || '').replace(/\s/g, '');
    if (names.some((n) => acc.includes(n.replace(/\s/g, '')))) {
      const v = toNum(row.thstrm_amount);
      if (v !== null) return v;
    }
  }
  return null;
}

async function fetchFin(corpCode: string, year: number, fsDiv: string): Promise<FinRow[] | null> {
  try {
    const r = await axios.get(URL, {
      params: { crtfc_key: ENV.DART.API_KEY, corp_code: corpCode, bsns_year: String(year), reprt_code: '11011', fs_div: fsDiv },
      timeout: 15000,
    });
    const data = r.data as { status: string; list?: FinRow[] };
    if (data.status === '000' && Array.isArray(data.list) && data.list.length > 0) return data.list;
    return null;
  } catch {
    return null;
  }
}

export async function getFinancialRisk(corpCode: string): Promise<FinancialRiskResult | null> {
  if (!ENV.DART?.API_KEY || !corpCode) return null;

  const cacheKey = `dart:finrisk:${corpCode}`;
  try {
    const c = await safeGet(cacheKey);
    if (c) { const p = JSON.parse(c) as FinancialRiskResult; p.cached = true; return p; }
  } catch { /* 무시 */ }

  const cfg = await loadConfig();

  const thisYear = new Date().getFullYear();
  let list: FinRow[] | null = null;
  let usedYear: number | null = null;
  let usedFs: string | null = null;

  for (let i = 1; i <= YEARS_TRY && !list; i++) {
    const year = thisYear - i;
    for (const fsDiv of ['CFS', 'OFS']) {
      const got = await fetchFin(corpCode, year, fsDiv);
      if (got) { list = got; usedYear = year; usedFs = fsDiv; break; }
    }
  }

  if (!list) return { year: null, fsDiv: null, capital: null, totalEquity: null, totalLiabilities: null, totalAssets: null, operatingProfit: null, impairmentRate: null, debtRatio: null, overallLevel: 'unknown', signals: [] };

  const capital          = findBS(list, ['자본금']);
  const totalEquity      = findBS(list, ['자본총계']);
  const totalLiabilities = findBS(list, ['부채총계']);
  const totalAssets      = findBS(list, ['자산총계']);
  const operatingProfit  = findIS(list, ['영업이익(손실)', '영업이익', '영업손실']);

  let impairmentRate: number | null = null;
  if (capital !== null && capital > 0 && totalEquity !== null) {
    impairmentRate = Math.round(((capital - totalEquity) / capital) * 1000) / 10;
  }
  let debtRatio: number | null = null;
  if (totalLiabilities !== null && totalEquity !== null && totalEquity > 0) {
    debtRatio = Math.round((totalLiabilities / totalEquity) * 1000) / 10;
  }

  const signals: RiskSignal[] = [];
  const eqStr = totalEquity !== null ? fmtEok(totalEquity) : '';
  const capStr = capital !== null ? fmtEok(capital) : '';

  if (totalEquity !== null && totalEquity < 0) {
    signals.push({ level: 'red', text: fill(cfg.messages.fullImpairment, { equity: eqStr, capital: capStr }) });
  } else if (impairmentRate !== null && impairmentRate >= cfg.thresholds.impairmentRateRed) {
    signals.push({ level: 'red', text: fill(cfg.messages.impairmentRed, { rate: String(impairmentRate), equity: eqStr, capital: capStr }) });
  } else if (impairmentRate !== null && impairmentRate > 0) {
    signals.push({ level: 'yellow', text: fill(cfg.messages.impairmentYellow, { rate: String(impairmentRate), equity: eqStr, capital: capStr }) });
  } else if (impairmentRate !== null) {
    signals.push({ level: 'green', text: fill(cfg.messages.impairmentGreen, { equity: eqStr, capital: capStr }) });
  }

  if (cfg.thresholds.operatingLossWarn && operatingProfit !== null && operatingProfit < 0) {
    signals.push({ level: 'yellow', text: fill(cfg.messages.operatingLoss, { amount: fmtEok(operatingProfit) }) });
  }

  if (debtRatio !== null && debtRatio >= cfg.thresholds.debtRatioWarn) {
    signals.push({ level: 'yellow', text: fill(cfg.messages.debtHigh, { ratio: String(debtRatio) }) });
  }

  let overallLevel: 'red' | 'yellow' | 'green' | 'unknown' = 'unknown';
  if (signals.some((s) => s.level === 'red')) overallLevel = 'red';
  else if (signals.some((s) => s.level === 'yellow')) overallLevel = 'yellow';
  else if (signals.some((s) => s.level === 'green')) overallLevel = 'green';

  const result: FinancialRiskResult = {
    year: usedYear, fsDiv: usedFs, capital, totalEquity, totalLiabilities, totalAssets,
    operatingProfit, impairmentRate, debtRatio, overallLevel, signals,
  };
  try { await safeSetEx(cacheKey, CACHE_TTL, JSON.stringify(result)); } catch { /* 무시 */ }
  return result;
}

function fmtEok(won: number): string {
  const eok = won / 100000000;
  if (Math.abs(eok) >= 10000) {
    const jo = eok / 10000;
    return `약 ${jo.toFixed(1)}조 원`;
  }
  if (Math.abs(eok) >= 1) {
    return `약 ${Math.round(eok).toLocaleString()}억 원`;
  }
  const man = won / 10000;
  return `약 ${Math.round(man).toLocaleString()}만 원`;
}
