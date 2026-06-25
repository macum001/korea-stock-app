// jp: 공시 Redis 캐시 서비스

import { safeGet, safeSetEx, safeDel, safeDelPattern } from '../../config/redis';
import { Disclosure } from '../../types/disclosure';

// jp: 캐시 키
const KEY = {
  latest:    () => 'disclosures:latest',
  important: () => 'disclosures:important',
  stock:     (code: string) => `disclosures:stock:${code}`,
  receipt:   (no: string) => `disclosure:receipt:${no}`,
};

// jp: 캐시 TTL (초)
const TTL = {
  LATEST:    180,  // 3분
  IMPORTANT: 180,
  STOCK:     180,
  RECEIPT:   600,  // 10분
};

// ============================================================
// jp: 최신 공시 캐시
// ============================================================
export async function getLatestDisclosuresFromCache(): Promise<Disclosure[] | null> {
  const cached = await safeGet(KEY.latest());
  return cached ? JSON.parse(cached) : null;
}

export async function cacheLatestDisclosures(disclosures: Disclosure[]): Promise<void> {
  await safeSetEx(KEY.latest(), TTL.LATEST, JSON.stringify(disclosures));
}

// ============================================================
// jp: 중요 공시 캐시
// ============================================================
export async function getImportantDisclosuresFromCache(): Promise<Disclosure[] | null> {
  const cached = await safeGet(KEY.important());
  return cached ? JSON.parse(cached) : null;
}

export async function cacheImportantDisclosures(disclosures: Disclosure[]): Promise<void> {
  await safeSetEx(KEY.important(), TTL.IMPORTANT, JSON.stringify(disclosures));
}

// ============================================================
// jp: 종목별 공시 캐시
// ============================================================
export async function getStockDisclosuresFromCache(stockCode: string): Promise<Disclosure[] | null> {
  const cached = await safeGet(KEY.stock(stockCode));
  return cached ? JSON.parse(cached) : null;
}

export async function cacheStockDisclosures(stockCode: string, disclosures: Disclosure[]): Promise<void> {
  await safeSetEx(KEY.stock(stockCode), TTL.STOCK, JSON.stringify(disclosures));
}

// ============================================================
// jp: 공시 상세 캐시
// ============================================================
export async function getDisclosureDetailFromCache(receiptNo: string): Promise<Disclosure | null> {
  const cached = await safeGet(KEY.receipt(receiptNo));
  return cached ? JSON.parse(cached) : null;
}

export async function cacheDisclosureDetail(receiptNo: string, disclosure: Disclosure): Promise<void> {
  await safeSetEx(KEY.receipt(receiptNo), TTL.RECEIPT, JSON.stringify(disclosure));
}

// ============================================================
// jp: 캐시 무효화 - 신규 공시 저장 후 호출
// ============================================================
export async function invalidateDisclosureCaches(stockCode?: string): Promise<void> {
  // jp: 캐시를 진짜 삭제 (이전엔 빈 문자열로 덮어써서 옛 데이터가 남는 문제가 있었음)
  await safeDel(KEY.latest());
  await safeDel(KEY.important());
  // jp: 필터별 캐시도 함께 제거
  await safeDelPattern('disclosures:filter:*');
  if (stockCode) await safeDel(KEY.stock(stockCode));
}
