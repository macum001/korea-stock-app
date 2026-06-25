// jp: 5대 점수 계산 엔진 - 워런 버핏식 가치/퀄리티/안전 + 장중 모멘텀/위험
// jp: 재무 데이터(financial)가 null이면 점수 대신 'unavailable' 상태 반환 (가짜 점수 금지)

import { FinancialData, MarketData, DisclosureFlags } from './featureTypes';

export type DataStatus = 'ready' | 'partial' | 'unavailable';
export interface Reason { label: string; tone: 'positive' | 'negative' | 'caution' | 'neutral'; }
export interface ScoreResult { score: number; status: DataStatus; reasons: Reason[]; }

// jp: 0~100 범위로 클램프
function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}

// ============================================================
// jp: 1. Quality Score - 기업 퀄리티 (재무 데이터 필요)
// ============================================================
export function calculateQualityScore(fin: FinancialData | null): ScoreResult {
  // jp: 재무 데이터 없으면 가짜 점수 만들지 않음
  if (!fin) return { score: 0, status: 'unavailable', reasons: [] };

  let score = 50; // jp: 기준점
  const reasons: Reason[] = [];

  if (fin.roe != null) {
    if (fin.roe >= 15) { score += 20; reasons.push({ label: 'ROE 15% 이상', tone: 'positive' }); }
    else if (fin.roe >= 10) { score += 10; reasons.push({ label: 'ROE 10% 이상', tone: 'positive' }); }
  }
  if (fin.operatingMargin != null) {
    if (fin.operatingMargin >= 15) { score += 15; reasons.push({ label: '영업이익률 15% 이상', tone: 'positive' }); }
    else if (fin.operatingMargin >= 10) { score += 10; reasons.push({ label: '영업이익률 10% 이상', tone: 'positive' }); }
  }
  if (fin.revenueGrowth3y) { score += 15; reasons.push({ label: '매출 3년 연속 성장', tone: 'positive' }); }
  if (fin.opIncomeGrowth3y) { score += 15; reasons.push({ label: '영업이익 성장 지속', tone: 'positive' }); }
  if (fin.epsGrowth3y) { score += 10; reasons.push({ label: 'EPS 성장 지속', tone: 'positive' }); }
  if (fin.debtRatio != null && fin.debtRatio <= 100) { score += 10; reasons.push({ label: '부채비율 100% 이하', tone: 'positive' }); }
  if (fin.operatingCashFlow != null && fin.operatingCashFlow > 0) { score += 10; reasons.push({ label: '현금흐름 양호', tone: 'positive' }); }
  if (fin.dividendYears != null && fin.dividendYears >= 3) { score += 5; reasons.push({ label: '배당 3년 이상 지속', tone: 'positive' }); }
  if (fin.isSectorLeader) { score += 10; reasons.push({ label: '업종 대표주', tone: 'positive' }); }

  // jp: 감점
  if (fin.isLossPersistent) { score -= 20; reasons.push({ label: '적자 지속', tone: 'negative' }); }
  if (fin.operatingCashFlow != null && fin.operatingCashFlow < 0) { score -= 15; reasons.push({ label: '현금흐름 마이너스', tone: 'negative' }); }
  if (fin.debtRatio != null && fin.debtRatio >= 200) { score -= 15; reasons.push({ label: '부채비율 주의', tone: 'caution' }); }
  if (fin.revenueDeclining) { score -= 10; reasons.push({ label: '매출 감소 지속', tone: 'negative' }); }

  return { score: clamp(score), status: 'ready', reasons };
}

// ============================================================
// jp: 2. Value Score - 가치/안전마진 (재무 + 밸류 데이터 필요)
// ============================================================
export function detectValueTrap(fin: FinancialData | null, market: MarketData): boolean {
  if (!fin) return false;
  // jp: 저PER/저PBR인데 실적이 악화 → value trap
  const cheapPer = (market.per != null && market.per > 0 && market.per <= 10);
  const cheapPbr = (market.pbr != null && market.pbr > 0 && market.pbr <= 1);
  const badFundamentals = !!(fin.revenueDeclining || fin.opIncomeDeclining || fin.turnedToLoss || fin.isLossPersistent);
  return (cheapPer || cheapPbr) && badFundamentals;
}

