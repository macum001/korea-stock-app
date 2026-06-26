// jp: 공시 관련 타입 정의

export type DisclosureImportance = 'important' | 'warning' | 'normal';
export type DisclosureSentiment = 'positive' | 'negative' | 'neutral' | 'caution';

export interface Disclosure {
  id: string;
  stockCode: string;
  stockName: string;
  corpCode?: string;
  reportName: string;
  receiptNo: string;
  disclosureType: string;
  importance: DisclosureImportance;
  sentiment: DisclosureSentiment;
  summary: string;
  originalUrl: string;
  disclosedAt: string;
  createdAt?: string;
  // jp: 탭 분류 플래그 (백엔드에서 계산)
  isImportant?: boolean;
  isCapital?: boolean;
  isGood?: boolean;
  isBad?: boolean;
  isCorrection?: boolean;
  // jp: 공시 카테고리 (백엔드 분류, 없으면 general)
  category?: string;
  categoryType?: string;  // jp: 종류 축 — 7개 탭 (백엔드 category_type)
}

export interface DisclosureFilter {
  importance?: DisclosureImportance[];
  sentiment?: DisclosureSentiment[];
  keyword?: string;
  dateFrom?: string;
  dateTo?: string;
  capitalRaising?: boolean; // jp: (구) 자본조달 - 호환용
  // jp: 탭 플래그 기반 필터 (전체=없음, 중요/자본조달/호재/악재)
  flagImportant?: boolean;
  flagCapital?: boolean;
  flagGood?: boolean;
  flagBad?: boolean;
}

// jp: 공시 키워드 분류 - 점수 기반
export interface DisclosureKeywordScore {
  keyword: string;
  sentimentDelta: number;    // 양수: positive, 음수: negative
  importanceBoost: number;   // 중요도 상승값
}

// jp: 중요 공시 키워드 정의
export const POSITIVE_KEYWORDS: DisclosureKeywordScore[] = [
  { keyword: '공급계약', sentimentDelta: 2, importanceBoost: 1 },
  { keyword: '단일판매', sentimentDelta: 1, importanceBoost: 1 },
  { keyword: '신규시설투자', sentimentDelta: 1, importanceBoost: 1 },
  { keyword: '자기주식취득', sentimentDelta: 2, importanceBoost: 2 },
  { keyword: '무상증자', sentimentDelta: 2, importanceBoost: 2 },
  { keyword: '최대주주 지분취득', sentimentDelta: 1, importanceBoost: 1 },
  { keyword: '특허권 취득', sentimentDelta: 1, importanceBoost: 0 },
  { keyword: '기술이전', sentimentDelta: 2, importanceBoost: 2 },
  { keyword: 'FDA', sentimentDelta: 3, importanceBoost: 3 },
  { keyword: '품목허가', sentimentDelta: 2, importanceBoost: 2 },
  { keyword: '수주', sentimentDelta: 2, importanceBoost: 1 },
  { keyword: '대규모', sentimentDelta: 1, importanceBoost: 1 },
];

export const NEGATIVE_KEYWORDS: DisclosureKeywordScore[] = [
  { keyword: '유상증자', sentimentDelta: -2, importanceBoost: 2 },
  { keyword: '전환사채', sentimentDelta: -1, importanceBoost: 1 },
  { keyword: '신주인수권부사채', sentimentDelta: -1, importanceBoost: 1 },
  { keyword: '최대주주변경', sentimentDelta: -1, importanceBoost: 2 },
  { keyword: '대표이사변경', sentimentDelta: -1, importanceBoost: 1 },
  { keyword: '횡령', sentimentDelta: -3, importanceBoost: 3 },
  { keyword: '배임', sentimentDelta: -3, importanceBoost: 3 },
  { keyword: '감사의견', sentimentDelta: -3, importanceBoost: 3 },
  { keyword: '거래정지', sentimentDelta: -3, importanceBoost: 3 },
  { keyword: '상장폐지', sentimentDelta: -3, importanceBoost: 3 },
  { keyword: '관리종목', sentimentDelta: -3, importanceBoost: 3 },
  { keyword: '투자경고', sentimentDelta: -2, importanceBoost: 3 },
  { keyword: '불성실공시', sentimentDelta: -2, importanceBoost: 2 },
  { keyword: '소송', sentimentDelta: -1, importanceBoost: 1 },
  { keyword: '발행결정', sentimentDelta: -1, importanceBoost: 0 },
];
