// jp: 발견 화면 계산 로직 - mock 기반, 나중에 실제 API 교체 가능

import { DISCOVERY_STOCKS, STOCK_THEMES, DiscoveryStock, StockTheme } from '@/data/discoveryData';
import { apiClient } from '@/services/apiClient';

// jp: 백엔드 시세 응답 타입
interface BackendPrice {
  code: string;
  price: number;
  change: number;
  changeRate: number;
  volume: number;
}

// jp: 백엔드 발견 API 응답 (전 종목 순위 기반)
export interface BackendGainer {
  code: string; name: string; price: number; changeRate: number;
  volume: number; grade: string; reason: string;
}
export interface BackendVolumeSpike {
  code: string; name: string; price: number; changeRate: number;
  volume: number; tradingValue: number; volumeIncreaseRate: number; reason: string;
}
export interface BackendTheme {
  id: string; name: string; emoji: string;
  avgChangeRate: number; risingCount: number; totalCount: number;
  leader: { code: string; name: string; price: number; changeRate: number } | null;
  stocks: { code: string; name: string; price: number; changeRate: number }[];
  score: number; reason: string;
}
interface BackendDiscovery {
  gainers: BackendGainer[];
  volumeSpikes: BackendVolumeSpike[];
  themes: BackendTheme[];
  disclosures: unknown[];
}

// jp: 백엔드 발견 결과 캐시 (전 종목 순위)
let backendDiscovery: BackendDiscovery | null = null;

// jp: 백엔드 발견 결과 접근자 (DiscoverPage가 사용)
export function getBackendGainers(): BackendGainer[] {
  return backendDiscovery?.gainers ?? [];
}
export function getBackendVolumeSpikes(): BackendVolumeSpike[] {
  return backendDiscovery?.volumeSpikes ?? [];
}
export function getBackendThemes(): BackendTheme[] {
  return backendDiscovery?.themes ?? [];
}

// jp: 실시간 시세로 갱신된 종목 데이터 (메모리 캐시)
// jp: A안 - mock 가격으로 시작하지 않음. 백엔드 실데이터가 채워질 때만 표시 (없으면 빈 상태)
let liveStocks: DiscoveryStock[] = [];

// jp: 백엔드에서 실제 시세를 받아 종목 데이터 갱신
// jp: A안 - 실데이터만 사용. mock 가격 fallback 없음. 실패 시 빈 배열(빈 상태 UI)
export async function refreshDiscoveryPrices(): Promise<DiscoveryStock[]> {
  // jp: 실가격을 종목 메타(이름/테마/avgVolume)에 입힘. 실값 없는 종목은 제외
  const applyPrices = (priceMap: Map<string, BackendPrice>): DiscoveryStock[] =>
    DISCOVERY_STOCKS
      .map(s => {
        const live = priceMap.get(s.code);
        // jp: 실가격 없으면 제외 (mock 가격 표시 금지)
        if (!live || !live.price || live.price <= 0) return null;
        return {
          ...s,
          price:      live.price,
          change:     live.change,
          changeRate: live.changeRate,
          volume:     live.volume || 0,
        };
      })
      .filter((s): s is DiscoveryStock => s !== null);

  // jp: ① 발견 종합 API 우선 - 백엔드 전 종목 순위 결과(gainers/volumeSpikes/themes)
  // jp: 이걸 모듈 캐시에 저장 → getTopGainers 등이 반환 (전 종목 기반 실데이터)
  try {
    const data = await apiClient.get<BackendDiscovery>('/api/discovery');
    if (data && (data.gainers?.length || data.volumeSpikes?.length || data.themes?.length)) {
      backendDiscovery = data;
      // jp: 백엔드가 데이터 줬으면 그걸로 화면 채움. liveStocks는 호환용으로만 유지
      return liveStocks;
    }
  } catch {
    // jp: 다음 단계로
  }

  // jp: ② 개별 시세 일괄 조회 (백엔드 발견 API 실패 시 로컬 종목 fallback)
  try {
    const codes = DISCOVERY_STOCKS.map(s => s.code).join(',');
    const prices = await apiClient.get<BackendPrice[]>(`/api/stocks/prices?codes=${codes}`);
    if (prices && prices.length > 0) {
      liveStocks = applyPrices(new Map(prices.map(p => [p.code, p])));
      return liveStocks;
    }
  } catch {
    // jp: 실패 → 아래 빈 배열
  }

  // jp: ③ 실데이터 없음 → mock 금지. 단 이전에 받은 데이터가 있으면 유지(깜빡임 방지)
  // jp: 최초부터 실패면 liveStocks가 []라 빈 상태. 한 번이라도 받았으면 그대로 둠
  return liveStocks;
}

// jp: 현재 종목 데이터 (실시간 갱신본 우선)
function currentStocks(): DiscoveryStock[] {
  return liveStocks;
}

// jp: 기준값 상수
const SURGE_RATE = 5;        // jp: 급등 +5%
const PLUNGE_RATE = -5;      // jp: 급락 -5%
const VOLUME_SPIKE = 2;      // jp: 거래량 급증 2배
const HIGH_PROXIMITY = 0.95; // jp: 신고가 근접 (52주 최고의 95% 이상)

// jp: 전체 종목 조회
export function getAllDiscoveryStocks(): DiscoveryStock[] {
  return [...currentStocks()];
}

// jp: 거래량 급증 배율 계산
export function getVolumeSpikeRatio(stock: DiscoveryStock): number {
  if (!stock.avgVolume) return 0;
  return stock.volume / stock.avgVolume;
}

