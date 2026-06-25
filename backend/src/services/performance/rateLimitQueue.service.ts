// jp: Rate Limit Queue - 외부 API 동시 호출 제한 + 백오프 재시도
// jp: KIS/DART 호출 제한 고려. 무한 재시도 금지

import { Provider } from './circuitBreaker.service';
import { dedupeInFlightRequest } from './inFlightDedupe.service';

interface QueueConfig {
  maxConcurrent: number; // jp: 동시 실행 최대
  minIntervalMs: number; // jp: 호출 간 최소 간격
}

// jp: provider별 큐 설정
const CONFIG: Record<Provider, QueueConfig> = {
  KIS_PRICE:        { maxConcurrent: 3, minIntervalMs: 50 },
  KIS_CANDLE:       { maxConcurrent: 2, minIntervalMs: 100 },
  KIS_MARKET_INDEX: { maxConcurrent: 2, minIntervalMs: 50 },
  KIS_WS:           { maxConcurrent: 1, minIntervalMs: 100 },
  DART_DISCLOSURE:  { maxConcurrent: 2, minIntervalMs: 100 },
};

interface QueueState {
  running: number;
  lastStart: number;
  pending: Array<() => void>;
}

const queues = new Map<Provider, QueueState>();

function getQueue(provider: Provider): QueueState {
  let q = queues.get(provider);
  if (!q) {
    q = { running: 0, lastStart: 0, pending: [] };
    queues.set(provider, q);
  }
  return q;
}

// jp: 슬롯이 빌 때까지 대기
function acquireSlot(provider: Provider): Promise<void> {
  const q = getQueue(provider);
  const cfg = CONFIG[provider];
  return new Promise<void>((resolve) => {
    const tryRun = () => {
      const now = Date.now();
      const intervalOk = now - q.lastStart >= cfg.minIntervalMs;
      if (q.running < cfg.maxConcurrent && intervalOk) {
        q.running += 1;
        q.lastStart = now;
        resolve();
      } else {
        q.pending.push(tryRun);
        // jp: 간격 제약이면 잠시 후 재시도 스케줄
        if (!intervalOk) setTimeout(() => {
          const next = q.pending.shift();
          if (next) next();
        }, cfg.minIntervalMs);
      }
    };
    tryRun();
  });
}

function releaseSlot(provider: Provider): void {
  const q = getQueue(provider);
  q.running = Math.max(0, q.running - 1);
  const next = q.pending.shift();
  if (next) next();
}

// jp: 지수 백오프 재시도 (최대 횟수 제한, 무한 금지)
export async function withRetryAndBackoff<T>(
  fn: () => Promise<T>,
  options: { retries?: number; baseDelayMs?: number } = {}
): Promise<T> {
  const retries = options.retries ?? 2;
  const base = options.baseDelayMs ?? 300;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        // jp: 2^attempt * base + jitter
        const delay = base * Math.pow(2, attempt) + Math.random() * 100;
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

// jp: 외부 API 요청을 큐에 넣어 실행 (dedupe + rate limit)
export async function enqueueExternalApiRequest<T>(
  provider: Provider,
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  // jp: 같은 key 동시 요청은 dedupe
  return dedupeInFlightRequest(key, async () => {
    await acquireSlot(provider);
    try {
      return await fn();
    } finally {
      releaseSlot(provider);
    }
  });
}