export function calculateValueScore(fin: FinancialData | null, market: MarketData): ScoreResult {
  if (!fin) return { score: 0, status: 'unavailable', reasons: [] };

  let score = 50;
  const reasons: Reason[] = [];
  const trap = detectValueTrap(fin, market);

  if (market.per != null && fin.sectorAvgPer != null && fin.sectorAvgPer > 0) {
    if (market.per > 0 && market.per <= fin.sectorAvgPer * 0.8) {
      score += 20; reasons.push({ label: '업종 대비 저평가(PER)', tone: 'positive' });
    }
  }
  if (market.pbr != null && fin.sectorAvgPbr != null && fin.sectorAvgPbr > 0) {
    if (market.pbr > 0 && market.pbr <= fin.sectorAvgPbr * 0.8) {
      score += 15; reasons.push({ label: '업종 대비 저평가(PBR)', tone: 'positive' });
    }
  }
  if (market.per != null && market.per > 0 && market.per <= 10) { score += 15; reasons.push({ label: 'PER 10 이하', tone: 'positive' }); }
  if (market.pbr != null && market.pbr > 0 && market.pbr <= 1) { score += 15; reasons.push({ label: 'PBR 1 이하', tone: 'positive' }); }

  // jp: 52주 고점 대비 20%+ 조정인데 실적 유지
  if (market.high52w && market.price < market.high52w * 0.8 && !fin.revenueDeclining && !fin.isLossPersistent) {
    score += 15; reasons.push({ label: '52주 고점 대비 조정', tone: 'positive' });
  }
  if (fin.dividendYield != null && fin.dividendYield >= 3) { score += 5; reasons.push({ label: '배당수익률 3% 이상', tone: 'positive' }); }
  // jp: 이익 성장 + 낮은 밸류
  if (fin.epsGrowth3y && market.per != null && market.per > 0 && market.per <= 15) {
    score += 20; reasons.push({ label: '이익 성장 대비 밸류 부담 낮음', tone: 'positive' });
  }

  // jp: value trap이면 점수 하향 + 경고
  if (trap) {
    score = Math.min(score, 35);
    reasons.push({ label: '저평가처럼 보이나 실적 악화 주의', tone: 'caution' });
  }

  return { score: clamp(score), status: 'ready', reasons };
}

// ============================================================
// jp: 3. Safety Score - 안정성 (재무 + 공시 위험)
// ============================================================
export function calculateSafetyScore(fin: FinancialData | null, disc: DisclosureFlags): ScoreResult {
  // jp: 재무 데이터 없어도 공시 위험은 평가 가능하지만, 재무 없으면 partial
  const hasFin = !!fin;
  let score = 60;
  const reasons: Reason[] = [];

  if (fin) {
    if (fin.debtRatio != null && fin.debtRatio <= 100) { score += 15; reasons.push({ label: '부채비율 100% 이하', tone: 'positive' }); }
    if (fin.currentRatio != null && fin.currentRatio >= 150) { score += 10; reasons.push({ label: '유동비율 양호', tone: 'positive' }); }
    if (fin.operatingCashFlow != null && fin.operatingCashFlow > 0) { score += 15; reasons.push({ label: '현금흐름 안정', tone: 'positive' }); }
    if (fin.netCash) { score += 15; reasons.push({ label: '순현금 기업', tone: 'positive' }); }
    if (fin.interestCoverage != null && fin.interestCoverage >= 5) { score += 10; reasons.push({ label: '이자보상배율 양호', tone: 'positive' }); }
  }

  // jp: 공시 기반 강한 감점 (재무 없어도 평가)
  if (disc.auditOpinionRefused) { score -= 100; reasons.push({ label: '감사의견 거절', tone: 'negative' }); }
  if (disc.tradingHalt) { score -= 100; reasons.push({ label: '거래정지', tone: 'negative' }); }
  if (disc.delisting) { score -= 100; reasons.push({ label: '상장폐지 사유', tone: 'negative' }); }
  if (disc.managedStock) { score -= 50; reasons.push({ label: '관리종목 위험', tone: 'negative' }); }
  if (disc.embezzlement) { score -= 80; reasons.push({ label: '횡령/배임', tone: 'negative' }); }
  if (disc.unfaithfulDisclosure) { score -= 30; reasons.push({ label: '불성실공시', tone: 'caution' }); }
  if (disc.cbIssued || disc.rightsIssue) { score -= 30; reasons.push({ label: '전환사채/유상증자 주의', tone: 'caution' }); }

  return { score: clamp(score), status: hasFin ? 'ready' : 'partial', reasons };
}

