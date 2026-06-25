// jp: Redis Pub/Sub 서비스
// jp: Publisher: 시세/공시/알림 이벤트 발생 시 채널에 publish
// jp: Subscriber: 채널 구독 → WS 브로드캐스트로 전달

import Redis from 'ioredis';

// jp: 채널 이름 상수
export const PUBSUB_CHANNELS = {
  PRICE_UPDATE: 'channel:price:update',
  DISCLOSURE_NEW: 'channel:disclosure:new',
  PRICE_ALERT: 'channel:price:alert',   // jp: 가격 알림 추가
} as const;

function createRedisClient(): Redis {
  const url = process.env.REDIS_URL;
  if (url) {
    return new Redis(url);
  }
  return new Redis({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
  });
}

// ─────────────────────────────────────────
// jp: Publisher
// ─────────────────────────────────────────
let publisher: Redis | null = null;

function getPublisher(): Redis {
  if (!publisher) {
    publisher = createRedisClient();
    publisher.on('error', (err) => {
      console.error('[RedisPubSub] Publisher 에러:', err.message);
    });
  }
  return publisher;
}

export async function publishPriceUpdate(data: unknown): Promise<boolean> {
  try {
    await getPublisher().publish(
      PUBSUB_CHANNELS.PRICE_UPDATE,
      JSON.stringify({ type: 'PRICE_UPDATE', data })
    );
    return true;
  } catch {
    // jp: Redis 장애 시 호출자가 직접 전송 fallback을 사용할 수 있게 false 반환
    return false;
  }
}

export async function publishDisclosureNew(data: unknown): Promise<void> {
  try {
    await getPublisher().publish(
      PUBSUB_CHANNELS.DISCLOSURE_NEW,
      JSON.stringify({ type: 'DISCLOSURE_NEW', data })
    );
  } catch { /* Redis 없어도 동작 */ }
}

// jp: 가격 알림 발행
export interface PriceAlertPayload {
  userId: string;
  stockCode: string;
  title: string;
  body: string;
  price: number;
}

export async function publishPriceAlert(data: PriceAlertPayload): Promise<void> {
  try {
    await getPublisher().publish(
      PUBSUB_CHANNELS.PRICE_ALERT,
      JSON.stringify({ type: 'PRICE_ALERT', data })
    );
  } catch { /* Redis 없어도 동작 */ }
}

// ─────────────────────────────────────────
// jp: Subscriber
// ─────────────────────────────────────────
let subscriber: Redis | null = null;
const handlers = new Map<string, Set<(msg: unknown) => void>>();

function getSubscriber(): Redis {
  if (!subscriber) {
    subscriber = createRedisClient();
    subscriber.on('message', (channel: string, raw: string) => {
      try {
        const msg = JSON.parse(raw);
        handlers.get(channel)?.forEach(h => h(msg));
      } catch { /* 무시 */ }
    });
    subscriber.on('error', (err) => {
      console.error('[RedisPubSub] Subscriber 에러:', err.message);
    });
  }
  return subscriber;
}

export async function subscribePubSub(
  channel: string,
  handler: (msg: unknown) => void
): Promise<void> {
  const sub = getSubscriber();
  if (!handlers.has(channel)) {
    handlers.set(channel, new Set());
    await sub.subscribe(channel);
    console.log(`[RedisPubSub] 구독 시작: ${channel}`);
  }
  handlers.get(channel)!.add(handler);
}

export async function closePubSub(): Promise<void> {
  await Promise.allSettled([publisher?.quit(), subscriber?.quit()]);
  publisher = null;
  subscriber = null;
}
