// jp: 공시 분류 서비스 - 제목 정규화 + 키워드 + 공시유형 보조
// jp: 우선순위: 1.자본조달 > 2.악재 > 3.호재 > 4.중요 > 5.일반
// jp: 자본조달은 악재로 자동분류 안 됨 (자본조달+중요 탭에만 노출)
// jp: 플래그 방식: 하나의 공시가 여러 탭(전체/중요/...)에 동시 노출 가능

import { DisclosureClassification } from '../../types/disclosure';

// jp: 제목 정규화 - 띄어쓰기/가운뎃점/특수문자 차이로 인한 누락 방지
// jp: "단일판매ㆍ공급계약체결", "단일판매·공급계약 체결" → 모두 "단일판매공급계약체결"
export function normalizeTitle(title: string): string {
  return (title || '')
    // jp: 각종 가운뎃점/구분기호 제거 (· ㆍ ‧ • ・ 등)
    .replace(/[·ㆍ‧•・.,/|~_()[\]{}<>「」『』""'']/g, '')
    // jp: 하이픈 별도 제거
    .replace(/-/g, '')
    // jp: 모든 공백 제거
    .replace(/\s+/g, '')
    .toUpperCase(); // jp: 영문 약어(CB/BW/EB) 대소문자 무시
}

function nk(kw: string): string {
  return normalizeTitle(kw);
}

// ============================================================
// jp: 키워드 사전 (정규화 전 원형. 비교 시 normalizeTitle 적용)
// ============================================================

// jp: 1순위 - 자본조달 (무상증자는 제외 = 호재)
const CAPITAL_KEYWORDS = [
  // jp: 유상증자류
  '유상증자', '주주배정', '일반공모', '제3자배정', '제삼자배정',
  '주주배정후실권주', '실권주', '실권주일반공모',
  // jp: 메자닌
  '전환사채', '전환사채권', 'CB',
  '신주인수권부사채', '신주인수권부사채권', 'BW',
  '교환사채', '교환사채권', 'EB',
  '신주인수권',
  // jp: 우선주
  '상환전환우선주', 'RCPS', '상환우선주', '전환우선주',
  // jp: 사모
  '사모사채', '사모전환사채', '사모신주인수권부사채', '사모교환사채',
  // jp: 차입/사채
  '단기차입금', '장기차입금', '차입금증가', '차입금', '회사채', '사채권', '사채발행',
  // jp: 자금조달 목적
  '자금조달', '운영자금', '시설자금', '채무상환자금', '타법인증권취득자금',
  '타법인증권취득', '자기자금',
];

// jp: 2순위 - 악재
const BAD_KEYWORDS = [
  // jp: 횡령/배임
  '횡령', '배임',
  // jp: 감사의견
  '감사의견거절', '감사범위제한', '한정의견', '의견거절', '계속기업불확실성',
  '계속기업존속불확실',
  // jp: 상장/거래 제재
  '상장폐지', '관리종목', '투자주의환기종목', '거래정지', '매매거래정지',
  '불성실공시', '불성실공시법인지정', '벌점', '과징금', '제재',
  // jp: 소송/법적
  '소송', '피소', '압류', '가압류', '채권압류',
  // jp: 부실/도산
  '파산', '회생절차', '회생절차개시', '부도', '어음부도', '채무불이행', '디폴트',
  // jp: 손실/실적악화
  '손상차손', '대규모손실', '적자전환', '영업손실', '실적악화', '매출액감소',
  // jp: 계약/사업 차질
  '계약해지', '공급계약해지', '주요계약해지', '생산중단', '영업정지', '리콜',
  // jp: 보고서 미제출
  '감사보고서미제출', '사업보고서미제출', '반기보고서미제출', '분기보고서미제출',
];

// jp: 3순위 - 호재 (무상증자 포함)
const GOOD_KEYWORDS = [
  // jp: 주주환원
  '자사주취득', '자기주식취득', '자기주식소각', '자사주소각', '자기주식신탁',
  '배당', '현금배당', '중간배당', '결산배당', '현물배당',
  '무상증자',
  // jp: 수주/계약
  '단일판매', '공급계약', '판매공급계약', '단일판매공급계약', '수주', '계약체결',
  // jp: 기술/허가
  '기술이전', '라이선스아웃', '라이센스아웃', '품목허가', '임상성공', '임상3상성공',
  '임상3상', 'FDA승인', '수출계약',
  // jp: 투자/성장
  '신규시설투자', '증설', '신규투자',
  // jp: 실적개선
  '흑자전환', '실적개선', '영업이익증가', '매출액증가',
  // jp: 지배구조/주가
  '최대주주지분확대', '공개매수', '합병승인', '주식분할', '액면분할',
];

