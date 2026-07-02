/**
 * src/utils/disclosureClassify.ts
 * 공시 발행사 유형 분류 · 프론트엔드 유틸리티
 *
 * 우선순위 설계:
 *   IssuerType  : SPC > 코스피 > 코스닥 > 코넥스 > 비상장 > 기타
 *   DisclosureType: 채권/ABS > 증권신고서 > 정기보고서 > 주요사항보고서 > 합병/분할 > 기타
 *
 * 데이터 소스 우선순위:
 *   1순위: 백엔드 issuerType / disclosureType (corp_cls 기반, 정확)
 *   2순위: 백엔드 corpCls (Y/K/N/E)
 *   3순위: 기업명·보고서명 패턴 (fallback)
 */

// ── 타입 ──────────────────────────────────────────────
export type IssuerType =
  | 'kospi'     // 유가증권시장 (corp_cls = Y)
  | 'kosdaq'    // 코스닥       (corp_cls = K)
  | 'konex'     // 코넥스       (corp_cls = N)
  | 'unlisted'  // 비상장       (corp_cls = E 또는 종목코드 없음)
  | 'spc'       // SPC/유동화전문회사 (패턴 감지, 최우선)
  | 'other';

export type DisclosureType =
  | 'bond_abs'                // 채권/ABS         (최우선)
  | 'securities_registration' // 증권신고서
  | 'periodic'                // 정기보고서
  | 'major_event'             // 주요사항보고서
  | 'merger_split'            // 합병/분할
  | 'other';

export interface DisclosureClassification {
  issuerType: IssuerType;
  disclosureType: DisclosureType;
  /** UI에 표시할 배지 라벨 (중복 제거, 최대 2개) */
  badges: string[];
  detailAvailability: {
    hasStructuredReportInfo: boolean;
    reason: string;
  };
}

// ── 라벨 매핑 ─────────────────────────────────────────
export const ISSUER_LABEL: Record<IssuerType, string> = {
  kospi:    '코스피',
  kosdaq:   '코스닥',
  konex:    '코넥스',
  unlisted: '비상장',
  spc:      'SPC/유동화',
  other:    '기타',
};

export const DISCLOSURE_LABEL: Record<DisclosureType, string> = {
  bond_abs:                '채권/ABS',
  securities_registration: '증권신고서',
  periodic:                '정기보고서',
  major_event:             '주요사항보고서',
  merger_split:            '합병/분할',
  other:                   '기타공시',
};

