// jp: Redis 연결 설정 - Redis 없어도 서버 정상 동작하게 처리

import { createClient } from 'redis';
import { ENV } from './env';

export const redis = createClient({
  url: ENV.REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => {
      // jp: 운영형 Redis 재연결 - 장중 캐시 복구가 중요하므로 포기하지 않고 지수 백오프
      // jp: 단, 너무 빠른 재시도로 Node 이벤트 루프를 막지 않도록 최대 10초로 제한
      return Math.min(250 * Math.pow(2, Math.min(retries, 6)), 10000);
    },
    keepAlive: 5000,
  },
});

let isRedisAvailable = false;

redis.on('error', (err) => { isRedisAvailable = false; console.warn('[Redis] 오류:', err.message); });
redis.on('connect', () => {
  isRedisAvailable = true;
  console.log('[Redis] 연결 성공');
});

export async function connectRedis(): Promise<void> {
  try {
    await redis.connect();
    isRedisAvailable = true;
  } catch {
    console.warn('[Redis] 연결 실패 - Redis 없이 동작합니다.');
    isRedisAvailable = false;
  }
}

// jp: Redis 사용 가능 여부 확인
export function isRedisReady(): boolean {
  return isRedisAvailable && redis.isReady;
}

// jp: 안전한 get - Redis 없으면 null 반환
export async function safeGet(key: string): Promise<string | null> {
  if (!isRedisReady()) return null;
  try {
    return await redis.get(key);
  } catch {
    return null;
  }
}

// jp: 안전한 setEx - Redis 없으면 무시
export async function safeSetEx(key: string, ttl: number, value: string): Promise<void> {
  if (!isRedisReady()) return;
  try {
    await redis.setEx(key, ttl, value);
  } catch {
    // jp: 캐시 저장 실패는 무시
  }
}

// jp: 단일 키 삭제
export async function safeDel(key: string): Promise<void> {
  if (!isRedisReady()) return;
  try { await redis.del(key); } catch { /* 무시 */ }
}


// jp: 안전한 scan - Redis key 목록 조회(장마감 snapshot finalize 등 운영 작업용)
export async function safeScanKeys(pattern: string, count = 100): Promise<string[]> {
  if (!isRedisReady()) return [];
  const keys: string[] = [];
  try {
    for await (const key of redis.scanIterator({ MATCH: pattern, COUNT: count })) {
      keys.push(String(key));
    }
  } catch {
    return [];
  }
  return keys;
}

// jp: 패턴 매칭 키 일괄 삭제 (예: 'stock:price:*'). 관리자 캐시 정리용
export async function safeDelPattern(pattern: string): Promise<number> {
  if (!isRedisReady()) return 0;
  try {
    let count = 0;
    // jp: SCAN으로 안전하게 순회 (KEYS는 대량일 때 블로킹되므로 SCAN 사용)
    for await (const key of redis.scanIterator({ MATCH: pattern, COUNT: 100 })) {
      await redis.del(key);
      count++;
    }
    return count;
  } catch {
    return 0;
  }
}


// jp: Redis list push+trim - 체결 tick append를 원자적으로 처리
export async function safeListPushTrim(key: string, value: string, maxLen: number, ttl: number): Promise<boolean> {
  if (!isRedisReady()) return false;
  try {
    const multi = redis.multi();
    multi.lPush(key, value);
    multi.lTrim(key, 0, Math.max(0, maxLen - 1));
    multi.expire(key, ttl);
    await multi.exec();
    return true;
  } catch {
    return false;
  }
}

// jp: Redis list read - 최근 체결을 빠르게 읽음
export async function safeListRange(key: string, start: number, stop: number): Promise<string[]> {
  if (!isRedisReady()) return [];
  try {
    return await redis.lRange(key, start, stop);
  } catch {
    return [];
  }
}

// jp: 캐시 TTL 상수 (초 단위)
export const CACHE_TTL = {
  STOCK_PRICE: 5,
  STOCK_INFO:  3600,
  DISCLOSURE:  300,
  TOKEN:       82800,
};

// jp: 캐시 키 생성 함수
export const CacheKey = {
  stockPrice:  (code: string) => `stock:price:${code}`,
  stockInfo:   (code: string) => `stock:info:${code}`,
  disclosures: (code: string) => `disclosure:${code}`,
  kisToken:    ()             => `kis:token`,
};


