// jp: 토스급 Redis 실시간 캐시 코어
// jp: 목표 - tick 1개당 Redis round-trip 최소화, replay 가능한 Stream 유지, WS 서버 수평확장 fanout 지원

import { safeEval, safeGet, safeListRange, safePublish, safeRedisInfo, safeSetEx, safeXRevRange } from '../../config/redis';

const LIVE_TTL = 60 * 60;
const SNAPSHOT_TTL = 60 * 60 * 36;
const MAX_RECENT_TRADES = 5000;
const MAX_STREAM_EVENTS_PER_SYMBOL = 100_000;
const MAX_GLOBAL_STREAM_EVENTS = 500_000;
const PUBSUB_CHANNEL = 'market:events';

export const RealtimeCacheKey = {
  orderbookLive: (code: string) => `orderbook:live:${code}`,
  tradesLive: (code: string) => `trades:live:${code}`,
  tradesLiveJson: (code: string) => `trades:live:json:${code}`,
  priceLive: (code: string) => `price:live:${code}`,
  snapshot: (code: string) => `market_snapshot:${code}`,
  symbolStream: (code: string) => `stream:market:${code}`,
  globalStream: () => 'stream:market:all',
  metrics: () => 'metrics:market:realtime',
};

const TRADE_APPEND_LUA = `
redis.call('LPUSH', KEYS[1], ARGV[1])
redis.call('LTRIM', KEYS[1], 0, tonumber(ARGV[2]) - 1)
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
redis.call('SETEX', KEYS[2], tonumber(ARGV[3]), ARGV[1])
redis.call('XADD', KEYS[3], 'MAXLEN', '~', tonumber(ARGV[4]), '*', 'type', 'trade', 'code', ARGV[5], 'payload', ARGV[1], 'ts', ARGV[6])
redis.call('XADD', KEYS[4], 'MAXLEN', '~', tonumber(ARGV[7]), '*', 'type', 'trade', 'code', ARGV[5], 'payload', ARGV[1], 'ts', ARGV[6])
redis.call('HINCRBY', KEYS[5], 'tradeTicks', 1)
redis.call('HSET', KEYS[5], 'lastTradeAt', ARGV[6], 'lastTradeCode', ARGV[5])
return 1
`;

const ORDERBOOK_WRITE_LUA = `
redis.call('SETEX', KEYS[1], tonumber(ARGV[2]), ARGV[1])
redis.call('XADD', KEYS[2], 'MAXLEN', '~', tonumber(ARGV[3]), '*', 'type', 'orderbook', 'code', ARGV[4], 'payload', ARGV[1], 'ts', ARGV[5])
redis.call('XADD', KEYS[3], 'MAXLEN', '~', tonumber(ARGV[6]), '*', 'type', 'orderbook', 'code', ARGV[4], 'payload', ARGV[1], 'ts', ARGV[5])
redis.call('HINCRBY', KEYS[4], 'orderbookTicks', 1)
redis.call('HSET', KEYS[4], 'lastOrderbookAt', ARGV[5], 'lastOrderbookCode', ARGV[4])
return 1
`;

export interface StreamMarketEvent<T = unknown> {
  id: string;
  type: 'trade' | 'orderbook';
  code: string;
  payload: T;
  ts?: number;
}

function safeJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export async function writeOrderbookFast(code: string, orderbook: unknown): Promise<boolean> {
  const payload = JSON.stringify(orderbook);
  const ts = String(Date.now());
  const ok = await safeEval(
    ORDERBOOK_WRITE_LUA,
    [RealtimeCacheKey.orderbookLive(code), RealtimeCacheKey.symbolStream(code), RealtimeCacheKey.globalStream(), RealtimeCacheKey.metrics()],
    [payload, String(LIVE_TTL), String(MAX_STREAM_EVENTS_PER_SYMBOL), code, ts, String(MAX_GLOBAL_STREAM_EVENTS)],
  );
  void safePublish(PUBSUB_CHANNEL, JSON.stringify({ type: 'orderbook', code, ts: Number(ts), payload: orderbook }));
  return ok === 1 || ok === '1';
}