// jp: 4순위 - 중요 (단독으로 중요 탭에 넣을 키워드)
const IMPORTANT_KEYWORDS = [
  '주요사항보고서', '수시공시',
  '합병', '분할', '영업양수도', '영업양수', '영업양도',
  '최대주주변경', '대표이사변경', '경영권변경', '경영권',
  '주식매수선택권', '주식매수청구권',
  '타법인주식취득', '타법인주식처분',
  '유형자산양수', '유형자산양도',
  '신규시설투자',
  '투자판단관련주요경영사항', '조회공시요구', '조회공시답변',
  '풍문또는보도에대한해명', '풍문', '해명',
];

const CAP_N = CAPITAL_KEYWORDS.map(nk);
const BAD_N = BAD_KEYWORDS.map(nk);
const GOOD_N = GOOD_KEYWORDS.map(nk);
const IMP_N = IMPORTANT_KEYWORDS.map(nk);

function matchAny(normalizedTitle: string, normalizedKeywords: string[], original: string[]): string[] {
  const hit: string[] = [];
  normalizedKeywords.forEach((nkw, i) => {
    if (nkw && normalizedTitle.includes(nkw)) hit.push(original[i]);
  });
  return hit;
}

// ============================================================
// jp: 종류 축 (categoryType) — 6개 탭 분류. 신호 축과 독립.
// jp: 단일 카테고리(한 공시 = 한 종류). 위에서 먼저 매칭된 것 우선.
// jp: 기존 normalizeTitle 재사용 → 가운뎃점/특수문자/대소문자 정규화 일관 적용.
// ============================================================

export type DisclosureCategoryType =
  | '투자위험'
  | '증자감자'
  | '합병분할'
  | '실적재무'
  | '계약소송'
  | '배당주총'
  | '기타';

// jp: [순서 중요] 위에서 먼저 매칭되면 그 카테고리로 확정
const CATEGORY_TYPE_RULES: { keywords: string[]; type: DisclosureCategoryType }[] = [
  // ── 투자위험 (최우선: 부도·상폐·관리종목)
  { keywords: ['부도', '당좌거래정지'], type: '투자위험' },
  { keywords: ['회생', '파산', '워크아웃'], type: '투자위험' },
  { keywords: ['상장폐지', '정리매매'], type: '투자위험' },
  { keywords: ['관리종목'], type: '투자위험' },
  { keywords: ['횡령', '배임'], type: '투자위험' },
  { keywords: ['거래정지', '매매정지', '매매거래정지'], type: '투자위험' },
  { keywords: ['불성실공시', '공시불이행', '투자주의환기'], type: '투자위험' },
  // ── 증자·감자 (희석·소각·분할)
  { keywords: ['유상증자', '주주배정', '제3자배정', '제삼자배정', '일반공모'], type: '증자감자' },
  { keywords: ['무상증자'], type: '증자감자' },
  { keywords: ['전환사채', '신주인수권부사채', '교환사채', 'CB', 'BW', 'EB'], type: '증자감자' },
  { keywords: ['전환청구', '신주인수권행사', '전환권행사'], type: '증자감자' },
  { keywords: ['감자', '자본감소'], type: '증자감자' },
  { keywords: ['주식분할', '주식병합', '액면분할', '액면병합'], type: '증자감자' },
  { keywords: ['주식소각', '이익소각', '자기주식소각', '자사주소각'], type: '증자감자' },
  // ── 합병·분할 (지배구조)
  { keywords: ['최대주주변경', '대주주변경'], type: '합병분할' },
  { keywords: ['최대주주소유주식변동', '대주주소유주식'], type: '합병분할' },
  { keywords: ['합병', '피합병'], type: '합병분할' },
  { keywords: ['분할합병', '물적분할', '인적분할', '회사분할'], type: '합병분할' },
  { keywords: ['영업양수', '영업양도', '자산양수', '자산양도'], type: '합병분할' },
  { keywords: ['주식교환', '주식이전'], type: '합병분할' },
  // ── 실적·재무
  { keywords: ['매출액또는손익구조', '매출액변동', '손익구조변동', '매출액·손익구조'], type: '실적재무' },
  { keywords: ['잠정실적', '영업실적', '연간실적', '반기실적', '분기실적'], type: '실적재무' },
  { keywords: ['자본잠식'], type: '실적재무' },
  { keywords: ['채무보증', '채무인수', '담보제공'], type: '실적재무' },
  { keywords: ['재무제표', '감사보고서', '반기보고서', '분기보고서', '사업보고서'], type: '실적재무' },
  // ── 계약·소송
  { keywords: ['단일판매', '공급계약', '판매계약'], type: '계약소송' },
  { keywords: ['자기주식취득', '자사주취득', '자기주식처분', '자사주처분'], type: '계약소송' },
  { keywords: ['소송', '중재', '판결', '가처분'], type: '계약소송' },
  { keywords: ['특허', '지식재산', '라이선스계약'], type: '계약소송' },
  { keywords: ['풍문', '조회공시', '해명공시', '보도해명'], type: '계약소송' },
  { keywords: ['유형자산취득', '유형자산처분', '토지취득', '건물취득'], type: '계약소송' },
  // ── 배당·주총
  { keywords: ['현금배당', '주식배당', '중간배당', '결산배당', '배당결정'], type: '배당주총' },
  { keywords: ['주주명부폐쇄', '명의개서정지', '기준일'], type: '배당주총' },
  { keywords: ['주주총회', '임시주주총회', '정기주주총회'], type: '배당주총' },
  { keywords: ['임원변경', '대표이사변경', '사외이사', '감사위원'], type: '배당주총' },
];

