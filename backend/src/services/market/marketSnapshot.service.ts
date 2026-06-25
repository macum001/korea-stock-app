// jp: 실시간 화면용 Redis 캐시/장마감 스냅샷 서비스
// jp: 토스급 최적화 버전 - 장중 tick 경로는 Redis Lua/Stream으로 빠르게 쓰고, 무거운 DB/snapshot 병합은 비동기로 얇게 처리

import { safeGet, safeSetEx, safeScanKeys } from '../../config/redis';
import { getKstParts } from '../../utils/marketTime';
import { upsertMarketSnapshot, getMarketSnapshotFromDb } from '../../repositories/marketSnapshot.repository';
import {
  RealtimeCacheKey,
  appendTradeFast,
  getLatestOrderbookFast,
  getLatestTradeFast,
  getRecentTradesFast,
  writeOrderbookFast,
  getRealtimeCacheStats,
  getStreamReplay,
} from '../cache/marketRealtimeCache.service';

const SNAPSHOT_TTL = 60 * 60 * 36; // jp: 장마감/서버재시작 대비 36시간 보존
const SNAPSHOT_TRADE_PREVIEW = 1000;
const DB_SNAPSHOT_THROTTLE_MS = 5000;
const dbSnapshotThrottle = new Map<string, number>();

export interface MarketSnapshotPayload {
  code: string;
  tradeDate: string;
  status: string;
  lastPrice?: unknown;
  orderbook?: unknown;
  trades?: unknown[];
  updatedAt: string;
}

// jp: 기존 코드 호환용 key export
export const MarketCacheKey = {
  orderbookLive: RealtimeCacheKey.orderbookLive,
  tradesLive: RealtimeCacheKey.tradesLive,
  tradesLiveJson: RealtimeCacheKey.tradesLiveJson,
  priceLive: RealtimeCacheKey.priceLive,
  snapshot: RealtimeCacheKey.snapshot,
};