// jp: Redis pub/sub 발행 - WS 서버 수평확장 fanout용
export async function safePublish(channel: string, message: string): Promise<boolean> {
  if (!isRedisReady()) return false;
  try {
    await redis.publish(channel, message);
    return true;
  } catch {
    return false;
  }
}

// jp: Redis Lua 실행 - LPUSH/LTRIM/EXPIRE/XADD를 단일 round-trip으로 처리
export async function safeEval(script: string, keys: string[], args: string[]): Promise<unknown | null> {
  if (!isRedisReady()) return null;
  try {
    return await redis.sendCommand(['EVAL', script, String(keys.length), ...keys, ...args]);
  } catch (err) {
    console.warn('[Redis] Lua eval 실패:', err instanceof Error ? err.message : err);
    return null;
  }
}

// jp: Redis Stream 조회 - 장애 복구/replay용
export async function safeXRevRange(key: string, count: number): Promise<Array<{ id: string; fields: Record<string, string> }>> {
  if (!isRedisReady()) return [];
  try {
    const rows = await redis.sendCommand(['XREVRANGE', key, '+', '-', 'COUNT', String(Math.max(1, count))]) as unknown[];
    return rows.map((row) => {
      const tuple = row as [string, string[]];
      const fields: Record<string, string> = {};
      for (let i = 0; i < tuple[1].length; i += 2) fields[String(tuple[1][i])] = String(tuple[1][i + 1]);
      return { id: String(tuple[0]), fields };
    });
  } catch {
    return [];
  }
}

// jp: Redis INFO 일부 조회 - 운영 대시보드/성능 점검용
export async function safeRedisInfo(section = 'stats'): Promise<string | null> {
  if (!isRedisReady()) return null;
  try {
    return await redis.sendCommand(['INFO', section]) as string;
  } catch {
    return null;
  }
}


// jp: Redis Stream Consumer Group 생성 - 이미 있으면 성공으로 간주
export async function safeXGroupCreate(streamKey: string, groupName: string, startId = '0'): Promise<boolean> {
  if (!isRedisReady()) return false;
  try {
    await redis.sendCommand(['XGROUP', 'CREATE', streamKey, groupName, startId, 'MKSTREAM']);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('BUSYGROUP')) return true;
    console.warn('[Redis] XGROUP CREATE 실패:', msg);
    return false;
  }
}

export interface RedisStreamRow {
  stream: string;
  id: string;
  fields: Record<string, string>;
}

function parseStreamEntries(reply: unknown): RedisStreamRow[] {
  const out: RedisStreamRow[] = [];
  if (!Array.isArray(reply)) return out;
  for (const streamTuple of reply as unknown[]) {
    const [stream, entries] = streamTuple as [string, unknown[]];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const [id, rawFields] = entry as [string, string[]];
      const fields: Record<string, string> = {};
      for (let i = 0; i < rawFields.length; i += 2) fields[String(rawFields[i])] = String(rawFields[i + 1]);
      out.push({ stream: String(stream), id: String(id), fields });
    }
  }
  return out;
}

// jp: Redis Stream Consumer Group 읽기 - 장애 복구 워커가 사용
export async function safeXReadGroup(
  groupName: string,
  consumerName: string,
  streamKey: string,
  id = '>',
  count = 100,
  blockMs = 2000,
): Promise<RedisStreamRow[]> {
  if (!isRedisReady()) return [];
  try {
    const reply = await redis.sendCommand([
      'XREADGROUP', 'GROUP', groupName, consumerName,
      'COUNT', String(Math.max(1, count)),
      'BLOCK', String(Math.max(0, blockMs)),
      'STREAMS', streamKey, id,
    ]);
    return parseStreamEntries(reply);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // jp: group이 사라졌거나 Redis가 재시작된 경우 호출자가 재생성하도록 false 대신 빈 배열 반환
    if (!msg.includes('NOGROUP')) console.warn('[Redis] XREADGROUP 실패:', msg);
    return [];
  }
}

