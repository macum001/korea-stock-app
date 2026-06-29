/**
 * backend/src/utils/disclosureClassify.ts
 * 공시 분류 — 백엔드 유틸리티 (프론트와 동일 로직, JSX 없음)
 *
 * 우선순위:
 *   IssuerType  : SPC > 코스피(Y) > 코스닥(K) > 코넥스(N) > 비상장(E/코드없음) > 기타
 *   DisclosureType: 채권/ABS > 증권신고서 > 정기보고서 > 주요사항보고서 > 합병/분할 > 기타
 */

export type IssuerType     = 'kospi' | 'kosdaq' | 'konex' | 'unlisted' | 'spc' | 'other';
export type DisclosureType = 'bond_abs' | 'securities_registration' | 'periodic' | 'major_event' | 'merger_split' | 'other';

export interface DisclosureClassification {
  issuerType: IssuerType;
  disclosureType: DisclosureType;
  badges: string[];
  detailAvailability: {
    hasStructuredReportInfo: boolean;
    reason: string;
  };
}

const ISSUER_LABEL: Record<IssuerType, string> = {
  kospi:    '코스피',  kosdaq:   '코스닥',  konex:    '코넥스',
  unlisted: '비상장',  spc:      'SPC/유동화', other: '기타',
};
const DISCLOSURE_LABEL: Record<DisclosureType, string> = {
  bond_abs:                '채권/ABS',
  securities_registration: '증권신고서',
  periodic:                '정기보고서',
  major_event:             '주요사항보고서',
  merger_split:            '합병/분할',
  other:                   '기타공시',
};

const SPC_CORP_RE   = /유동화전문|자산유동화|ABS유한|제\d+차.*유한|리츠|부동산투자신탁|인프라투자|투자목적회사|유동화회사/;
const SPC_REPORT_RE = /자산유동화|유동화증권|주택저당|자산담보부/;

function detectIssuerType(p: {
  corpCls?: string | null; corpName?: string | null;
  stockCode?: string | null; reportName?: string | null;
}): IssuerType {
  // ① SPC 최우선
  if ((p.corpName && SPC_CORP_RE.test(p.corpName)) ||
      (p.reportName && SPC_REPORT_RE.test(p.reportName))) return 'spc';
  // ② DART corp_cls 기준
  if (p.corpCls === 'Y') return 'kospi';
  if (p.corpCls === 'K') return 'kosdaq';
  if (p.corpCls === 'N') return 'konex';
  if (p.corpCls === 'E') return 'unlisted';
  // ③ 종목코드 없으면 비상장
  if (!p.stockCode || !/^\d{6}$/.test(p.stockCode)) return 'unlisted';
  return 'other';
}

function detectDisclosureType(reportName?: string | null): DisclosureType {
  if (!reportName) return 'other';
  if (/사채|ABS|자산유동화|유동화증권|기업어음|전자단기사채/.test(reportName)) return 'bond_abs';
  if (/증권신고서|투자설명서|일괄신고서/.test(reportName))                  return 'securities_registration';
  if (/^(사업보고서|분기보고서|반기보고서)/.test(reportName))               return 'periodic';
  if (/주요사항보고서/.test(reportName))                                    return 'major_event';
  if (/합병|분할|주식의\s*포괄적\s*교환|포괄적\s*이전/.test(reportName))   return 'merger_split';
  return 'other';
}

function buildBadges(issuerType: IssuerType, disclosureType: DisclosureType): string[] {
  const il = ISSUER_LABEL[issuerType];
  const dl = DISCLOSURE_LABEL[disclosureType];
  // SPC는 공시 유형 배지 생략 (어떤 유형이든 'SPC/유동화' 하나로 충분)
  if (issuerType === 'spc') return [il];
  if (disclosureType === 'other') return [il];
  return [il, dl];
}

function buildReason(issuerType: IssuerType, disclosureType: DisclosureType): string {
  if (issuerType === 'spc')
    return 'SPC/유동화전문회사의 보고서로, 일반 상장사 정기보고서 상세 탭이 제한돼요.';
  if (issuerType === 'unlisted')
    return '비상장 기업의 보고서로, 상장사 기준 상세 탭(재무·주주)이 제공되지 않아요.';
  const isListed = ['kospi', 'kosdaq', 'konex'].includes(issuerType);
  if (isListed && disclosureType === 'periodic') return '정기보고서 상세 정보(재무·주주)를 제공할 수 있어요.';
  if (isListed) return '이 공시 유형은 상세 탭(재무·주주)이 별도로 제공되지 않아요.';
  if (disclosureType === 'periodic') return 'DART 정기보고서 항목을 찾지 못했어요. 원문에는 있을 수 있으니 AI 분석 또는 원문 보기를 이용해 주세요.';
  return 'DART 원문 또는 AI 분석으로 내용을 확인해 주세요.';
}

export function classifyDisclosure(params: {
  corpCls?: string | null;
  corpName?: string | null;
  stockCode?: string | null;
  reportName?: string | null;
}): DisclosureClassification {
  const issuerType     = detectIssuerType(params);
  const disclosureType = detectDisclosureType(params.reportName);
  const isListed       = ['kospi', 'kosdaq', 'konex'].includes(issuerType);

  return {
    issuerType,
    disclosureType,
    badges: buildBadges(issuerType, disclosureType),
    detailAvailability: {
      hasStructuredReportInfo: isListed && disclosureType === 'periodic',
      reason: buildReason(issuerType, disclosureType),
    },
  };
}
