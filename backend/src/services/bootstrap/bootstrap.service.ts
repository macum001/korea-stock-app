// jp: Bootstrap 서비스 - 첫 화면 데이터 한 번에 조립
// jp: 각 조각은 캐시/DB 기반. 없으면 빈 배열/null (가짜 데이터 금지)

import { isDbReady } from '../../config/db';
import { isRedisReady, safeGet } from '../../config/redis';
import { getImportantDisclosures } from '../../repositories/disclosure.repository';
import * as wl from '../../repositories/watchlist.repository';
import { ENV } from '../../config/env';

export interface BootstrapData {
  marketIndices: unknown[];
  watchlistSummary: { groupCount: number; itemCount: number; groups: { id: string; name: string; count: number }[] };
  importantDisclosures: unknown[];
  featuredStocks: unknown[];
  discoverySummary: Record<string, unknown> | null;
  unreadNotificationCount: number;
  stale: boolean;
  updatedAt: string;
}

// jp: 사전 계산된 discovery summary 캐시 키
const DISCOVERY_SUMMARY_KEY = 'discovery:summary';
const FEATURED_KEY = 'discovery:featured';
const MARKET_INDICES_KEY = 'market:indices';

export async function getBootstrapData(userId: string = 'default'): Promise<BootstrapData> {
  let stale = false;

  // jp: 1. 시장지수 (Redis 사전계산 캐시)
  let marketIndices: unknown[] = [];
  if (isRedisReady()) {
    try {
      const cached = await safeGet(MARKET_INDICES_KEY);
      if (cached) marketIndices = JSON.parse(cached);
      else stale = true;
    } catch { stale = true; }
  }

  // jp: 2. 관심종목 요약 (DB)
  let watchlistSummary: BootstrapData['watchlistSummary'] = { groupCount: 0, itemCount: 0, groups: [] };
  if (isDbReady()) {
    try {
      const [groups, items] = await Promise.all([wl.getGroups(userId), wl.getItems(userId)]);
      watchlistSummary = {
        groupCount: groups.length,
        itemCount: items.length,
        groups: groups.map(g => ({
          id: g.id, name: g.name,
          count: items.filter(i => i.group_id === g.id).length,
        })),
      };
    } catch { /* 빈 요약 유지 */ }
  }

  // jp: 3. 오늘의 주요공시 상위 3 (DB)
  let importantDisclosures: unknown[] = [];
  if (isDbReady() && !ENV.USE_MOCK_DISCLOSURE) {
    try { importantDisclosures = await getImportantDisclosures(3); } catch { /* 빈 배열 */ }
  }

  // jp: 4. 장중 특징주 상위 3 (Redis 사전계산)
  let featuredStocks: unknown[] = [];
  if (isRedisReady()) {
    try {
      const cached = await safeGet(FEATURED_KEY);
      if (cached) {
        const sections = JSON.parse(cached) as { stocks: unknown[] }[];
        // jp: 첫 섹션 상위 3개만
        featuredStocks = (sections[0]?.stocks ?? []).slice(0, 3);
      }
    } catch { /* 빈 배열 */ }
  }

  // jp: 5. 발견 요약 일부 (Redis 사전계산)
  let discoverySummary: Record<string, unknown> | null = null;
  if (isRedisReady()) {
    try {
      const cached = await safeGet(DISCOVERY_SUMMARY_KEY);
      if (cached) discoverySummary = JSON.parse(cached);
    } catch { /* null */ }
  }

  // jp: 6. 읽지 않은 알림 개수 - 알림은 클라이언트 store가 관리하므로 0 (서버 알림 DB 연결 시 확장)
  const unreadNotificationCount = 0;

  return {
    marketIndices,
    watchlistSummary,
    importantDisclosures,
    featuredStocks,
    discoverySummary,
    unreadNotificationCount,
    stale,
    updatedAt: new Date().toISOString(),
  };
}
