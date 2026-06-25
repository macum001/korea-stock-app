// jp: 종목 특징 통합 점수 서비스 - 5점수 가중합 + 분류 + 요약

import { FeatureInput } from './featureTypes';
import {
  calculateQualityScore, calculateValueScore, calculateSafetyScore,
  calculateMomentumScore, calculateRiskScore, getRiskLevel,
  Reason, DataStatus,
} from './scoreCalculators';

// jp: 가중치 모드
export type WeightMode = 'intraday' | 'detail';

// jp: 장중 특징주 / 종목 상세 가중치
const WEIGHTS = {
  intraday: { quality: 0.20, value: 0.15, safety: 0.15, momentum: 0.35, risk: 0.15 },
  detail:   { quality: 0.30, value: 0.25, safety: 0.25, momentum: 0.10, risk: 0.10 },
};

export interface FeatureScoreOutput {
  stockCode: string;
  stockName: string;
  qualityScore: number;
  valueScore: number;
  safetyScore: number;
  momentumScore: number;
  riskScore: number;
  featuredScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  categories: string[];
  reasons: Reason[];
  cautions: Reason[];
  summary: string;
  status: {
    quality: DataStatus; value: DataStatus; safety: DataStatus;
    momentum: DataStatus; risk: DataStatus;
  };
  updatedAt: string;
}

// jp: 카테고리 분류
function classifyCategories(s: {
  quality: number; value: number; safety: number; momentum: number; risk: number;
  qStatus: DataStatus; vStatus: DataStatus;
  disc: FeatureInput['disclosure']; theme: FeatureInput['theme'];
  valueTrap: boolean;
}): string[] {
  const cats: string[] = [];
  if (s.qStatus === 'ready' && s.quality >= 70) cats.push('퀄리티 우수');
  if (s.vStatus === 'ready' && s.value >= 70 && !s.valueTrap) cats.push('저평가 후보');
  if (s.safety >= 75) cats.push('안전마진 양호');
  if (s.momentum >= 70) cats.push('장중 모멘텀');
  if (s.theme.isThemeHot) cats.push('테마 강세');
  if (s.disc.hasImportantDisclosure) cats.push('중요 공시');
  if (s.disc.hasPositiveDisclosure) cats.push('호재 가능성');
  // jp: 위험 카테고리
  if (s.disc.hasNegativeDisclosure || s.disc.hasWarningDisclosure) cats.push('악재 주의');
  if (s.risk >= 41) cats.push('과열 주의');
  if (s.safety < 30) cats.push('재무 위험');
  if (s.disc.tradingHalt || s.disc.delisting || s.disc.auditOpinionRefused || s.disc.managedStock) cats.push('공시 위험');
  // jp: 단기 과열 (퀄리티 낮은데 모멘텀만 높음)
  if (s.qStatus === 'ready' && s.quality < 40 && s.momentum >= 70) cats.push('과열 주의');
  return [...new Set(cats)];
}

// jp: 요약 문구 생성 (추천 표현 금지)
function buildSummary(out: {
  quality: number; momentum: number; value: number; valueTrap: boolean;
  riskLevel: string; qStatus: DataStatus;
}): string {
  const parts: string[] = [];
  if (out.qStatus === 'ready' && out.quality >= 70 && out.momentum >= 70) {
    parts.push('퀄리티와 장중 수급이 함께 개선된 종목입니다.');
  } else if (out.momentum >= 70) {
    parts.push('장중 수급·모멘텀이 강한 종목입니다.');
  } else if (out.qStatus === 'ready' && out.quality >= 70) {
    parts.push('기업 퀄리티가 양호한 종목입니다.');
  } else {
    parts.push('관찰할 만한 특징이 있는 종목입니다.');
  }
  if (out.valueTrap) parts.push('저평가로 보이나 실적 악화 가능성을 확인해야 합니다.');
  if (out.riskLevel === 'critical' || out.riskLevel === 'high') {
    parts.push('위험 신호가 있어 주의가 필요합니다.');
  } else {
    parts.push('단기 변동성은 확인이 필요합니다.');
  }
  return parts.join(' ');
}

// jp: 종목 특징 점수 계산 (메인)
export function computeFeatureScore(input: FeatureInput, mode: WeightMode): FeatureScoreOutput {
  const q = calculateQualityScore(input.financial);
  const v = calculateValueScore(input.financial, input.market);
  const s = calculateSafetyScore(input.financial, input.disclosure);
  const m = calculateMomentumScore(input.market, input.disclosure, input.theme);
  const r = calculateRiskScore(input.market, input.financial, input.disclosure, input.theme);

  const w = WEIGHTS[mode];

  // jp: 재무 점수가 unavailable이면 해당 항목을 가중합에서 제외하고 나머지로 정규화
  // jp: (가짜 점수 0을 그대로 곱하면 왜곡되므로)
  const terms: { score: number; weight: number; status: DataStatus }[] = [
    { score: q.score, weight: w.quality, status: q.status },
    { score: v.score, weight: w.value, status: v.status },
    { score: s.score, weight: w.safety, status: s.status },
    { score: m.score, weight: w.momentum, status: m.status },
  ];
  let posWeight = 0, posSum = 0;
  for (const t of terms) {
    if (t.status === 'unavailable') continue;
    posWeight += t.weight;
    posSum += t.score * t.weight;
  }
  // jp: 사용 가능한 점수만으로 정규화 후 risk 차감
  const base = posWeight > 0 ? posSum / posWeight : 0;
  const featuredScore = Math.round(Math.max(0, Math.min(100, base - r.score * w.risk)));

  const riskLevel = getRiskLevel(r.score);
  const valueTrap = v.reasons.some(x => x.label.includes('실적 악화 주의'));

  const categories = classifyCategories({
    quality: q.score, value: v.score, safety: s.score, momentum: m.score, risk: r.score,
    qStatus: q.status, vStatus: v.status, disc: input.disclosure, theme: input.theme, valueTrap,
  });

  // jp: reasons = 긍정 톤, cautions = caution/negative 톤
  const allReasons = [...q.reasons, ...v.reasons, ...s.reasons, ...m.reasons];
  const reasons = allReasons.filter(x => x.tone === 'positive').slice(0, 5);
  const cautions = [...allReasons.filter(x => x.tone === 'caution' || x.tone === 'negative'), ...r.reasons]
    .filter((x, i, arr) => arr.findIndex(y => y.label === x.label) === i) // jp: 중복 제거
    .slice(0, 5);

  const summary = buildSummary({
    quality: q.score, momentum: m.score, value: v.score, valueTrap,
    riskLevel, qStatus: q.status,
  });

  return {
    stockCode: input.market.code,
    stockName: input.market.name,
    qualityScore: q.score,
    valueScore: v.score,
    safetyScore: s.score,
    momentumScore: m.score,
    riskScore: r.score,
    featuredScore,
    riskLevel,
    categories,
    reasons,
    cautions,
    summary,
    status: {
      quality: q.status, value: v.status, safety: s.status,
      momentum: m.status, risk: r.status,
    },
    updatedAt: new Date().toISOString(),
  };
}
