// jp: DART 자본금 변동사항 서비스 (증자/감자 현황)
// jp: DART OpenAPI DS002 - irdsSttus.json
// jp: ★ 이 API는 사업보고서 기반: corp_code + bsns_year(연도) + reprt_code(11011=사업보고서)
// jp:    날짜범위(bgn_de/end_de)가 아님. 최근 N개 연도를 각각 조회해서 합친다.
// jp: 캐시(Redis 24h) → DART API(연도별 병렬) → 정제 반환

import axios from 'axios';
import { ENV } from '../../config/env';
import { safeGet, safeSetEx } from '../../config/redis';

const DART_URL = 'https://opendart.fss.or.kr/api/irdsSttus.json';
const REPRT_CODE = '11011'; // jp: 사업보고서
const CACHE_TTL = 60 * 60 * 24; // 24h
const YEARS_BACK = 5;

export interface CapitalChangeItem {
  date: string;       // 주식발행/감소 일자 (YYYY-MM-DD 또는 원문)
  type: string;       // 발행 형태 (유상증자, 무상증자, 전환권행사, 주식배당, 유상감자, 무상감자 등)
  stockKind: string;  // 주식의 종류
  quantity: string;   // 수량
  issuePrice: string; // 주당 발행/감소 금액
  direction: 'up' | 'down' | 'neutral'; // 증자=up, 감자=down, 기타=neutral
}

export interface CapitalHistoryResult {
  corpCode: string;
  corpName: string;
  items: CapitalChangeItem[];
  cached?: boolean;
}

interface DartRow {
  corp_name?: string;
  isu_dcrs_de?: string;             // 주식발행 감소일자
  isu_dcrs_stle?: string;           // 발행 감소 형태
  isu_dcrs_stock_knd?: string;      // 발행 감소 주식 종류
  isu_dcrs_qy?: string;             // 발행 감소 수량
  isu_dcrs_mstvdv_fval_amount?: string;  // 발행 감소 주당 액면가액
  isu_dcrs_mstvdv_amount?: string;       // 발행 감소 주당 발행 감소 가액
}

function classifyDirection(type: string): 'up' | 'down' | 'neutral' {
  if (!type) return 'neutral';
  if (type.includes('감자') || type.includes('소각') || type.includes('감소')) return 'down';
  if (type.includes('증자') || type.includes('전환') || type.includes('배당') || type.includes('행사') || type.includes('합병') || type.includes('분할')) return 'up';
  return 'neutral';
}

function formatDate(raw: string): string {
  if (!raw) return '';
  // jp: DART는 'YYYY.MM.DD' 또는 'YYYYMMDD' 등 다양 → 숫자만 추출해 표준화
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.length >= 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }
  return raw.trim();
}

// jp: 단일 연도 조회
async function fetchYear(corpCode: string, year: number): Promise<{ corpName: string; rows: DartRow[] } | null> {
  try {
    const res = await axios.get(DART_URL, {
      params: {
        crtfc_key:  ENV.DART.API_KEY,
        corp_code:  corpCode,
        bsns_year:  String(year),
        reprt_code: REPRT_CODE,
      },
      timeout: 15000,
    });
    const data = res.data as { status: string; message?: string; list?: DartRow[] };
    // jp: 013=데이터 없음(정상), 000=정상. 그 외는 무시(빈 결과)
    if (data.status !== '000' || !Array.isArray(data.list)) {
      return { corpName: '', rows: [] };
    }
    return {
      corpName: data.list[0]?.corp_name || '',
      rows: data.list,
    };
  } catch (err) {
    console.warn(`[자본금변동] ${year}년 조회 실패:`, err instanceof Error ? err.message : err);
    return null;
  }
}

export async function getCapitalHistory(corpCode: string): Promise<CapitalHistoryResult | null> {
  if (!ENV.DART?.API_KEY) return null;
  if (!corpCode || corpCode.trim().length === 0) return null;

  const cacheKey = `dart:capital:${corpCode}`;

  // jp: Redis 캐시
  try {
    const cached = await safeGet(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as CapitalHistoryResult;
      parsed.cached = true;
      return parsed;
    }
  } catch { /* 무시 */ }

  // jp: 최근 N개 연도 병렬 조회 (사업보고서는 다음 해 3월 제출 → 작년 데이터가 최신)
  const thisYear = new Date().getFullYear();
  const years: number[] = [];
  for (let i = 1; i <= YEARS_BACK; i++) years.push(thisYear - i);

  const results = await Promise.all(years.map((y) => fetchYear(corpCode, y)));

  // jp: 모든 연도 실패(네트워크 등) → null. 일부만 성공/빈결과 → 정상 처리
  if (results.every((r) => r === null)) return null;

  let corpName = '';
  const allRows: DartRow[] = [];
  for (const r of results) {
    if (!r) continue;
    if (!corpName && r.corpName) corpName = r.corpName;
    allRows.push(...r.rows);
  }

  // jp: 중복 제거 (같은 일자+형태+수량은 여러 연도 보고서에 중복 등재됨)
  const seen = new Set<string>();
  const items: CapitalChangeItem[] = [];
  for (const r of allRows) {
    const date = formatDate(r.isu_dcrs_de || '');
    const type = (r.isu_dcrs_stle || '-').trim();
    const qty  = (r.isu_dcrs_qy || '-').trim();
    const key = `${date}|${type}|${qty}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // jp: '-' 같은 헤더성/빈 행 스킵 (날짜 없거나 형태가 '-'/'해당없음'이면 제외)
    const typeClean = type.replace(/[\s-]/g, '');
    if (!date || !typeClean || typeClean === '해당없음' || typeClean === '해당사항없음') continue;

    items.push({
      date,
      type:       type || '-',
      stockKind:  (r.isu_dcrs_stock_knd || '').trim(),
      quantity:   qty,
      issuePrice: (r.isu_dcrs_mstvdv_amount || '-').trim(),
      direction:  classifyDirection(type),
    });
  }

  // jp: 최신순 정렬
  items.sort((a, b) => b.date.localeCompare(a.date));

  const result: CapitalHistoryResult = { corpCode, corpName, items };
  try { await safeSetEx(cacheKey, CACHE_TTL, JSON.stringify(result)); } catch { /* 무시 */ }
  return result;
}