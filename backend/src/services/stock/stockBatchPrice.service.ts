// jp: 배치 현재가 서비스 - 여러 종목 한 번에. 캐시→외부(보호)→DB fallback
// jp: 가짜 가격 생성 금지. 실패 시 마지막 정상 가격을 stale=true로

import { StockPrice } from '../../types';
import { getCachedStockPrice, cacheStockPrice } from '../cache/stockCache.service';
import { getStockPrice } from '../kis/kisRest.service';
import { getLastGoodPrices, saveStockPrice } from '../../repositories/stockPrice.repository';
import { withCircuitBreaker } from '../performance/circuitBreaker.service';
import { enqueueExternalApiRequest, withRetryAndBackoff } from '../performance/rateLimitQueue.service';

// jp: 응답 항목 (StockPrice + stale 메타. updatedAt은 stale 메타로 덮어씀)
export interface BatchPriceItem extends Omit<StockPrice, 'updatedAt'> {
  stale: boolean;
  staleReason?: string;
  updatedAt?: string;
}

// jp: 단일 종목 가격 (보호된 외부 호출)
async function fetchPriceProtected(code: string): Promise<StockPrice | null> {
  return withCircuitBreaker('KIS_PRICE', () =>
    enqueueExternalApiRequest('KIS_PRICE', `price:${code}`, () =>
      withRetryAndBackoff(() => getStockPrice(code), { retries: 1 })
    )
  );
}

// jp: 여러 종목 가격 일괄 조회
export async function getBatchPrices(codes: string[]): Promise<BatchPriceItem[]> {
  if (codes.length === 0) return [];

  // jp: 1. 캐시에서 먼저 채움
  const result = new Map<string, BatchPriceItem>();
  const missing: string[] = [];

  await Promise.all(codes.map(async (code) => {
    const cached = await getCachedStockPrice(code);
    if (cached) {
      result.set(code, { ...cached, stale: false });
    } else {
      missing.push(code);
    }
  }));

  // jp: 2. 캐시 미스 → 먼저 DB 마지막 정상가로 즉시 채움 (REST 폭주 방지)
  // jp: WebSocket이 캐시를 채우므로 대부분 여기서 끝남. REST는 최후 수단
  if (missing.length > 0) {
    const dbMap = await getLastGoodPrices(missing);
    for (const code of missing) {
      const v = dbMap.get(code);
      if (v) {
        result.set(code, { ...v.data, stale: true, staleReason: 'WS_PENDING', updatedAt: v.updatedAt });
      }
    }
  }

  // jp: 3. 캐시도 DB도 없는 종목만 REST 조회 (순차, rate limit 보호). 보통 신규 종목뿐
  const stillMissing = missing.filter(c => !result.has(c));
  for (const code of stillMissing) {
    try {
      const fresh = await fetchPriceProtected(code);
      if (fresh) {
        result.set(code, { ...fresh, stale: false });
        void cacheStockPrice(fresh);
        void saveStockPrice(fresh);
      }
    } catch { /* 실패 시 결과에서 제외 (가짜 금지) */ }
  }

  // jp: 입력 순서 유지
  const ordered: BatchPriceItem[] = [];
  for (const c of codes) {
    const item = result.get(c);
    if (item) ordered.push(item);
  }
  return ordered;
}

// jp: DB 일괄 fallback (외부 전체 실패 시 빠른 경로용)
export async function getBatchPricesFromDbOnly(codes: string[]): Promise<BatchPriceItem[]> {
  const map = await getLastGoodPrices(codes);
  const items: BatchPriceItem[] = [];
  for (const c of codes) {
    const v = map.get(c);
    if (v) {
      items.push({ ...v.data, stale: true, staleReason: 'EXTERNAL_UNAVAILABLE', updatedAt: v.updatedAt });
    }
  }
  return items;
}
