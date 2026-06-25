// jp: 발견 화면 전용 mock 데이터 - 종목 15개 + 테마 + 거래량
// jp: 나중에 실제 KIS/DART API로 교체 가능하도록 discovery service에서만 사용

export interface DiscoveryStock {
  code: string;
  name: string;
  market: 'KOSPI' | 'KOSDAQ';
  sector: string;
  price: number;
  change: number;
  changeRate: number;
  volume: number;        // jp: 오늘 거래량
  avgVolume: number;     // jp: 최근 평균 거래량 (급증 계산용)
  high52w: number;       // jp: 52주 최고 (신고가 근접 계산용)
}

// jp: 발견 화면용 15종목 (사양서 기준)
export const DISCOVERY_STOCKS: DiscoveryStock[] = [
  { code: '005930', name: '삼성전자',         market: 'KOSPI',  sector: '반도체',   price: 74800,  change: -600,  changeRate: -0.80, volume: 12_500_000, avgVolume: 12_000_000, high52w: 88800 },
  { code: '000660', name: 'SK하이닉스',       market: 'KOSPI',  sector: '반도체',   price: 202500, change: 4600,  changeRate: 2.32,  volume: 8_200_000,  avgVolume: 3_000_000,  high52w: 205000 },
  { code: '042700', name: '한미반도체',       market: 'KOSDAQ', sector: '반도체',   price: 128000, change: 7200,  changeRate: 5.96,  volume: 3_400_000,  avgVolume: 800_000,    high52w: 132000 },
  { code: '196170', name: '알테오젠',         market: 'KOSDAQ', sector: '바이오',   price: 312000, change: -8500, changeRate: -2.65, volume: 1_800_000,  avgVolume: 500_000,    high52w: 358000 },
  { code: '034020', name: '두산에너빌리티',   market: 'KOSPI',  sector: '원전',     price: 21450,  change: 350,   changeRate: 1.66,  volume: 6_100_000,  avgVolume: 5_000_000,  high52w: 23900 },
  { code: '247540', name: '에코프로비엠',     market: 'KOSDAQ', sector: '2차전지',  price: 168500, change: 11500, changeRate: 7.32,  volume: 4_900_000,  avgVolume: 1_200_000,  high52w: 184000 },
  { code: '086520', name: '에코프로',         market: 'KOSDAQ', sector: '2차전지',  price: 98700,  change: 6300,  changeRate: 6.82,  volume: 3_700_000,  avgVolume: 1_000_000,  high52w: 109000 },
  { code: '028300', name: 'HLB',              market: 'KOSDAQ', sector: '바이오',   price: 89200,  change: -5400, changeRate: -5.71, volume: 5_200_000,  avgVolume: 1_500_000,  high52w: 128000 },
  { code: '277810', name: '레인보우로보틱스', market: 'KOSDAQ', sector: '로봇',     price: 184300, change: 15800, changeRate: 9.38,  volume: 2_100_000,  avgVolume: 400_000,    high52w: 242000 },
  { code: '012450', name: '한화에어로스페이스', market: 'KOSPI', sector: '방산',    price: 312500, change: 8500,  changeRate: 2.80,  volume: 1_400_000,  avgVolume: 900_000,    high52w: 358000 },
  { code: '329180', name: 'HD현대중공업',     market: 'KOSPI',  sector: '조선',     price: 198700, change: -2300, changeRate: -1.14, volume: 1_900_000,  avgVolume: 1_600_000,  high52w: 214000 },
  { code: '010120', name: 'LS ELECTRIC',      market: 'KOSPI',  sector: '전력설비', price: 184200, change: 9700,  changeRate: 5.56,  volume: 980_000,    avgVolume: 350_000,    high52w: 198000 },
  { code: '108490', name: '로보티즈',         market: 'KOSDAQ', sector: '로봇',     price: 38600,  change: 2900,  changeRate: 8.12,  volume: 1_600_000,  avgVolume: 350_000,    high52w: 44500 },
  { code: '068270', name: '셀트리온',         market: 'KOSPI',  sector: '바이오',   price: 178500, change: 1200,  changeRate: 0.68,  volume: 1_100_000,  avgVolume: 1_300_000,  high52w: 215000 },
  { code: '141080', name: '리가켐바이오',     market: 'KOSDAQ', sector: '바이오',   price: 112400, change: -7600, changeRate: -6.33, volume: 890_000,    avgVolume: 300_000,    high52w: 148000 },
];

// jp: 테마 정의
export interface StockTheme {
  id: string;
  name: string;
  emoji: string;
  stockCodes: string[];
}

export const STOCK_THEMES: StockTheme[] = [
  { id: 'semiconductor', name: '반도체',    emoji: '💾', stockCodes: ['005930', '000660', '042700'] },
  { id: 'battery',       name: '2차전지',   emoji: '🔋', stockCodes: ['247540', '086520'] },
  { id: 'bio',           name: '바이오',    emoji: '🧬', stockCodes: ['196170', '028300', '068270', '141080'] },
  { id: 'ai',            name: 'AI',        emoji: '🤖', stockCodes: ['005930', '000660'] },
  { id: 'robot',         name: '로봇',      emoji: '🦾', stockCodes: ['277810', '108490'] },
  { id: 'nuclear',       name: '원전',      emoji: '⚛️', stockCodes: ['034020'] },
  { id: 'defense',       name: '방산',      emoji: '🛡️', stockCodes: ['012450'] },
  { id: 'shipbuilding',  name: '조선',      emoji: '🚢', stockCodes: ['329180'] },
  { id: 'power',         name: '전력설비',  emoji: '⚡', stockCodes: ['010120'] },
  { id: 'lowbirth',      name: '저출산',    emoji: '👶', stockCodes: ['035720'] },
];