// ============================================================
// jp: 4. Momentum Score - 장중 모멘텀 (시세/수급 - 실제 데이터)
// ============================================================
export function calculateMomentumScore(market: MarketData, disc: DisclosureFlags, theme: { isThemeHot?: boolean; themeName?: string }): ScoreResult {
  let score = 40;
  const reasons: Reason[] = [];
  const spikeRatio = market.avgVolume20 ? market.volume / market.avgVolume20 : 0;

  // jp: 등락률
  if (market.changeRate >= 10) { score += 20; reasons.push({ label: `+${market.changeRate.toFixed(1)}% 급등`, tone: 'positive' }); }
  else if (market.changeRate >= 5) { score += 10; reasons.push({ label: `+${market.changeRate.toFixed(1)}% 상승`, tone: 'positive' }); }

  // jp: 거래량
  if (spikeRatio >= 5) { score += 30; reasons.push({ label: `거래량 ${spikeRatio.toFixed(1)}배 급증`, tone: 'positive' }); }
  else if (spikeRatio >= 3) { score += 20; reasons.push({ label: `거래량 ${spikeRatio.toFixed(1)}배 증가`, tone: 'positive' }); }
  else if (spikeRatio >= 2) { score += 10; reasons.push({ label: `거래량 ${spikeRatio.toFixed(1)}배 증가`, tone: 'positive' }); }

  // jp: 수급
  const foreignBuy = (market.foreignNet ?? 0) > 0;
  const instBuy = (market.institutionNet ?? 0) > 0;
  if (foreignBuy && instBuy) { score += 25; reasons.push({ label: '외국인·기관 동시 순매수', tone: 'positive' }); }
  else {
    if (foreignBuy) { score += 10; reasons.push({ label: '외국인 순매수', tone: 'positive' }); }
    if (instBuy) { score += 10; reasons.push({ label: '기관 순매수', tone: 'positive' }); }
  }
  if ((market.pensionNet ?? 0) > 0) { score += 15; reasons.push({ label: '연기금 순매수', tone: 'positive' }); }

  // jp: 이동평균 돌파
  if (market.ma20 != null && market.price > market.ma20) { score += 10; reasons.push({ label: '20일선 위', tone: 'positive' }); }
  if (market.ma60 != null && market.price > market.ma60) { score += 15; reasons.push({ label: '60일선 위', tone: 'positive' }); }
  // jp: 신고가 근접
  if (market.high52w && market.price >= market.high52w * 0.95) { score += 15; reasons.push({ label: '신고가 근접', tone: 'positive' }); }

  // jp: 공시
  if (disc.hasImportantDisclosure) { score += 20; reasons.push({ label: '중요 공시 발생', tone: 'positive' }); }
  if (disc.hasPositiveDisclosure) { score += 20; reasons.push({ label: '호재 공시 발생', tone: 'positive' }); }
  // jp: 테마
  if (theme.isThemeHot) { score += 15; reasons.push({ label: `${theme.themeName ?? ''} 테마 강세`.trim(), tone: 'positive' }); }

  // jp: 감점
  if (market.changeRate >= 5 && spikeRatio < 1) { score -= 10; reasons.push({ label: '급등했지만 거래량 부족', tone: 'caution' }); }
  const onlyIndividual = (market.individualNet ?? 0) > 0 && !foreignBuy && !instBuy;
  if (onlyIndividual && market.changeRate >= 5) { score -= 10; reasons.push({ label: '개인 과열 순매수', tone: 'caution' }); }
  if (disc.hasNegativeDisclosure && market.changeRate > 0) { score -= 20; reasons.push({ label: '악재 공시 동반 상승', tone: 'caution' }); }

  return { score: clamp(score), status: 'ready', reasons };
}

