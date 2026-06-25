// jp: 종목 특징 데이터 조립 + 장중 특징주 섹션 분류
// jp: 시세=KIS, 공시=DB, 재무=adapter(없으면 null)

import { getStockPrice } from '../kis/kisRest.service';
import { getCachedStockPrice } from '../cache/stockCache.service';
import { getDisclosuresByStockCode } from '../../repositories/disclosure.repository';
import { getFinancialData } from './financialData.adapter';
import { computeFeatureScore, FeatureScoreOutput, WeightMode } from './stockFeatureScore.service';
import { FeatureInput, MarketData, DisclosureFlags } from './featureTypes';
import { isDbReady } from '../../config/db';

// jp: 발견 유니버스 (시세 메타) + 평균거래량/52주가/테마
const UNIVERSE = [
  { code: '005930', name: '삼성전자',         avgVolume20: 12_000_000, high52w: 88800,   theme: '반도체',   themeHot: true  },
  { code: '000660', name: 'SK하이닉스',       avgVolume20: 3_000_000,  high52w: 205000,  theme: '반도체',   themeHot: true  },
  { code: '042700', name: '한미반도체',       avgVolume20: 800_000,    high52w: 132000,  theme: '반도체',   themeHot: true  },
  { code: '196170', name: '알테오젠',         avgVolume20: 500_000,    high52w: 358000,  theme: '바이오',   themeHot: false },
  { code: '034020', name: '두산에너빌리티',   avgVolume20: 5_000_000,  high52w: 23900,   theme: '원전',     themeHot: false },
  { code: '035720', name: '카카오',           avgVolume20: 2_000_000,  high52w: 62000,   theme: 'IT',       themeHot: false },
  { code: '035420', name: 'NAVER',            avgVolume20: 1_500_000,  high52w: 240000,  theme: 'IT',       themeHot: false },
  { code: '207940', name: '삼성바이오로직스', avgVolume20: 300_000,    high52w: 1050000, theme: '바이오',   themeHot: false },
];

// jp: 공시 report_name → DisclosureFlags 변환
function disclosureToFlags(reports: { reportName: string; importance: string; sentiment: string }[]): DisclosureFlags {
  const flags: DisclosureFlags = {};
  for (const d of reports) {
    const n = d.reportName;
    if (n.includes('거래정지')) flags.tradingHalt = true;
    if (n.includes('상장폐지')) flags.delisting = true;
    if (n.includes('감사의견') && (n.includes('거절') || n.includes('부적정'))) flags.auditOpinionRefused = true;
    if (n.includes('횡령') || n.includes('배임')) flags.embezzlement = true;
    if (n.includes('관리종목')) flags.managedStock = true;
    if (n.includes('불성실공시')) flags.unfaithfulDisclosure = true;
    if (n.includes('전환사채')) flags.cbIssued = true;
    if (n.includes('유상증자')) flags.rightsIssue = true;
    if (n.includes('감자')) flags.capitalReduction = true;
    if (n.includes('최대주주') && n.includes('변경')) flags.majorShareholderChange = true;
    if (d.importance === 'important') flags.hasImportantDisclosure = true;
    if (d.sentiment === 'positive') flags.hasPositiveDisclosure = true;
    if (d.sentiment === 'negative') flags.hasNegativeDisclosure = true;
    if (d.importance === 'warning') flags.hasWarningDisclosure = true;
  }
  return flags;
}

