// jp: 종목 특징 점수 계산용 입력 데이터 타입 + 재무 adapter

// jp: 시세/수급 데이터 (KIS에서 실제 조회 가능)
export interface MarketData {
  code: string;
  name: string;
  price: number;
  change: number;
  changeRate: number;
  volume: number;
  avgVolume20: number;       // jp: 20일 평균 거래량
  tradingValue?: number;     // jp: 거래대금
  high52w?: number;
  low52w?: number;
  ma5?: number;
  ma20?: number;
  ma60?: number;
  per?: number;
  pbr?: number;
  eps?: number;
  bps?: number;
  // jp: 수급 (있으면)
  foreignNet?: number;       // jp: 외국인 순매수
  institutionNet?: number;   // jp: 기관 순매수
  individualNet?: number;    // jp: 개인 순매수
  pensionNet?: number;       // jp: 연기금 순매수
}

// jp: 재무 데이터 (별도 데이터소스 필요 - 없으면 null)
export interface FinancialData {
  roe?: number;                 // jp: ROE %
  operatingMargin?: number;     // jp: 영업이익률 %
  netMargin?: number;           // jp: 순이익률 %
  revenueGrowth3y?: boolean;    // jp: 매출 3년 연속 성장
  opIncomeGrowth3y?: boolean;   // jp: 영업이익 3년 연속 성장
  epsGrowth3y?: boolean;        // jp: EPS 3년 연속 성장
  debtRatio?: number;           // jp: 부채비율 %
  currentRatio?: number;        // jp: 유동비율 %
  operatingCashFlow?: number;   // jp: 영업현금흐름 (양수/음수)
  netCash?: boolean;            // jp: 순현금 기업
  interestCoverage?: number;    // jp: 이자보상배율
  dividendYears?: number;       // jp: 배당 지속 연수
  dividendYield?: number;       // jp: 배당수익률 %
  isSectorLeader?: boolean;     // jp: 업종 대표주
  sectorAvgPer?: number;        // jp: 업종 평균 PER
  sectorAvgPbr?: number;        // jp: 업종 평균 PBR
  isLossPersistent?: boolean;   // jp: 적자 지속
  revenueDeclining?: boolean;   // jp: 매출 감소 지속
  opIncomeDeclining?: boolean;  // jp: 영업이익 감소
  turnedToLoss?: boolean;       // jp: 적자전환
}

// jp: 공시 기반 위험/모멘텀 플래그
export interface DisclosureFlags {
  tradingHalt?: boolean;        // jp: 거래정지
  delisting?: boolean;          // jp: 상장폐지 사유
  auditOpinionRefused?: boolean;// jp: 감사의견 거절
  embezzlement?: boolean;       // jp: 횡령/배임
  managedStock?: boolean;       // jp: 관리종목
  investmentWarning?: boolean;  // jp: 투자경고
  investmentRisk?: boolean;     // jp: 투자위험
  unfaithfulDisclosure?: boolean; // jp: 불성실공시
  cbIssued?: boolean;           // jp: 전환사채 발행
  rightsIssue?: boolean;        // jp: 유상증자
  capitalReduction?: boolean;   // jp: 감자
  majorShareholderChange?: boolean; // jp: 최대주주 변경
  hasImportantDisclosure?: boolean; // jp: 중요 공시
  hasPositiveDisclosure?: boolean;  // jp: 호재 공시
  hasNegativeDisclosure?: boolean;  // jp: 악재 공시
  hasWarningDisclosure?: boolean;   // jp: warning 공시
}

// jp: 테마 정보
export interface ThemeFlags {
  isThemeHot?: boolean;     // jp: 소속 테마 강세
  themeName?: string;
}

// jp: 점수 계산 통합 입력
export interface FeatureInput {
  market: MarketData;
  financial: FinancialData | null;   // jp: null이면 재무 점수 unavailable
  disclosure: DisclosureFlags;
  theme: ThemeFlags;
}
