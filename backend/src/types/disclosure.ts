// jp: 공시 관련 타입 정의

export type DisclosureImportance = 'important' | 'warning' | 'normal';
export type DisclosureSentiment  = 'positive' | 'negative' | 'caution' | 'neutral';

// jp: 핵심 공시 타입
export type Disclosure = {
  id?:              string;
  stockCode?:       string;
  stockName?:       string;
  corpCode:         string;
  receiptNo:        string;   // jp: DART rcept_no - 중복 방지 기준
  reportName:       string;
  disclosureType?:  string;
  importance:       DisclosureImportance;
  sentiment:        DisclosureSentiment;
  positiveScore:    number;
  negativeScore:    number;
  cautionScore:     number;
  matchedKeywords:  string[];
  summary?:         string;
  originalUrl?:     string;
  disclosedAt:      string;
  collectedAt?:     string;
  // jp: 탭 분류 플래그 (전체/중요/자본조달/호재/악재)
  isImportant?:     boolean;
  isCapital?:       boolean;
  isGood?:          boolean;
  isBad?:           boolean;
  isCorrection?:    boolean;  // jp: 정정공시 표시
  normalizedTitle?: string;   // jp: 정규화된 제목 (분류/검색용)
  category?:        string;   // jp: 내부 대표 분류 (general/important/capital/good/bad)
  categoryType?:    string;   // jp: 종류 축 (투자위험/증자감자/합병분할/실적재무/계약소송/배당주총/기타) — 6개 탭
  market?:          string | null;
};

// jp: 분류 결과 타입
export type DisclosureClassification = {
  importance:       DisclosureImportance;
  sentiment:        DisclosureSentiment;
  positiveScore:    number;
  negativeScore:    number;
  cautionScore:     number;
  matchedKeywords:  string[];
  // jp: 탭 분류 플래그
  isImportant:      boolean;
  isCapital:        boolean;
  isGood:           boolean;
  isBad:            boolean;
  isCorrection:     boolean;
  normalizedTitle:  string;
  category:         string;
  categoryType:     string;   // jp: 종류 축 (투자위험/증자감자/...) — 6개 탭 분류
};

// jp: DART 기업 매핑
export type DartCompany = {
  id?:        string;
  corpCode:   string;
  stockCode:  string | null;
  corpName:   string;
  corpCls?:   string;
  modifyDate?: string;
  updatedAt?: string;
  createdAt?: string;
};

// jp: 공시 알림 설정
export type DisclosureAlert = {
  id:           string;
  userId:       string;
  stockCode:    string;
  importantOnly: boolean;
  keywords:     string[];
  isEnabled:    boolean;
  createdAt:    string;
};

// jp: 알림
export type Notification = {
  id:        string;
  userId:    string;
  type:      'disclosure' | 'price' | 'volume';
  stockCode: string;
  title:     string;
  body:      string;
  targetId:  string;
  isRead:    boolean;
  createdAt: string;
};

// jp: WebSocket 이벤트 페이로드
export type DisclosureUpdatePayload = {
  type:       'disclosure_update';
  disclosure: Disclosure;
};

export type ImportantDisclosureAlertPayload = {
  type:       'important_disclosure_alert';
  disclosure: Disclosure;
  message:    string;
};

// jp: 데이터 제공자 인터페이스 - mock/실제 교체 가능
export interface IDisclosureDataProvider {
  fetchLatestDisclosures(startDate?: string): Promise<Disclosure[]>;
  fetchDisclosuresByStockCode(stockCode: string, startDate?: string): Promise<Disclosure[]>;
  fetchDisclosuresByCorpCode(corpCode: string, startDate?: string): Promise<Disclosure[]>;
}
