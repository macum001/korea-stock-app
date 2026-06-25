// jp: 시장 랭킹 스캐너 - 서버 자동 계산 (사양 4번)
// jp: 순환수집이 채운 가격(DB 마지막 정상가)을 읽어서 랭킹 계산 → Redis 저장
// jp: 프론트는 계산 결과(랭킹)만 받아서 표시. 전체 종목 직접 반복 X.
//
// jp: 계산 랭킹:
// jp:   - 급등 (등락률 상위)
// jp:   - 급락 (등락률 하위)
// jp:   - 거래량 상위
// jp:   - 거래대금 상위 (price * volume)
// jp:   - 신고가 근접 (당일 고가 = 현재가)
// jp:   - 신저가 근접 (당일 저가 = 현재가)

import { getAllStockCodes, getAllStockMaster } from '../../repositories/stockMaster.repository';
import { getLastGoodPrices } from '../../repositories/stockPrice.repository';
import { safeSetEx, isRedisReady } from '../../config/redis';
import { ENV } from '../../config/env';
import { isDbReady } from '../../config/db';

export const RANKING_KEYS = {
  topGainers: 'ranking:top-gainers',
  topLosers: 'ranking:top-losers',
  topVolume: 'ranking:top-volume',
  topValue: 'ranking:top-value',
  nearHigh: 'ranking:near-high',
  nearLow: 'ranking:near-low',
  updatedAt: 'ranking:updated-at',
};

const TTL = 600; // jp: 10분 (장외 5분 주기보다 길게 - 캐시 빈틈 방지)
const TOP_N = 30; // jp: 각 랭킹 상위 30개

export interface RankingItem {
  code: string;
  name: string;
  price: number;
  change: number;
  changeRate: number;
  volume: number;
  tradingValue: number; // jp: price * volume
}

// jp: 의미있는 거래가 있는 종목만 (거래량 0, 가격 0 제외)
function isValidForRanking(p: { price: number; volume: number }): boolean {
  return p.price > 0 && p.volume > 0;
}

let scanning = false;

// jp: 전체 종목 스캔 → 랭킹 계산 → Redis 저장
export async function scanMarket(): Promise<void> {
  if (!isRedisReady() || !isDbReady()) return;
  if (ENV.USE_MOCK_DATA) return;
  if (scanning) return; // jp: 중복 방지
  scanning = true;

  try {
    const codes = await getAllStockCodes(true);
    if (codes.length === 0) { scanning = false; return; }

    // jp: 전체 종목 마지막 정상가 한 번에 로드 (DB)
    const priceMap = await getLastGoodPrices(codes);
    if (priceMap.size === 0) { scanning = false; return; }

    // jp: 종목명 매핑 (전체 종목마스터에서 코드→이름)
    let nameMap = new Map<string, string>();
    try {
      const masters = await getAllStockMaster(true);
      for (const m of masters) nameMap.set(m.code, m.name);
    } catch { /* 이름 없으면 코드로 */ }

    // jp: RankingItem 배열로 변환
    const items: RankingItem[] = [];
    for (const [code, v] of priceMap) {
      const p = v.data;
      if (!isValidForRanking(p)) continue;
      items.push({
        code,
        name: nameMap.get(code) || p.name || code,
        price: p.price,
        change: p.change,
        changeRate: p.changeRate,
        volume: p.volume,
        tradingValue: p.price * p.volume,
      });
    }

    if (items.length === 0) { scanning = false; return; }

    // jp: 각 랭킹 계산
    const topGainers = [...items].sort((a, b) => b.changeRate - a.changeRate).slice(0, TOP_N);
    const topLosers  = [...items].sort((a, b) => a.changeRate - b.changeRate).slice(0, TOP_N);
    const topVolume  = [...items].sort((a, b) => b.volume - a.volume).slice(0, TOP_N);
    const topValue   = [...items].sort((a, b) => b.tradingValue - a.tradingValue).slice(0, TOP_N);

    // jp: 신고가 근접 - 현재가가 당일 고가와 같거나 매우 근접 (0.5% 이내) + 상승 종목
    const nearHigh = items
      .filter(i => {
        const p = priceMap.get(i.code)?.data;
        return p && p.high > 0 && i.changeRate > 0 && (p.high - i.price) / p.high < 0.005;
      })
      .sort((a, b) => b.changeRate - a.changeRate)
      .slice(0, TOP_N);

    // jp: 신저가 근접 - 현재가가 당일 저가와 같거나 매우 근접 + 하락 종목
    const nearLow = items
      .filter(i => {
        const p = priceMap.get(i.code)?.data;
        return p && p.low > 0 && i.changeRate < 0 && (i.price - p.low) / p.low < 0.005;
      })
      .sort((a, b) => a.changeRate - b.changeRate)
      .slice(0, TOP_N);

    // jp: Redis 저장
    const now = new Date().toISOString();
    await Promise.all([
      safeSetEx(RANKING_KEYS.topGainers, TTL, JSON.stringify(topGainers)),
      safeSetEx(RANKING_KEYS.topLosers, TTL, JSON.stringify(topLosers)),
      safeSetEx(RANKING_KEYS.topVolume, TTL, JSON.stringify(topVolume)),
      safeSetEx(RANKING_KEYS.topValue, TTL, JSON.stringify(topValue)),
      safeSetEx(RANKING_KEYS.nearHigh, TTL, JSON.stringify(nearHigh)),
      safeSetEx(RANKING_KEYS.nearLow, TTL, JSON.stringify(nearLow)),
      safeSetEx(RANKING_KEYS.updatedAt, TTL, now),
    ]);

    console.log(`[스캐너] 랭킹 갱신 완료 (유효종목 ${items.length}, 급등 ${topGainers.length})`);
  } catch (err) {
    console.error('[스캐너] 실패:', err instanceof Error ? err.message : err);
  } finally {
    scanning = false;
  }
}
