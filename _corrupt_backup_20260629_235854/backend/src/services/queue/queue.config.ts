// jp: BullMQ 큐 설정 - Redis 연결 + 큐 이름 정의
// jp: Kafka 대신 Redis 기반 메시지 큐로 동일한 개념 구현
// jp: 큐 종류: 공시수집, 공시분류, 시세수집, 알림발송

import { Queue, Worker, QueueEvents, ConnectionOptions } from 'bullmq';

// jp: Redis 연결 (BullMQ용 - 캐시용 Redis와 동일 인스턴스 사용 가능)
export const redisConnection: ConnectionOptions = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD,
  // jp: BullMQ는 별도 DB 사용 권장 (캐시 eviction 정책 충돌 방지)
  db: 1,
};

// jp: 큐 이름 상수
export const QUEUE_NAMES = {
  DISCLOSURE_FETCH: 'disclosure-fetch',       // jp: 공시 수집
  DISCLOSURE_CLASSIFY: 'disclosure-classify', // jp: 공시 분류 (AI 분류)
  PRICE_FETCH: 'price-fetch',                 // jp: 시세 수집
  NOTIFICATION: 'notification-send',          // jp: 알림 발송
} as const;

// jp: 큐별 기본 옵션
export const QUEUE_DEFAULT_OPTIONS = {
  [QUEUE_NAMES.DISCLOSURE_FETCH]: {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 2000 },
    removeOnComplete: { count: 100 },  // jp: 완료 잡 100개만 보관
    removeOnFail: { count: 50 },
  },
  [QUEUE_NAMES.DISCLOSURE_CLASSIFY]: {
    attempts: 2,
    backoff: { type: 'fixed' as const, delay: 1000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 100 },
  },
  [QUEUE_NAMES.PRICE_FETCH]: {
    attempts: 2,
    backoff: { type: 'exponential' as const, delay: 500 },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 20 },
  },
  [QUEUE_NAMES.NOTIFICATION]: {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 3000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 100 },
  },
};

// jp: 큐 인스턴스 생성 팩토리
export function createQueue(name: string) {
  return new Queue(name, {
    connection: redisConnection,
    defaultJobOptions: QUEUE_DEFAULT_OPTIONS[name as keyof typeof QUEUE_DEFAULT_OPTIONS] ?? {},
  });
}

// jp: 큐 이벤트 모니터링 팩토리
export function createQueueEvents(name: string) {
  return new QueueEvents(name, { connection: redisConnection });
}
