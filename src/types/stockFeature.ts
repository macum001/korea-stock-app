// jp: 종목 특징 점수 체계 타입 (가치투자 + 장중 모멘텀 결합)

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

// jp: 점수 산출에 데이터가 충분했는지 상태
export type ScoreDataStatus = 'ready' | 'partial' | 'unavailable';

// jp: 이유/주의 항목 (색상 톤 포함)
export interface FeatureReason {
  label: string;
  tone: 'positive' | 'negative' | 'caution' | 'neutral'; // jp: 빨강/파랑/주황/회색
}

// jp: 개별 점수 + 데이터 상태
export interface ScoreDetail {
  score: number;
  status: ScoreDataStatus; // jp: unavailable이면 가짜 점수 아님 = '데이터 준비 중'
  reasons: FeatureReason[];
}

export interface StockFeatureScore {
  stockCode: string;
  stockName: string;
  qualityScore: number;
  valueScore: number;
  safetyScore: number;
  momentumScore: number;
  riskScore: number;
  featuredScore: number;
  riskLevel: RiskLevel;
  categories: string[];
  reasons: FeatureReason[];
  cautions: FeatureReason[];
  summary: string;
  // jp: 점수별 데이터 가용 상태 (재무 데이터 없으면 unavailable)
  status: {
    quality: ScoreDataStatus;
    value: ScoreDataStatus;
    safety: ScoreDataStatus;
    momentum: ScoreDataStatus;
    risk: ScoreDataStatus;
  };
  updatedAt: string;
}

export interface FeaturedStockSection {
  id: string;
  title: string;
  description: string;
  stocks: StockFeatureScore[];
}

// jp: 투자 고지 문구 (상수)
export const INVESTMENT_DISCLAIMER =
  '본 정보는 투자 참고용이며 투자 권유가 아닙니다. 모든 투자 판단과 책임은 사용자 본인에게 있습니다.';