// ── 배지 색상 토큰 ─────────────────────────────────────
export const ISSUER_STYLE: Record<IssuerType, { bg: string; color: string }> = {
  kospi:    { bg: 'rgba(92,138,255,0.15)',  color: '#5C8AFF' },
  kosdaq:   { bg: 'rgba(52,211,153,0.15)',  color: '#34D399' },
  konex:    { bg: 'rgba(43,184,196,0.15)',  color: '#2BB8C4' },
  unlisted: { bg: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' },
  spc:      { bg: 'rgba(251,191,36,0.18)',  color: '#FBBF24' },
  other:    { bg: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' },
};

export const DISCLOSURE_STYLE: Record<DisclosureType, { bg: string; color: string }> = {
  bond_abs:                { bg: 'rgba(251,191,36,0.14)',  color: '#FBBF24' },
  securities_registration: { bg: 'rgba(92,138,255,0.14)',  color: '#5C8AFF' },
  periodic:                { bg: 'rgba(167,139,250,0.15)', color: '#A78BFA' },
  major_event:             { bg: 'rgba(251,146,60,0.14)',  color: '#FB923C' },
  merger_split:            { bg: 'rgba(244,114,182,0.14)', color: '#F472B6' },
  other:                   { bg: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' },
};

// ── SPC 패턴 ──────────────────────────────────────────
// 기업명 패턴 (우선 감지)
const SPC_CORP_RE =
  /유동화전문|자산유동화|ABS유한|제\d+차[^)]*유한|리츠|부동산투자신탁|인프라투자목적회사|유동화회사/;
// 보고서명 패턴 (기업명 미감지 시 fallback)
const SPC_REPORT_RE =
  /자산유동화|유동화증권|주택저당|자산담보부/;

// ── 내부: 발행사 유형 감지 ─────────────────────────────
function _detectIssuerType(params: {
  market?: string | null;   // stock_master.market ('KOSPI' | 'KOSDAQ')
  corpCls?: string | null;
  corpName?: string | null;
  stockCode?: string | null;
  reportName?: string | null;
}): IssuerType {
  const { market, corpCls, corpName, stockCode, reportName } = params;

  // ① SPC 최우선 (어떤 시장이어도 SPC 패턴이면 spc 반환)
  if (
    (corpName   && SPC_CORP_RE.test(corpName)) ||
    (reportName && SPC_REPORT_RE.test(reportName))
  ) return 'spc';

  // ② stock_master.market 기준 (가장 정확 — DB에 직접 저장된 값)
  if (market === 'KOSPI')  return 'kospi';
  if (market === 'KOSDAQ') return 'kosdaq';
  if (market === 'KONEX')  return 'konex';

  // ③ DART corp_cls 기준 (market 없을 때 fallback)
  if (corpCls === 'Y') return 'kospi';
  if (corpCls === 'K') return 'kosdaq';
  if (corpCls === 'N') return 'konex';
  if (corpCls === 'E') return 'unlisted';

  // ④ 6자리 종목코드 없으면 비상장
  if (!stockCode || !/^\d{6}$/.test(stockCode)) return 'unlisted';

  return 'other';
}

// ── 내부: 공시 유형 감지 (우선순위 순) ──────────────────
function _detectDisclosureType(reportName?: string | null): DisclosureType {
  if (!reportName) return 'other';
  // 채권/ABS 최우선 (보고서명에 사채/ABS 등 포함)
  if (/사채|ABS|자산유동화|유동화증권|기업어음|전자단기사채/.test(reportName)) return 'bond_abs';
  if (/증권신고서|투자설명서|일괄신고서/.test(reportName))                  return 'securities_registration';
  if (/^(사업보고서|분기보고서|반기보고서)/.test(reportName))               return 'periodic';
  if (/주요사항보고서/.test(reportName))                                    return 'major_event';
  if (/합병|분할|주식의\s*포괄적\s*교환|포괄적\s*이전/.test(reportName))     return 'merger_split';
  return 'other';
}

// ── 내부: 배지 빌드 (중복 방지) ────────────────────────
function _buildBadges(issuerType: IssuerType, disclosureType: DisclosureType): string[] {
  const issuerLabel = ISSUER_LABEL[issuerType];
  const discLabel   = DISCLOSURE_LABEL[disclosureType];

  // SPC는 공시 유형 배지 생략 (어떤 유형이든 'SPC/유동화' 하나로 충분)
  // - 사업보고서 유동화전문회사 → SPC/유동화 + 정기보고서 중복 방지
  // - 자산유동화계획서 → SPC/유동화 + 채권/ABS 중복 방지
  if (issuerType === 'spc') return [issuerLabel];

  // 'other' 공시 유형은 배지 생략
  if (disclosureType === 'other') return [issuerLabel];

  return [issuerLabel, discLabel];
}

// ── 내부: 안내 문구 ────────────────────────────────────
function _buildReason(issuerType: IssuerType, disclosureType: DisclosureType): string {
  if (issuerType === 'spc')
    return 'SPC/유동화전문회사의 보고서로, 일반 상장사 정기보고서 상세 항목이 제한돼요. AI 분석 또는 DART 원문을 이용해 주세요.';
  if (issuerType === 'unlisted')
    return '비상장 기업의 보고서로, 상장사 기준 상세 항목(재무·주주)이 제공되지 않아요. AI 분석 또는 DART 원문을 이용해 주세요.';

  const isListed = ['kospi', 'kosdaq', 'konex'].includes(issuerType);
  if (isListed && disclosureType === 'periodic')
    return '정기보고서 상세 정보(재무·주주)를 제공할 수 있어요.';
  if (isListed)
    return '이 공시 유형은 상세 항목(재무·주주)을 별도로 제공하지 않아요. AI 분석 또는 DART 원문을 확인해 주세요.';
  if (disclosureType === 'periodic')
    return 'DART 정기보고서 항목을 찾지 못했어요. 원문에는 있을 수 있으니 AI 분석 또는 원문 보기를 이용해 주세요.';

  return 'DART 원문 또는 AI 분석으로 내용을 확인해 주세요.';
}

// ── 메인 함수 (패턴 기반 분류) ─────────────────────────
export function classifyDisclosure(params: {
  market?: string | null;
  corpCls?: string | null;
  corpName?: string | null;
  stockCode?: string | null;
  reportName?: string | null;
}): DisclosureClassification {
  const issuerType     = _detectIssuerType(params);
  const disclosureType = _detectDisclosureType(params.reportName);
  const badges         = _buildBadges(issuerType, disclosureType);

  const isListed = ['kospi', 'kosdaq', 'konex'].includes(issuerType);
  const hasStructuredReportInfo = isListed && disclosureType === 'periodic';

  return {
    issuerType,
    disclosureType,
    badges,
    detailAvailability: {
      hasStructuredReportInfo,
      reason: _buildReason(issuerType, disclosureType),
    },
  };
}

/**
 * Disclosure 객체에서 분류 결과 반환 — 컴포넌트에서 사용
 *
 * 소스 우선순위:
 *   1) disclosure.issuerType (백엔드가 corp_cls 기반으로 내려준 경우 — 가장 정확)
 *   2) disclosure.corpCls   (백엔드가 corpCls만 내려준 경우)
 *   3) stockName / reportName 패턴 (fallback)
 *
 * ⚠️ 이 함수는 Hook이 아닙니다. useMemo 안에서 호출하세요.
 *    const classify = useMemo(() => getDisclosureClassification(disclosure), [disclosure?.receiptNo, ...])
 */
export function getDisclosureClassification(disclosure: {
  // 백엔드 분류 결과 (있으면 최우선 사용)
  issuerType?: IssuerType | string | null;
  disclosureType?: DisclosureType | string | null;
  badges?: string[] | null;
  detailAvailability?: { hasStructuredReportInfo: boolean; reason: string } | null;
  // 원본 필드 (fallback용)
  market?: string | null;      // stock_master.market ('KOSPI'|'KOSDAQ')
  corpCls?: string | null;
  stockName?: string | null;
  stockCode?: string | null;
  reportName?: string | null;
} | null): DisclosureClassification | null {
  if (!disclosure) return null;

  // 1순위: 백엔드가 이미 완전히 분류해서 내려준 경우
  if (disclosure.issuerType && disclosure.disclosureType) {
    // jp: 백엔드 값은 string 타입으로 올 수 있어 좁은 유니온으로 캐스팅
    const it = disclosure.issuerType as IssuerType;
    const dt = disclosure.disclosureType as DisclosureType;
    return {
      issuerType:   it,
      disclosureType: dt,
      badges:       disclosure.badges ?? _buildBadges(it, dt),
      detailAvailability: disclosure.detailAvailability ?? {
        hasStructuredReportInfo: false,
        reason: _buildReason(it, dt),
      },
    };
  }

  // 2·3·4순위: 프론트에서 분류 (market > corpCls > 패턴)
  return classifyDisclosure({
    market:     disclosure.market,
    corpCls:    disclosure.corpCls,
    corpName:   disclosure.stockName,
    stockCode:  disclosure.stockCode,
    reportName: disclosure.reportName,
  });
}
