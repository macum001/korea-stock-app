// jp: 관심종목 기반 공시 피드 - 기존 캐시/동기화를 그대로 재사용하고 "구독 필터"만 추가
import { query } from '../../config/db';
import { getLatestDisclosures, getDisclosuresByStockCode } from './disclosureSync.service';
import { Disclosure } from '../../types/disclosure';

// jp: 내 관심종목(watchlists) 코드 목록 (= 공시 구독 종목)
export async function getMyWatchlistCodes(userId: string): Promise<string[]> {
  const rows = await query<{ stockCode: string }>(
    `SELECT stock_code AS "stockCode" FROM watchlists WHERE user_id = $1`,
    [userId],
  );
  return rows.map((r) => r.stockCode);
}

// jp: 내 구독 종목 공시 피드
// jp: getLatestDisclosures()가 이미 Redis 캐시(latest 500)를 쓰므로 여기선 메모리 필터만
export async function getMyDisclosureFeed(userId: string, limit = 50): Promise<Disclosure[]> {
  const codes = await getMyWatchlistCodes(userId);
  if (codes.length === 0) return [];
  // jp: 관심종목 각각 DB에서 공시 조회 후 합쳐서 최신순 (캐시 latest 500 필터로는 종목별 누락 발생)
  const perStock = await Promise.all(
    codes.map((code) => getDisclosuresByStockCode(code, 20).catch(() => [] as Disclosure[])),
  );
  const merged = perStock.flat();
  merged.sort((a, b) => new Date(b.disclosedAt).getTime() - new Date(a.disclosedAt).getTime());
  return merged.slice(0, limit);
}