// ============================================================
// jp: 5. Risk Score - 위험 (높을수록 위험. 시세+공시 실제 데이터)
// ============================================================
export function calculateRiskScore(market: MarketData, fin: FinancialData | null, disc: DisclosureFlags, theme: { isThemeHot?: boolean }): ScoreResult {
  let score = 0;
  const reasons: Reason[] = [];
  const spikeRatio = market.avgVolume20 ? market.volume / market.avgVolume20 : 0;

  // jp: 공시 위험
  if (disc.tradingHalt) { score += 100; reasons.push({ label: '거래정지', tone: 'negative' }); }
  if (disc.delisting) { score += 100; reasons.push({ label: '상장폐지 사유', tone: 'negative' }); }
  if (disc.auditOpinionRefused) { score += 100; reasons.push({ label: '감사의견 거절', tone: 'negative' }); }
  if (disc.embezzlement) { score += 80; reasons.push({ label: '횡령/배임', tone: 'negative' }); }
  if (disc.managedStock) { score += 60; reasons.push({ label: '관리종목', tone: 'negative' }); }
  if (disc.capitalReduction) { score += 50; reasons.push({ label: '감자', tone: 'negative' }); }
  if (disc.investmentRisk) { score += 50; reasons.push({ label: '투자위험', tone: 'caution' }); }
  if (disc.investmentWarning) { score += 40; reasons.push({ label: '투자경고', tone: 'caution' }); }
  if (disc.unfaithfulDisclosure) { score += 30; reasons.push({ label: '불성실공시', tone: 'caution' }); }
  if (disc.cbIssued) { score += 25; reasons.push({ label: '전환사채 발행', tone: 'caution' }); }
  if (disc.rightsIssue) { score += 25; reasons.push({ label: '유상증자', tone: 'caution' }); }
  if (disc.majorShareholderChange) { score += 20; reasons.push({ label: '최대주주 변경', tone: 'caution' }); }
  if (fin?.turnedToLoss) { score += 30; reasons.push({ label: '적자전환', tone: 'negative' }); }

  // jp: 시세 기반 위험
  if (market.changeRate >= 10) { score += 20; reasons.push({ label: '단기 급등', tone: 'caution' }); }
  if (market.changeRate >= 5 && spikeRatio < 1) { score += 20; reasons.push({ label: '거래량 없이 급등', tone: 'caution' }); }
  const onlyIndividual = (market.individualNet ?? 0) > 0 && (market.foreignNet ?? 0) <= 0 && (market.institutionNet ?? 0) <= 0;
  if (onlyIndividual && market.changeRate >= 5) { score += 15; reasons.push({ label: '개인 과열 매수', tone: 'caution' }); }
  // jp: 외국인+기관 동시 순매도
  if ((market.foreignNet ?? 0) < 0 && (market.institutionNet ?? 0) < 0) { score += 20; reasons.push({ label: '외국인·기관 동시 순매도', tone: 'caution' }); }
  // jp: 테마만 있고 실적 근거 없음
  if (theme.isThemeHot && !fin) { score += 20; reasons.push({ label: '테마만 있고 실적 근거 부족', tone: 'caution' }); }

  // jp: Risk는 상한 없이 누적되나 표시는 0~100+ 가능
  return { score: Math.max(0, score), status: 'ready', reasons };
}

// jp: Risk 레벨 산출
export function getRiskLevel(riskScore: number): 'low' | 'medium' | 'high' | 'critical' {
  if (riskScore >= 71) return 'critical';
  if (riskScore >= 41) return 'high';
  if (riskScore >= 21) return 'medium';
  return 'low';
}