// jp: Redis Stream pending 메시지 reclaim - 죽은 consumer가 잡고 있던 tick을 복구
export async function safeXAutoClaim(
  streamKey: string,
  groupName: string,
  consumerName: string,
  minIdleMs = 30000,
  startId = '0-0',
  count = 100,
): Promise<{ nextId: string; rows: RedisStreamRow[] }> {
  if (!isRedisReady()) return { nextId: startId, rows: [] };
  try {
    const reply = await redis.sendCommand([
      'XAUTOCLAIM', streamKey, groupName, consumerName,
      String(Math.max(1, minIdleMs)), startId,
      'COUNT', String(Math.max(1, count)),
    ]) as unknown[];
    const nextId = String(reply?.[0] || '0-0');
    const entries = Array.isArray(reply?.[1]) ? reply[1] as unknown[] : [];
    const rows: RedisStreamRow[] = entries.map((entry) => {
      const [id, rawFields] = entry as [string, string[]];
      const fields: Record<string, string> = {};
      for (let i = 0; i < rawFields.length; i += 2) fields[String(rawFields[i])] = String(rawFields[i + 1]);
      return { stream: streamKey, id: String(id), fields };
    });
    return { nextId, rows };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('NOGROUP')) console.warn('[Redis] XAUTOCLAIM 실패:', msg);
    return { nextId: startId, rows: [] };
  }
}

export async function safeXAck(streamKey: string, groupName: string, ids: string[]): Promise<number> {
  if (!isRedisReady() || ids.length === 0) return 0;
  try {
    const res = await redis.sendCommand(['XACK', streamKey, groupName, ...ids]);
    return Number(res || 0);
  } catch {
    return 0;
  }
}

export async function safeXPendingSummary(streamKey: string, groupName: string): Promise<Record<string, unknown> | null> {
  if (!isRedisReady()) return null;
  try {
    const res = await redis.sendCommand(['XPENDING', streamKey, groupName]) as unknown[];
    return {
      pending: Number(res?.[0] || 0),
      minId: res?.[1] ? String(res[1]) : null,
      maxId: res?.[2] ? String(res[2]) : null,
      consumers: Array.isArray(res?.[3]) ? res[3] : [],
    };
  } catch {
    return null;
  }
}

export async function safeHIncrBy(key: string, field: string, value = 1): Promise<void> {
  if (!isRedisReady()) return;
  try { await redis.hIncrBy(key, field, value); } catch { /* ignore */ }
}

export async function safeHSet(key: string, values: Record<string, string | number>): Promise<void> {
  if (!isRedisReady()) return;
  try { await redis.hSet(key, Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v)]))); } catch { /* ignore */ }
}

export async function safeHGetAll(key: string): Promise<Record<string, string>> {
  if (!isRedisReady()) return {};
  try { return await redis.hGetAll(key); } catch { return {}; }
}


// jp: Redis SET NX PX - 다중 realtime 서버 중 KIS 원본 구독 owner를 1대만 선출
export async function safeSetNxPx(key: string, value: string, ttlMs: number): Promise<boolean> {
  if (!isRedisReady()) return false;
  try {
    const res = await redis.sendCommand(['SET', key, value, 'NX', 'PX', String(Math.max(1000, ttlMs))]);
    return res === 'OK';
  } catch {
    return false;
  }
}

// jp: Redis lock renew - value가 같은 owner일 때만 TTL 연장
export async function safeRenewIfValue(key: string, value: string, ttlMs: number): Promise<boolean> {
  if (!isRedisReady()) return false;
  try {
    const script = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0
`;
    const res = await redis.sendCommand(['EVAL', script, '1', key, value, String(Math.max(1000, ttlMs))]);
    return Number(res) === 1;
  } catch {
    return false;
  }
}

// jp: Redis lock release - value가 같은 owner일 때만 삭제해서 다른 서버 lock을 지우지 않음
export async function safeDelIfValue(key: string, value: string): Promise<boolean> {
  if (!isRedisReady()) return false;
  try {
    const script = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;
    const res = await redis.sendCommand(['EVAL', script, '1', key, value]);
    return Number(res) === 1;
  } catch {
    return false;
  }
}

export async function safeGetTtlMs(key: string): Promise<number> {
  if (!isRedisReady()) return -2;
  try { return Number(await redis.sendCommand(['PTTL', key])); } catch { return -2; }
}