// jp: 정규화된 RULES (런타임 1회 계산)
const CATEGORY_TYPE_RULES_N = CATEGORY_TYPE_RULES.map((r) => ({
  type: r.type,
  keywords: r.keywords.map(nk),
}));

// jp: 공시명 → 종류 카테고리 1개 반환 (매칭 없으면 '기타')
export function classifyCategoryType(reportName: string): DisclosureCategoryType {
  const norm = normalizeTitle(reportName);
  for (const rule of CATEGORY_TYPE_RULES_N) {
    for (const kw of rule.keywords) {
      if (kw && norm.includes(kw)) return rule.type;
    }
  }
  return '기타';
}

// ============================================================
// jp: 핵심 분류 함수
// ============================================================

export function classifyDisclosure(reportName: string, _disclosureType?: string): DisclosureClassification {
  const norm = normalizeTitle(reportName);
  const matched: string[] = [];

  // jp: 정정공시 여부 (분류는 그대로 두되 is_correction만 표시)
  const isCorrection = norm.includes('정정') || norm.includes('기재정정') ||
                       norm.includes('첨부정정') || norm.includes('자진정정');

  // jp: 무상증자는 자본조달 아님 → 호재. 자본조달 체크 전에 판별
  const isMuSang = norm.includes('무상증자');

  // jp: 1순위 - 자본조달 (무상증자 제외)
  let isCapital = false;
  if (!isMuSang) {
    const capHits = matchAny(norm, CAP_N, CAPITAL_KEYWORDS);
    if (capHits.length > 0) {
      isCapital = true;
      matched.push(...capHits);
    }
  }

  // jp: 2순위 - 악재 (자본조달/무상증자면 악재로 분류 안 함)
  // jp: "주권매매거래정지(무상증자)"처럼 무상증자 동반 악재는 악재 아닌 호재로
  let isBad = false;
  if (!isCapital && !isMuSang) {
    const badHits = matchAny(norm, BAD_N, BAD_KEYWORDS);
    if (badHits.length > 0) {
      isBad = true;
      matched.push(...badHits);
    }
  }

  // jp: 3순위 - 호재 (자본조달/악재 아닐 때)
  let isGood = false;
  if (!isCapital && !isBad) {
    const goodHits = matchAny(norm, GOOD_N, GOOD_KEYWORDS);
    if (goodHits.length > 0) {
      isGood = true;
      matched.push(...goodHits);
    }
  }

  // jp: 4순위 - 중요 추가 키워드 (합병/감자/최대주주변경 등)
  const impHits = matchAny(norm, IMP_N, IMPORTANT_KEYWORDS);
  const hasImportantKw = impHits.length > 0;
  if (hasImportantKw) matched.push(...impHits);

  // jp: 중요 = 자본조달 or 악재 or 호재 or 중요키워드
  const isImportant = isCapital || isBad || isGood || hasImportantKw;

  // jp: 대표 카테고리 (우선순위순)
  const category =
    isCapital ? 'capital' :
    isBad     ? 'bad' :
    isGood    ? 'good' :
    hasImportantKw ? 'important' : 'general';

  // jp: 점수 (탭 분류엔 영향 없지만 정렬/디버그용)
  const positiveScore = isGood ? 3 : 0;
  const negativeScore = isBad ? 3 : 0;
  const cautionScore = isBad ? 2 : 0;

  // jp: 기존 importance/sentiment 호환 매핑 (프론트 점진 전환용)
  const importance = isImportant ? (isBad ? 'warning' : 'important') : 'normal';
  const sentiment = isBad ? 'negative' : isGood ? 'positive' : 'neutral';

  return {
    importance,
    sentiment,
    positiveScore,
    negativeScore,
    cautionScore,
    matchedKeywords: [...new Set(matched)],
    isImportant,
    isCapital,
    isGood,
    isBad,
    isCorrection,
    normalizedTitle: norm,
    category,
    categoryType: classifyCategoryType(reportName),
  };
}

// jp: 점수만 계산 (디버그용)
export function calculateDisclosureScore(reportName: string): Omit<DisclosureClassification, 'importance' | 'sentiment' | 'categoryType'> {
  const r = classifyDisclosure(reportName);
  return {
    positiveScore: r.positiveScore, negativeScore: r.negativeScore, cautionScore: r.cautionScore,
    matchedKeywords: r.matchedKeywords,
    isImportant: r.isImportant, isCapital: r.isCapital, isGood: r.isGood, isBad: r.isBad,
    isCorrection: r.isCorrection, normalizedTitle: r.normalizedTitle, category: r.category,
  };
}