// jp: 오늘의 급등 - changeRate 내림차순, +5% 이상
export function getTopGainers(threshold = SURGE_RATE): DiscoveryStock[] {
  return currentStocks()
    .filter(s => s.changeRate >= threshold)
    .sort((a, b) => b.changeRate - a.changeRate);
}

// jp: 오늘의 급락 - changeRate 오름차순, -5% 이하
export function getTopLosers(threshold = PLUNGE_RATE): DiscoveryStock[] {
  return currentStocks()
    .filter(s => s.changeRate <= threshold)
    .sort((a, b) => a.changeRate - b.changeRate);
}

// jp: 거래량 급증 - 평균 대비 2배 이상, 배율 내림차순
export function getVolumeSpikeStocks(threshold = VOLUME_SPIKE): (DiscoveryStock & { spikeRatio: number })[] {
  return currentStocks()
    .map(s => ({ ...s, spikeRatio: getVolumeSpikeRatio(s) }))
    .filter(s => s.spikeRatio >= threshold)
    .sort((a, b) => b.spikeRatio - a.spikeRatio);
}

// jp: 테마 평균 등락률
export function calculateThemePerformance(themeId: string): number {
  const theme = STOCK_THEMES.find(t => t.id === themeId);
  if (!theme) return 0;
  const stocks = theme.stockCodes
    .map(code => currentStocks().find(s => s.code === code))
    .filter((s): s is DiscoveryStock => !!s);
  if (stocks.length === 0) return 0;
  const sum = stocks.reduce((acc, s) => acc + s.changeRate, 0);
  return sum / stocks.length;
}

// jp: 테마별 종목 + 평균 등락률
export interface ThemeWithPerformance extends StockTheme {
  avgChangeRate: number;
  stocks: DiscoveryStock[];
}

export function getThemeStocks(): ThemeWithPerformance[] {
  return STOCK_THEMES
    .map(theme => {
      const stocks = theme.stockCodes
        .map(code => currentStocks().find(s => s.code === code))
        .filter((s): s is DiscoveryStock => !!s);
      return {
        ...theme,
        stocks,
        avgChangeRate: calculateThemePerformance(theme.id),
      };
    })
    // jp: 평균 등락률 내림차순 (강세 테마 먼저)
    .sort((a, b) => b.avgChangeRate - a.avgChangeRate);
}

// jp: 오늘의 주요 공시 - A안: mock 금지. 실제 공시는 DiscoverPage가 /api/disclosures/important로 조회
// jp: 이 동기 함수는 빈 배열 반환 (호환 유지용)
export function getTodayImportantDisclosures() {
  return [] as { stockCode?: string; importance: string; disclosedAt: string; [k: string]: unknown }[];
}

// jp: 종목의 특징 사유 + 점수 계산
export interface FeaturedReason {
  label: string;
  score: number;
}

export function getFeaturedReasons(stock: DiscoveryStock): FeaturedReason[] {
  const reasons: FeaturedReason[] = [];

  // jp: A안 - mock 공시 기반 점수 제거 (실데이터 연동은 추후). 거래량/등락 기반만 사용

  // jp: 거래량 급증 (+4 if 3배 이상, +3 if 2배 이상)
  const spikeRatio = getVolumeSpikeRatio(stock);
  if (spikeRatio >= 3) {
    reasons.push({ label: `거래량 ${spikeRatio.toFixed(1)}배 급증`, score: 4 });
  } else if (spikeRatio >= VOLUME_SPIKE) {
    reasons.push({ label: `거래량 ${spikeRatio.toFixed(1)}배 증가`, score: 2 });
  }

  // jp: 급등/급락 (+3)
  if (stock.changeRate >= SURGE_RATE) {
    reasons.push({ label: `+${stock.changeRate.toFixed(1)}% 급등`, score: 3 });
  } else if (stock.changeRate <= PLUNGE_RATE) {
    reasons.push({ label: `${stock.changeRate.toFixed(1)}% 급락`, score: 3 });
  }

  // jp: 테마 강세 (+2) - 소속 테마 평균이 +3% 이상
  const themes = STOCK_THEMES.filter(t => t.stockCodes.includes(stock.code));
  for (const theme of themes) {
    const perf = calculateThemePerformance(theme.id);
    if (perf >= 3) {
      reasons.push({ label: `${theme.name} 테마 강세`, score: 2 });
      break; // jp: 테마 강세는 한 번만
    }
  }

  // jp: 신고가 근접 (+2) - 52주 최고의 95% 이상
  if (stock.high52w && stock.price >= stock.high52w * HIGH_PROXIMITY) {
    reasons.push({ label: '신고가 근접', score: 2 });
  }

  // jp: 장중 변동성 확대 (+1) - 등락률 절댓값 3% 이상
  if (Math.abs(stock.changeRate) >= 3 && Math.abs(stock.changeRate) < SURGE_RATE) {
    reasons.push({ label: '변동성 확대', score: 1 });
  }

  return reasons;
}

// jp: 장중 특징주 - 사유 점수 합산, 정렬
export interface FeaturedStock extends DiscoveryStock {
  reasons: FeaturedReason[];
  totalScore: number;
}

export function getIntradayFeaturedStocks(): FeaturedStock[] {
  return currentStocks()
    .map(stock => {
      const reasons = getFeaturedReasons(stock);
      const totalScore = reasons.reduce((acc, r) => acc + r.score, 0);
      return { ...stock, reasons, totalScore };
    })
    // jp: 사유가 하나 이상 있는 종목만
    .filter(s => s.reasons.length > 0)
    .sort((a, b) => b.totalScore - a.totalScore);
}
