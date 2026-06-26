// jp: 공시 동기화 서비스 - 수집→분류→저장→캐시→알림 전체 오케스트레이션

import { Disclosure } from '../../types/disclosure';
import { getDisclosureDataProvider } from './disclosureDataProvider';
import {
  upsertDisclosure,
  findDisclosureByReceiptNo,
  getLatestDisclosures as dbGetLatest,
  getImportantDisclosures as dbGetImportant,
  getDisclosuresByStockCode as dbGetByStock,
  countDisclosuresByStockCode as dbCountByStock,
  searchDisclosures as dbSearch,
} from '../../repositories/disclosure.repository';
import {
  getLatestDisclosuresFromCache, cacheLatestDisclosures,
  getImportantDisclosuresFromCache, cacheImportantDisclosures,
  getStockDisclosuresFromCache, cacheStockDisclosures,
  invalidateDisclosureCaches,
} from './disclosureCache.service';
import { createDisclosureNotification } from './disclosureAlert.service';
import { broadcastDisclosureUpdate } from '../realtime/broadcast.service';

export interface SyncResult {
  total:      number;
  newCount:   number;
  skipCount:  number;
  errorCount: number;
  important:  number;
}

// ============================================================
// jp: 조회 함수 - 캐시 → DB 순서 (없으면 빈 배열)
// ============================================================

// jp: 최신 공시 조회 (Redis → PostgreSQL)
export async function getLatestDisclosures(): Promise<Disclosure[]> {
  const cached = await getLatestDisclosuresFromCache();
  if (cached && cached.length > 0) return cached;

  try {
    const dbResult = await dbGetLatest(500);
    if (dbResult.length > 0) {
      await cacheLatestDisclosures(dbResult);
      return dbResult;
    }
  } catch { /* DB 없으면 다음 단계 */ }

  const provider = getDisclosureDataProvider();
  const fresh = await provider.fetchLatestDisclosures();
  if (fresh.length > 0) await cacheLatestDisclosures(fresh);
  return fresh;
}

// jp: 전체 공시 페이지 조회 (무한스크롤용) - 캐시 우회 DB 직접, offset 지원
export async function getLatestDisclosuresPage(limit = 50, offset = 0): Promise<{ items: Disclosure[]; hasMore: boolean }> {
  try {
    const items = await dbGetLatest(limit, offset);
    return { items, hasMore: items.length >= limit };
  } catch {
    return { items: [], hasMore: false };
  }
}

// jp: 중요 공시 조회
export async function getImportantDisclosures(): Promise<Disclosure[]> {
  const cached = await getImportantDisclosuresFromCache();
  if (cached && cached.length > 0) return cached;

  try {
    const dbResult = await dbGetImportant(50);
    if (dbResult.length > 0) {
      await cacheImportantDisclosures(dbResult);
      return dbResult;
    }
  } catch { /* */ }

  const provider = getDisclosureDataProvider();
  const all = await provider.fetchLatestDisclosures();
  const important = all.filter(d => d.importance !== 'normal');
  if (important.length > 0) await cacheImportantDisclosures(important);
  return important;
}

// jp: 종목별 공시 조회 (첫 페이지 - 캐시 사용). 기존 호출부 호환 유지.
export async function getDisclosuresByStockCode(stockCode: string, limit = 30): Promise<Disclosure[]> {
  const cached = await getStockDisclosuresFromCache(stockCode);
  if (cached && cached.length > 0) return cached;

  try {
    const dbResult = await dbGetByStock(stockCode, limit);
    if (dbResult.length > 0) {
      await cacheStockDisclosures(stockCode, dbResult);
      return dbResult;
    }
  } catch { /* */ }

  const provider = getDisclosureDataProvider();
  const fresh = await provider.fetchDisclosuresByStockCode(stockCode);
  if (fresh.length > 0) await cacheStockDisclosures(stockCode, fresh);
  return fresh;
}