export async function appendTradeFast(code: string, trade: unknown): Promise<boolean> {
  const payload = JSON.stringify(trade);
  const ts = String(Date.now());
  const ok = await safeEval(
    TRADE_APPEND_LUA,
    [RealtimeCacheKey.tradesLive(code), RealtimeCacheKey.priceLive(code), RealtimeCacheKey.symbolStream(code), RealtimeCacheKey.globalStream(), RealtimeCacheKey.metrics()],
    [payload, String(MAX_RECENT_TRADES), String(LIVE_TTL), String(MAX_STREAM_EVENTS_PER_SYMBOL), code, ts, String(MAX_GLOBAL_STREAM_EVENTS)],
  );
  void safePublish(PUBSUB_CHANNEL, JSON.stringify({ type: 'trade', code, ts: Number(ts), payload: trade }));
  return ok === 1 || ok === '1';
}

export async function getLatestOrderbookFast<T = unknown>(code: string): Promise<T | null> {
  return safeJson<T | null>(await safeGet(RealtimeCacheKey.orderbookLive(code)), null);
}

export async function getLatestTradeFast<T = unknown>(code: string): Promise<T | null> {
  return safeJson<T | null>(await safeGet(RealtimeCacheKey.priceLive(code)), null);
}

export async function getRecentTradesFast<T = unknown>(code: string, limit = 300): Promise<T[]> {
  const capped = Math.min(Math.max(limit, 1), MAX_RECENT_TRADES);
  const listRows = await safeListRange(RealtimeCacheKey.tradesLive(code), 0, capped - 1);
  if (listRows.length > 0) {
    return listRows.map(raw => safeJson<T | null>(raw, null)).filter(Boolean) as T[];
  }
  return safeJson<T[]>(await safeGet(RealtimeCacheKey.tradesLiveJson(code)), []).slice(0, capped);
}

export async function getStreamReplay<T = unknown>(code: string, count = 300): Promise<StreamMarketEvent<T>[]> {
  const rows = await safeXRevRange(RealtimeCacheKey.symbolStream(code), Math.min(Math.max(count, 1), 5000));
  return rows.map((row) => ({
    id: row.id,
    type: (row.fields.type === 'orderbook' ? 'orderbook' : 'trade') as 'orderbook' | 'trade',
    code: row.fields.code || code,
    payload: safeJson<T | null>(row.fields.payload || null, null) as T,
    ts: row.fields.ts ? Number(row.fields.ts) : undefined,
  })).filter(e => e.payload != null);
}

export async function getRealtimeCacheStats(): Promise<Record<string, unknown>> {
  const info = await safeRedisInfo('stats');
  const memory = await safeRedisInfo('memory');
  const parseInfo = (raw: string | null) => Object.fromEntries((raw || '')
    .split('\n')
    .filter(line => line && !line.startsWith('#') && line.includes(':'))
    .map(line => {
      const [k, v] = line.trim().split(':');
      return [k, Number.isNaN(Number(v)) ? v : Number(v)];
    }));
  return {
    redisStats: parseInfo(info),
    redisMemory: parseInfo(memory),
    limits: {
      recentTradesPerSymbol: MAX_RECENT_TRADES,
      streamEventsPerSymbol: MAX_STREAM_EVENTS_PER_SYMBOL,
      globalStreamEvents: MAX_GLOBAL_STREAM_EVENTS,
      liveTtlSeconds: LIVE_TTL,
      snapshotTtlSeconds: SNAPSHOT_TTL,
    },
  };
}

export const realtimeCacheConfig = {
  pubsubChannel: PUBSUB_CHANNEL,
  maxRecentTrades: MAX_RECENT_TRADES,
  maxStreamEventsPerSymbol: MAX_STREAM_EVENTS_PER_SYMBOL,
};
