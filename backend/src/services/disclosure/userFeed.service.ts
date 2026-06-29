// jp: 관심종목 기반 공시 피드 - 기존 캐시/동기화를 그대로 재사용하고 "구독 필터"만 추가
import { query } from '../../config/db';
import { getStockDisclosurePage } from './disclosureSync.service';
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
export async function getMyDisclosureFeed(userId: string, limit = 50, categoryType?: string): Promise<Disclosure[]> {
  const codes = await getMyWatchlistCodes(userId);
  if (codes.length === 0) return [];
  // jp: getStockDisclosurePage는 캐시를 우회하고 categoryType을 DB 쿼리에 직접 전달함 (캐시 래퍼 getDisclosuresByStockCode는 categoryType을 무시하므로 사용 불가)
  // jp: 과거 버그: 종목별 최신 20건(전체 카테고리)을 가져온 뒤 메모리에서 필터 → 실적재무 등 드문 공시가 최신 20건에 없어서 결과 0건이 되던 문제. DB에서 카테고리별로 직접 조회해 해결.
  const perStock = await Promise.all(
    codes.map((code) => getStockDisclosurePage(code, 20, 0, categoryType).then((p) => p.items).catch(() => [] as Disclosure[])),
  );
  const merged = perStock.flat();
  merged.sort((a, b) => new Date(b.disclosedAt).getTime() - new Date(a.disclosedAt).getTime());
  return merged.slice(0, limit);
}
