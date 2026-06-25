// jp: KIS 원본 WebSocket 구독 distributed lock
// jp: 여러 realtime 서버가 떠도 같은 종목/타입에 대해 KIS에는 1대만 붙고, 나머지는 Redis Pub/Sub fanout만 받는다.
// jp: owner 서버가 죽으면 TTL 만료 후 다른 서버가 자동 인수한다.

import { isRedisReady, safeDelIfValue, safeGetTtlMs, safeHGetAll, safeHIncrBy, safeHSet, safeRenewIfValue, safeSetNxPx } from '../../config/redis';

export type KisRealtimeKind = 'orderbook' | 'trade';

const INSTANCE_ID = process.env.INSTANCE_ID || `${process.env.SERVER_ROLE || 'all'}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
const LOCK_TTL_MS = Math.max(5000, Number(process.env.KIS_SUB_LOCK_TTL_MS || 15000));
const RENEW_INTERVAL_MS = Math.max(1000, Math.floor(LOCK_TTL_MS / 3));
const METRIC_KEY = 'metrics:kis:subscription-locks';

interface HeldLock {
  kind: KisRealtimeKind;
  code: string;
  key: string;
  timer: NodeJS.Timeout;
  lost: boolean;
  value: string;
}

const heldLocks = new Map<string, HeldLock>();

function lockKey(kind: KisRealtimeKind, code: string): string {
  return `lock:kis:${kind}:${code}`;
}

function ownerValue(kind: KisRealtimeKind, code: string): string {
  return JSON.stringify({ instanceId: INSTANCE_ID, kind, code, pid: process.pid, acquiredAt: Date.now() });
}

function mapKey(kind: KisRealtimeKind, code: string): string {
  return `${kind}:${code}`;
}

async function renewLoop(key: string, value: string, heldKey: string): Promise<void> {
  const held = heldLocks.get(heldKey);
  if (!held) return;
  const renewed = await safeRenewIfValue(key, value, LOCK_TTL_MS);
  if (!renewed) {
    held.lost = true;
    heldLocks.delete(heldKey);
    clearInterval(held.timer);
    await safeHIncrBy(METRIC_KEY, 'lostLocks', 1);
    await safeHSet(METRIC_KEY, { lastLostLock: heldKey, lastLostAt: Date.now(), instanceId: INSTANCE_ID });
  }
}

export async function acquireKisSubscriptionLock(kind: KisRealtimeKind, code: string): Promise<boolean> {
  if (!isRedisReady()) {
    // jp: Redis 장애 시에는 기존 local fallback 동작. 단일 서버 환경에서는 서비스 지속성이 우선.
    await safeHIncrBy(METRIC_KEY, 'localFallbackLocks', 1);
    return true;
  }

  const heldKey = mapKey(kind, code);
  if (heldLocks.has(heldKey)) return true;

  const key = lockKey(kind, code);
  const value = ownerValue(kind, code);
  const acquired = await safeSetNxPx(key, value, LOCK_TTL_MS);

  if (!acquired) {
    await safeHIncrBy(METRIC_KEY, 'contendedLocks', 1);
    await safeHSet(METRIC_KEY, { lastContendedLock: heldKey, lastContendedAt: Date.now(), instanceId: INSTANCE_ID });
    return false;
  }

  const timer = setInterval(() => void renewLoop(key, value, heldKey), RENEW_INTERVAL_MS);
  timer.unref?.();
  heldLocks.set(heldKey, { kind, code, key, timer, lost: false, value });
  await safeHIncrBy(METRIC_KEY, 'acquiredLocks', 1);
  await safeHSet(METRIC_KEY, { lastAcquiredLock: heldKey, lastAcquiredAt: Date.now(), instanceId: INSTANCE_ID });
  return true;
}

export async function releaseKisSubscriptionLock(kind: KisRealtimeKind, code: string): Promise<void> {
  const heldKey = mapKey(kind, code);
  const held = heldLocks.get(heldKey);
  if (!held) return;
  clearInterval(held.timer);
  heldLocks.delete(heldKey);
  const released = await safeDelIfValue(held.key, held.value);
  await safeHIncrBy(METRIC_KEY, released ? 'releasedLocks' : 'releaseSkippedLocks', 1);
  await safeHSet(METRIC_KEY, { lastReleasedLock: heldKey, lastReleasedAt: Date.now(), instanceId: INSTANCE_ID });
}

export async function getKisSubscriptionLockStats(): Promise<Record<string, unknown>> {
  const metrics = await safeHGetAll(METRIC_KEY);
  const locks = await Promise.all([...heldLocks.values()].map(async (l) => ({
    kind: l.kind,
    code: l.code,
    key: l.key,
    ttlMs: await safeGetTtlMs(l.key),
    lost: l.lost,
  })));
  return {
    instanceId: INSTANCE_ID,
    lockTtlMs: LOCK_TTL_MS,
    renewIntervalMs: RENEW_INTERVAL_MS,
    heldCount: heldLocks.size,
    heldLocks: locks,
    metrics,
    redisReady: isRedisReady(),
  };
}

export function stopKisSubscriptionLockRenewal(): void {
  for (const held of heldLocks.values()) clearInterval(held.timer);
  heldLocks.clear();
}