// jp: ★ 종목별 공시 '페이지' 조회 - 무한스크롤용
// jp:   - DB 를 직접 limit/offset 으로 조회 (캐시 우회 → 30건 캐시가 페이지네이션 막는 문제 해결)
// jp:   - total 도 함께 반환해 프론트가 "끝" 판단
export interface StockDisclosurePage {
  items: Disclosure[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}
export async function getStockDisclosurePage(
  stockCode: string,
  limit = 50,
  offset = 0,
  categoryType?: string
): Promise<StockDisclosurePage> {
  let items: Disclosure[] = [];
  let total = 0;
  try {
    // jp: DB 직접 조회 (캐시 우회) - 보유분 전체를 페이지로 끝까지 넘길 수 있게
    [items, total] = await Promise.all([
      dbGetByStock(stockCode, limit, offset, categoryType),
      dbCountByStock(stockCode, categoryType),
    ]);
  } catch {
    // jp: DB 실패 시 provider fallback (페이지네이션 불가 → 전체 반환)
    try {
      const provider = getDisclosureDataProvider();
      const fresh = await provider.fetchDisclosuresByStockCode(stockCode);
      items = fresh.slice(offset, offset + limit);
      total = fresh.length;
    } catch { /* 빈 결과 */ }
  }
  const hasMore = offset + items.length < total;
  return { items, total, limit, offset, hasMore };
}

// jp: 공시 검색
export async function searchDisclosures(keyword: string): Promise<Disclosure[]> {
  try {
    const dbResult = await dbSearch(keyword, 50);
    if (dbResult.length > 0) return dbResult;
  } catch { /* */ }

  const all = await getLatestDisclosures();
  const kw = keyword.toLowerCase();
  return all.filter(d =>
    d.reportName.toLowerCase().includes(kw) ||
    (d.stockName?.toLowerCase().includes(kw))
  );
}

// jp: 공시 상세 조회
export async function getDisclosureByReceiptNo(receiptNo: string): Promise<Disclosure | null> {
  try {
    const fromDb = await findDisclosureByReceiptNo(receiptNo);
    if (fromDb) return fromDb;
  } catch { /* */ }

  const all = await getLatestDisclosures();
  return all.find(d => d.receiptNo === receiptNo) ?? null;
}

// ============================================================
// jp: 동기화 파이프라인 - 스케줄러에서 호출
// ============================================================

export async function syncLatestDisclosures(): Promise<SyncResult> {
  const result: SyncResult = { total: 0, newCount: 0, skipCount: 0, errorCount: 0, important: 0 };

  try {
    const provider = getDisclosureDataProvider();
    const disclosures = await provider.fetchLatestDisclosures();
    result.total = disclosures.length;

    for (const disclosure of disclosures) {
      try {
        await processNewDisclosure(disclosure, result);
      } catch (err) {
        result.errorCount++;
        console.error(`[Sync] 공시 처리 실패 (${disclosure.receiptNo}):`, err instanceof Error ? err.message : err);
      }
    }

    await invalidateDisclosureCaches();

    console.log(`[Sync] 완료 - 전체:${result.total} 신규:${result.newCount} 중복:${result.skipCount} 중요:${result.important} 에러:${result.errorCount}`);

  } catch (err) {
    console.error('[Sync] 동기화 실패:', err instanceof Error ? err.message : err);
  }

  return result;
}

async function processNewDisclosure(disclosure: Disclosure, result: SyncResult): Promise<void> {
  try {
    const { saved } = await upsertDisclosure(disclosure);
    if (!saved) {
      result.skipCount++;
      return;
    }
  } catch {
    /* DB 없으면 메모리 처리로 진행 (mock 모드) */
  }

  result.newCount++;

  // jp: 모든 신규 공시를 알림 함수에 전달 (구독 안 한 종목/유형은 내부에서 자동 필터)
  if (disclosure.importance !== 'normal') result.important++;
  await createDisclosureNotification(disclosure);
}

export async function syncDisclosuresByStockCode(stockCode: string): Promise<SyncResult> {
  const result: SyncResult = { total: 0, newCount: 0, skipCount: 0, errorCount: 0, important: 0 };
  try {
    const provider = getDisclosureDataProvider();
    const disclosures = await provider.fetchDisclosuresByStockCode(stockCode);
    result.total = disclosures.length;
    for (const d of disclosures) {
      try { await processNewDisclosure(d, result); }
      catch { result.errorCount++; }
    }
    await invalidateDisclosureCaches(stockCode);
  } catch (err) {
    console.error(`[Sync] 종목(${stockCode}) 동기화 실패:`, err instanceof Error ? err.message : err);
  }
  return result;
}
