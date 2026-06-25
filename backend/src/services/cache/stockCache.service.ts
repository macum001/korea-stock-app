// jp: 주식 캐시 서비스
// jp: 변경: cacheStockPrice에 가격 알림 체크 훅 추가
// jp: → 모든 가격이 이 함수를 지나가므로 단일 지점에서 알림 트리거 (kisWebSocket 미수정)

import { safeGet, safeSetEx, CacheKey, CACHE_TTL } from '../../config/redis';
import { StockPrice } from '../../types';
import { checkPriceAlerts } from '../alert/priceAlert.service';

export async function cacheStockPrice(price: StockPrice): Promise<void> {
  await safeSetEx(CacheKey.stockPrice(price.code), CACHE_TTL.STOCK_PRICE, JSON.stringify(price));

  // jp: 가격 알림 조건 체크 (비동기, 캐시 저장 블로킹 안 함)
  // jp: 해당 종목에 알림 조건 없으면 priceAlert 내부에서 즉시 종료 (빠른 경로)
  void checkPriceAlerts(price);
}

export async function getCachedStockPrice(code: string): Promise<StockPrice | null> {
  const cached = await safeGet(CacheKey.stockPrice(code));
  return cached ? JSON.parse(cached) : null;
}