// jp: 단일 종목 FeatureInput 조립
async function buildInput(meta: typeof UNIVERSE[number]): Promise<FeatureInput | null> {
  let price;
  try {
    price = await getCachedStockPrice(meta.code) || await getStockPrice(meta.code);
  } catch {
    return null; // jp: 시세 없으면 입력 자체 불가
  }

  const market: MarketData = {
    code: meta.code,
    name: meta.name,
    price: price.price,
    change: price.change,
    changeRate: price.changeRate,
    volume: price.volume,
    avgVolume20: meta.avgVolume20,
    high52w: meta.high52w,
  };

  // jp: 공시 (DB 연결 시)
  let disclosure: DisclosureFlags = {};
  if (isDbReady()) {
    try {
      const rows = await getDisclosuresByStockCode(meta.code, 20);
      disclosure = disclosureToFlags(
        rows.map(d => ({ reportName: d.reportName, importance: d.importance, sentiment: d.sentiment }))
      );
    } catch { /* 공시 없음 */ }
  }

  // jp: 재무 (adapter - 없으면 null → Quality/Value 데이터 준비 중)
  const financial = await getFinancialData(meta.code);

  return {
    market,
    financial,
    disclosure,
    theme: { isThemeHot: meta.themeHot, themeName: meta.theme },
  };
}

// jp: 전체 유니버스 점수 계산
export async function computeAllFeatures(mode: WeightMode = 'intraday'): Promise<FeatureScoreOutput[]> {
  const inputs = await Promise.all(UNIVERSE.map(buildInput));
  return inputs
    .filter((i): i is FeatureInput => i !== null)
    .map(input => computeFeatureScore(input, mode));
}

// jp: 단일 종목 점수 (종목 상세용 - detail 가중치)
export async function computeFeatureForStock(stockCode: string): Promise<FeatureScoreOutput | null> {
  const meta = UNIVERSE.find(u => u.code === stockCode)
    || { code: stockCode, name: stockCode, avgVolume20: 1_000_000, high52w: 0, theme: '', themeHot: false };
  const input = await buildInput(meta);
  if (!input) return null;
  return computeFeatureScore(input, 'detail');
}

// jp: 장중 특징주 섹션 분류
export interface FeaturedSection {
  id: string;
  title: string;
  description: string;
  stocks: FeatureScoreOutput[];
}

export function groupBySections(all: FeatureScoreOutput[]): FeaturedSection[] {
  // jp: critical은 주의 섹션으로 분리
  const caution = all.filter(s => s.riskLevel === 'critical');
  const normal = all.filter(s => s.riskLevel !== 'critical');

  const sections: FeaturedSection[] = [
    {
      id: 'quality_momentum', title: '퀄리티 + 모멘텀',
      description: '기업 퀄리티와 장중 수급이 함께 양호한 종목',
      stocks: normal.filter(s => s.categories.includes('퀄리티 우수') && s.momentumScore >= 60)
        .sort((a, b) => b.featuredScore - a.featuredScore),
    },
    {
      id: 'value_flow', title: '저평가 + 수급개선',
      description: '저평가 구간에서 수급이 들어오는 종목',
      stocks: normal.filter(s => s.categories.includes('저평가 후보'))
        .sort((a, b) => b.featuredScore - a.featuredScore),
    },
    {
      id: 'disclosure', title: '중요 공시 발생',
      description: '중요/호재 공시가 발생한 종목',
      stocks: normal.filter(s => s.categories.includes('중요 공시') || s.categories.includes('호재 가능성'))
        .sort((a, b) => b.featuredScore - a.featuredScore),
    },
    {
      id: 'volume_spike', title: '거래량 급증',
      description: '거래량이 평소 대비 크게 증가한 종목',
      stocks: normal.filter(s => s.reasons.some(r => r.label.includes('거래량')))
        .sort((a, b) => b.momentumScore - a.momentumScore),
    },
    {
      id: 'theme_hot', title: '테마 강세',
      description: '강세 테마에 속한 종목',
      stocks: normal.filter(s => s.categories.includes('테마 강세'))
        .sort((a, b) => b.featuredScore - a.featuredScore),
    },
    {
      id: 'caution', title: '주의 필요 종목',
      description: '위험 신호가 있어 관찰보다 주의가 필요한 종목',
      stocks: caution.sort((a, b) => b.riskScore - a.riskScore),
    },
  ];

  // jp: 빈 섹션 제외
  return sections.filter(s => s.stocks.length > 0);
}
