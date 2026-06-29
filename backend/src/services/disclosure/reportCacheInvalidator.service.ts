// jp: 공시 유형 기반 정기보고서 캐시 무효화
// jp: 재무 현황에 영향 주는 공시(증자/CB/BW/최대주주변경 등)가 수집되면
// jp: 해당 종목(corpCode)의 dartReportInfo Redis 캐시를 즉시 삭제 → 다음 조회 시 DART 최신 재조회
import { safeDel } from '../../config/redis';

// jp: dartReportInfo.service.ts의 withCache 키와 정확히 일치해야 함
//   dart:invest:{cc}      출자현황
//   dart:majorsh:{cc}     최대주주
//   dart:stocktot:{cc}    주식총수
//   dart:dividend:{cc}    배당이력
//   dart:minority:{cc}    소액주주
//   dart:bonds:{cc}       미상환사채(잔액)
//   dart:bonddetail:{cc}  미상환사채(발행상세)
//   dart:financials:{cc}  재무제표
//   dart:audit:{cc}       감사의견
type CacheKind =
  | 'invest' | 'majorsh' | 'stocktot' | 'dividend' | 'minority'
  | 'bonds' | 'bonddetail' | 'financials' | 'audit';

function keysFor(corpCode: string, kinds: CacheKind[]): string[] {
  return kinds.map((k) => `dart:${k}:${corpCode}`);
}

// jp: 공시 제목 → 무효화할 캐시 종류 매핑 규칙
// jp: 하나의 공시가 여러 캐시에 영향을 줄 수 있음 (예: 유상증자 → 출자·주식총수·재무)
interface Rule { test: RegExp; kinds: CacheKind[]; label: string; }

const RULES: Rule[] = [
  // jp: 증자/감자 → 자본금·주식총수·출자·재무 전반
  {
    test: /증자|감자|신주\s*발행|주식\s*발행|출자|현물출자/,
    kinds: ['invest', 'stocktot', 'financials'],
    label: '증자/감자/출자',
  },
  // jp: 전환사채(CB)
  {
    test: /전환사채|전환\s*사채|CB\b|전환청구|전환가액|전환가격/,
    kinds: ['bonds', 'bonddetail', 'stocktot'],
    label: '전환사채(CB)',
  },
  // jp: 신주인수권부사채(BW)
  {
    test: /신주인수권부사채|신주인수권|BW\b|워런트|행사가액|행사가격/,
    kinds: ['bonds', 'bonddetail', 'stocktot'],
    label: '신주인수권부사채(BW)',
  },
  // jp: 교환사채(EB)·기타 사채
  {
    test: /교환사채|EB\b|사채\s*발행/,
    kinds: ['bonds', 'bonddetail'],
    label: '교환사채/사채',
  },
  // jp: 최대주주 변경·대량보유
  {
    test: /최대주주\s*변경|최대주주등?의?\s*주식|대량보유|경영권|주식등의\s*대량보유/,
    kinds: ['majorsh'],
    label: '최대주주변경',
  },
  // jp: 주식 분할/병합/소각/총수 변동
  {
    test: /주식\s*분할|주식\s*병합|액면\s*분할|액면\s*병합|주식\s*소각|자기주식\s*소각|주식수\s*변동|주식의\s*총수/,
    kinds: ['stocktot'],
    label: '주식총수 변동',
  },
  // jp: 자기주식 취득/처분 → 주식총수(유통주식수)
  {
    test: /자기주식\s*취득|자기주식\s*처분|자사주/,
    kinds: ['stocktot'],
    label: '자기주식',
  },
  // jp: 배당 결정
  {
    test: /배당|현금배당|주식배당|중간배당|결산배당/,
    kinds: ['dividend'],
    label: '배당',
  },
  // jp: 감사보고서·감사의견 → 감사·재무
  {
    test: /감사보고서|감사의견|감사인/,
    kinds: ['audit', 'financials'],
    label: '감사보고서',
  },
  // jp: 실적/결산·정기보고서 → 재무 전반 + 모든 정기보고서 스냅샷
  {
    test: /분기보고서|반기보고서|사업보고서|실적|영업\(잠정\)|결산|매출액\s*또는\s*손익/,
    kinds: ['financials', 'invest', 'majorsh', 'stocktot', 'dividend', 'minority', 'bonds', 'bonddetail', 'audit'],
    label: '정기보고서/실적',
  },
  // jp: 타법인 출자
  {
    test: /타법인|출자증권|지분\s*취득|지분\s*양수|타인에\s*대한\s*출자/,
    kinds: ['invest'],
    label: '타법인 출자',
  },
];

/**
 * jp: 공시 1건의 제목을 보고 영향받는 정기보고서 캐시를 무효화한다.
 * jp: ★ "확정된" 공시만 무효화 — 정정/예고/철회/조회공시 등은 제외
 * @returns 무효화된 캐시 종류 라벨 배열 (로그/디버그용). 매칭 없으면 빈 배열.
 */
export async function invalidateReportCacheForDisclosure(
  corpCode: string | undefined,
  title: string | undefined
): Promise<string[]> {
  if (!corpCode || !title) return [];

  const norm = title.replace(/\s+/g, ' ');

  // jp: ── 확정 아님 → 무효화 스킵 ──
  // jp: 정정/취소/철회: 아직 데이터가 바뀌지 않았거나, 이전 확정본을 되돌리는 것
  const NOT_CONFIRMED = /\(정정\)|정정신고|정정\s*공시|철회|취소|기재정정|첨부정정|단순\s*정정/;
  // jp: 예고/예정/조회: 아직 발생 전 (확정 전)
  const NOT_YET = /예고|예정|조회공시|풍문|미확정|에\s*대한\s*안내|결정\s*예정/;
  if (NOT_CONFIRMED.test(norm) || NOT_YET.test(norm)) {
    return [];
  }

  // jp: ── 확정 신호 확인 ──
  // jp: 수시공시는 "결정/발행결정/취득결정/변경" 등 확정 키워드가 있어야 무효화
  // jp: 정기보고서(분기/반기/사업)는 그 자체로 확정 데이터이므로 예외적으로 통과
  const IS_PERIODIC = /분기보고서|반기보고서|사업보고서/;
  const IS_CONFIRMED_EVENT = /결정|발행결정|취득결정|처분결정|변경|변동|확정|보고|보고서|공고|소각|제출|조정/;
  if (!IS_PERIODIC.test(norm) && !IS_CONFIRMED_EVENT.test(norm)) {
    return [];
  }

  const matchedKinds = new Set<CacheKind>();
  const matchedLabels: string[] = [];

  for (const rule of RULES) {
    if (rule.test.test(norm)) {
      rule.kinds.forEach((k) => matchedKinds.add(k));
      matchedLabels.push(rule.label);
    }
  }

  if (matchedKinds.size === 0) return [];

  const keys = keysFor(corpCode, Array.from(matchedKinds));
  // jp: 병렬 삭제 (safeDel은 Redis 미연결 시 무시되므로 안전)
  await Promise.all(keys.map((k) => safeDel(k)));

  return matchedLabels;
}
