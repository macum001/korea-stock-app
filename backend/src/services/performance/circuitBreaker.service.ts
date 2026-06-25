// jp: Circuit Breaker - 외부 API 연속 실패 시 호출 차단
// jp: 5회 연속 실패 → 1분 open → half-open 1회 테스트 → 성공 close / 실패 재open

export type Provider =
  | 'KIS_PRICE' | 'KIS_CANDLE' | 'KIS_MARKET_INDEX' | 'KIS_WS' | 'DART_DISCLOSURE';

type CircuitState = 'closed' | 'open' | 'half_open';

interface CircuitInfo {
  state: CircuitState;
  failures: number;
  openedAt: number; // jp: open된 시각
}

const FAILURE_THRESHOLD = 5;   // jp: 연속 실패 임계치
const OPEN_DURATION_MS = 60_000; // jp: open 유지 1분

const circuits = new Map<Provider, CircuitInfo>();

function getCircuit(provider: Provider): CircuitInfo {
  let c = circuits.get(provider);
  if (!c) {
    c = { state: 'closed', failures: 0, openedAt: 0 };
    circuits.set(provider, c);
  }
  return c;
}

// jp: circuit이 열려있는지 (호출 차단 여부). half-open 전환도 여기서 처리
export function isCircuitOpen(provider: Provider): boolean {
  const c = getCircuit(provider);
  if (c.state === 'open') {
    // jp: 1분 지났으면 half-open으로 전환해서 1회 테스트 허용
    if (Date.now() - c.openedAt >= OPEN_DURATION_MS) {
      c.state = 'half_open';
      return false;
    }
    return true;
  }
  return false;
}

export function recordApiSuccess(provider: Provider): void {
  const c = getCircuit(provider);
  c.failures = 0;
  c.state = 'closed';
}

export function recordApiFailure(provider: Provider): void {
  const c = getCircuit(provider);
  c.failures += 1;
  // jp: half-open에서 실패하면 즉시 다시 open
  if (c.state === 'half_open' || c.failures >= FAILURE_THRESHOLD) {
    c.state = 'open';
    c.openedAt = Date.now();
  }
}

// jp: circuit breaker로 감싼 실행. open이면 null 반환(호출 안 함)
export async function withCircuitBreaker<T>(provider: Provider, fn: () => Promise<T>): Promise<T | null> {
  if (isCircuitOpen(provider)) {
    return null; // jp: 차단됨 → 호출자가 DB/캐시 fallback 사용
  }
  try {
    const result = await fn();
    recordApiSuccess(provider);
    return result;
  } catch (err) {
    recordApiFailure(provider);
    throw err;
  }
}

// jp: 전체 circuit 상태 (health 모니터링용)
export function getCircuitStates(): Record<string, CircuitState> {
  const out: Record<string, CircuitState> = {};
  for (const [p, c] of circuits) out[p] = c.state;
  return out;
}