async function readJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await safeGet(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function shouldWriteDbSnapshot(code: string): boolean {
  const now = Date.now();
  const last = dbSnapshotThrottle.get(code) || 0;
  if (now - last < DB_SNAPSHOT_THROTTLE_MS) return false;
  dbSnapshotThrottle.set(code, now);
  return true;
}

export async function saveLatestOrderbook(code: string, orderbook: unknown, status = 'REGULAR_OPEN'): Promise<void> {
  const now = new Date().toISOString();
  const payload = { ...(orderbook as object), code, updatedAt: now };
  await writeOrderbookFast(code, payload);
  await mergeMarketSnapshot(code, { orderbook: payload, status }, { light: true });
}

export async function getLatestOrderbook<T = unknown>(code: string): Promise<T | null> {
  return getLatestOrderbookFast<T>(code);
}

export async function appendRecentTrade(code: string, trade: unknown, status = 'REGULAR_OPEN'): Promise<unknown[]> {
  // jp: 핵심 최적화 - tick마다 5,000개 리스트를 다시 읽지 않는다.
  // jp: Redis Lua 1회로 LPUSH/LTRIM/EXPIRE/XADD/PubSub 지표까지 처리하고, 화면/API가 필요할 때만 LRANGE 한다.
  const pushed = await appendTradeFast(code, trade);
  if (!pushed) {
    const prev = await readJson<unknown[]>(MarketCacheKey.tradesLiveJson(code), []);
    await safeSetEx(MarketCacheKey.tradesLiveJson(code), 60 * 60, JSON.stringify([trade, ...prev].slice(0, 5000)));
  }
  await mergeMarketSnapshot(code, { lastPrice: trade, status }, { light: true });
  return [trade];
}

export async function replaceRecentTrades(code: string, trades: unknown[], status = 'REGULAR_OPEN'): Promise<void> {
  const next = trades.slice(0, 5000);
  await safeSetEx(MarketCacheKey.tradesLiveJson(code), 60 * 60, JSON.stringify(next));
  await mergeMarketSnapshot(code, { trades: next.slice(0, SNAPSHOT_TRADE_PREVIEW), lastPrice: next[0], status });
}

export async function getRecentTrades<T = unknown>(code: string, limit = 300): Promise<T[]> {
  return getRecentTradesFast<T>(code, limit);
}

export async function mergeMarketSnapshot(
  code: string,
  patch: Partial<MarketSnapshotPayload>,
  options: { light?: boolean } = {},
): Promise<void> {
  const prev = await readJson<MarketSnapshotPayload | null>(MarketCacheKey.snapshot(code), null);
  const next: MarketSnapshotPayload = {
    code,
    tradeDate: prev?.tradeDate ?? getKstParts().ymd,
    status: patch.status ?? prev?.status ?? 'REGULAR_OPEN',
    lastPrice: patch.lastPrice ?? prev?.lastPrice,
    orderbook: patch.orderbook ?? prev?.orderbook,
    // jp: light 모드에서는 tick마다 trades 배열을 snapshot에 재저장하지 않음. 장마감 확정/조회 때만 합침.
    trades: options.light ? (prev?.trades ?? []) : (patch.trades ?? prev?.trades ?? []),
    updatedAt: new Date().toISOString(),
  };
  await safeSetEx(MarketCacheKey.snapshot(code), SNAPSHOT_TTL, JSON.stringify(next));
  if (!options.light || shouldWriteDbSnapshot(code)) {
    void upsertMarketSnapshot({
      stockCode: code,
      status: next.status,
      lastPrice: next.lastPrice,
      orderbook: next.orderbook,
      trades: next.trades,
    });
  }
}

export async function getMarketSnapshot(code: string): Promise<MarketSnapshotPayload | null> {
  const redisSnapshot = await readJson<MarketSnapshotPayload | null>(MarketCacheKey.snapshot(code), null);
  if (redisSnapshot) {
    const liveTrades = await getRecentTrades(code, SNAPSHOT_TRADE_PREVIEW);
    const lastTrade = await getLatestTradeFast(code);
    return {
      ...redisSnapshot,
      lastPrice: lastTrade ?? redisSnapshot.lastPrice,
      trades: liveTrades.length > 0 ? liveTrades : (redisSnapshot.trades ?? []),
    };
  }

  const dbSnapshot = await getMarketSnapshotFromDb(code);
  if (!dbSnapshot) return null;
  return {
    code,
    tradeDate: dbSnapshot.trade_date,
    status: dbSnapshot.status,
    lastPrice: dbSnapshot.last_price,
    orderbook: dbSnapshot.orderbook,
    trades: dbSnapshot.trades ?? [],
    updatedAt: dbSnapshot.updated_at,
  };
}

// jp: Stream replay - WS 재접속 직후 밀린 tick 복구용
export async function getRecentMarketEvents(code: string, count = 300) {
  return getStreamReplay(code, count);
}

// jp: 장마감/서버재시작 대비 - Redis에 남은 live/snapshot 키를 DB snapshot으로 확정 저장
export async function finalizeMarketSnapshot(code: string, status = 'CLOSED'): Promise<MarketSnapshotPayload | null> {
  const snapshot = await getMarketSnapshot(code);
  const liveOrderbook = await getLatestOrderbook(code);
  const liveTrades = await getRecentTrades(code, 5000);
  const next: MarketSnapshotPayload = {
    code,
    tradeDate: snapshot?.tradeDate ?? getKstParts().ymd,
    status,
    lastPrice: liveTrades[0] ?? snapshot?.lastPrice,
    orderbook: liveOrderbook ?? snapshot?.orderbook,
    trades: liveTrades.length > 0 ? liveTrades : (snapshot?.trades ?? []),
    updatedAt: new Date().toISOString(),
  };
  await safeSetEx(MarketCacheKey.snapshot(code), SNAPSHOT_TTL, JSON.stringify(next));
  await upsertMarketSnapshot({
    stockCode: code,
    status: next.status,
    lastPrice: next.lastPrice,
    orderbook: next.orderbook,
    trades: next.trades,
  });
  return next;
}

export async function finalizeAllMarketSnapshots(status = 'CLOSED'): Promise<{ finalized: number; codes: string[] }> {
  const keys = await safeScanKeys('market_snapshot:*');
  const liveOrderbookKeys = await safeScanKeys('orderbook:live:*');
  const liveTradeKeys = await safeScanKeys('trades:live:*');
  const codes = new Set<string>();
  for (const key of [...keys, ...liveOrderbookKeys, ...liveTradeKeys]) {
    const code = key.split(':').pop();
    if (code && /^\d{6}$/.test(code)) codes.add(code);
  }
  let finalized = 0;
  for (const code of codes) {
    const result = await finalizeMarketSnapshot(code, status);
    if (result) finalized++;
  }
  return { finalized, codes: [...codes] };
}

export async function getMarketRealtimeCacheStats(): Promise<Record<string, unknown>> {
  return getRealtimeCacheStats();
}
