// jp: Redis Stream Consumer Group 장애복구 서비스
// jp: Pub/Sub은 빠르지만 유실 가능성이 있으므로 Stream을 원장으로 두고 pending/replay/지연 지표를 관리한다.
// jp: 토스급 운영 목표 - WS 서버가 죽어도 stream:market:all 기준으로 미처리 tick을 reclaim하고 상태를 계측한다.

import {
  safeHGetAll,
  safeHIncrBy,
  safeHSet,
  safeXAck,
  safeXAutoClaim,
  safeXGroupCreate,
  safeXPendingSummary,
  safeXReadGroup,
  type RedisStreamRow,
} from '../../config/redis';
import { RealtimeCacheKey } from '../cache/marketRealtimeCache.service';

const STREAM_KEY = RealtimeCacheKey.globalStream();
const GROUP_NAME = process.env.REDIS_MARKET_STREAM_GROUP || 'market-recovery-v1';
const CONSUMER_NAME = `${process.env.SERVER_ROLE || 'all'}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
const METRIC_KEY = 'metrics:market:stream-recovery';

let running = false;
let readTimer: NodeJS.Timeout | null = null;
let reclaimTimer: NodeJS.Timeout | null = null;
let lastClaimStartId = '0-0';
let lastReadAt = 0;
let lastClaimAt = 0;
let lastError: string | null = null;

function safeJson(raw: string | undefined): unknown | null {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function processRows(rows: RedisStreamRow[], source: 'new' | 'reclaimed'): Promise<void> {
  if (rows.length === 0) return;

  const ids: string[] = [];
  const now = Date.now();
  let maxLagMs = 0;
  let tradeCount = 0;
  let orderbookCount = 0;

  for (const row of rows) {
    const type = row.fields.type;
    const code = row.fields.code;
    const ts = Number(row.fields.ts || 0);
    const payload = safeJson(row.fields.payload);

    if (!code || !payload || (type !== 'trade' && type !== 'orderbook')) {
      ids.push(row.id);
      continue;
    }

    const lagMs = ts > 0 ? Math.max(0, now - ts) : 0;
    maxLagMs = Math.max(maxLagMs, lagMs);
    if (type === 'trade') tradeCount += 1;
    if (type === 'orderbook') orderbookCount += 1;
    ids.push(row.id);
  }

  const acked = await safeXAck(STREAM_KEY, GROUP_NAME, ids);
  await safeHIncrBy(METRIC_KEY, source === 'new' ? 'newRows' : 'reclaimedRows', rows.length);
  await safeHIncrBy(METRIC_KEY, 'ackedRows', acked);
  await safeHIncrBy(METRIC_KEY, 'tradeRows', tradeCount);
  await safeHIncrBy(METRIC_KEY, 'orderbookRows', orderbookCount);
  await safeHSet(METRIC_KEY, {
    lastProcessedAt: now,
    lastSource: source,
    lastBatchSize: rows.length,
    lastMaxLagMs: maxLagMs,
    consumerName: CONSUMER_NAME,
  });
}

async function readOnce(): Promise<void> {
  if (!running) return;
  try {
    await safeXGroupCreate(STREAM_KEY, GROUP_NAME, '0');
    const rows = await safeXReadGroup(GROUP_NAME, CONSUMER_NAME, STREAM_KEY, '>', 200, 1500);
    lastReadAt = Date.now();
    await processRows(rows, 'new');
    lastError = null;
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    await safeHSet(METRIC_KEY, { lastError, lastErrorAt: Date.now() });
  } finally {
    if (running) readTimer = setTimeout(() => void readOnce(), rowsDelayMs());
  }
}

function rowsDelayMs(): number {
  // jp: 장중 tick이 많은 경우 즉시 다음 batch, 조용할 때는 Redis BLOCK이 대부분 대기한다.
  return 20;
}

async function reclaimOnce(): Promise<void> {
  if (!running) return;
  try {
    await safeXGroupCreate(STREAM_KEY, GROUP_NAME, '0');
    const claimed = await safeXAutoClaim(STREAM_KEY, GROUP_NAME, CONSUMER_NAME, 30000, lastClaimStartId, 200);
    lastClaimStartId = claimed.nextId || '0-0';
    lastClaimAt = Date.now();
    await processRows(claimed.rows, 'reclaimed');
    const pending = await safeXPendingSummary(STREAM_KEY, GROUP_NAME);
    await safeHSet(METRIC_KEY, {
      lastReclaimAt: lastClaimAt,
      pendingCount: Number(pending?.pending || 0),
      pendingMinId: pending?.minId ? String(pending.minId) : '',
      pendingMaxId: pending?.maxId ? String(pending.maxId) : '',
    });
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    await safeHSet(METRIC_KEY, { lastError, lastErrorAt: Date.now() });
  } finally {
    if (running) reclaimTimer = setTimeout(() => void reclaimOnce(), 10000);
  }
}

export async function startRedisStreamRecovery(): Promise<void> {
  if (running) return;
  running = true;
  await safeXGroupCreate(STREAM_KEY, GROUP_NAME, '0');
  await safeHSet(METRIC_KEY, {
    startedAt: Date.now(),
    groupName: GROUP_NAME,
    consumerName: CONSUMER_NAME,
    streamKey: STREAM_KEY,
  });
  void readOnce();
  void reclaimOnce();
  console.log(`[RedisStreamRecovery] 시작 group=${GROUP_NAME} consumer=${CONSUMER_NAME}`);
}

export function stopRedisStreamRecovery(): void {
  running = false;
  if (readTimer) clearTimeout(readTimer);
  if (reclaimTimer) clearTimeout(reclaimTimer);
  readTimer = null;
  reclaimTimer = null;
  console.log('[RedisStreamRecovery] 중지');
}

export async function getRedisStreamRecoveryStats(): Promise<Record<string, unknown>> {
  const h = await safeHGetAll(METRIC_KEY);
  const pending = await safeXPendingSummary(STREAM_KEY, GROUP_NAME);
  return {
    running,
    streamKey: STREAM_KEY,
    groupName: GROUP_NAME,
    consumerName: CONSUMER_NAME,
    lastReadAt,
    lastClaimAt,
    lastError,
    metrics: h,
    pending,
  };
}
