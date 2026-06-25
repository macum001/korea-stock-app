// jp: In-flight 중복 제거 - 같은 key 동시 요청은 하나의 Promise 공유
// jp: 예) 삼성전자 현재가 요청 10개 동시 → 외부 API 1번만 호출

const inFlight = new Map<string, Promise<unknown>>();

// jp: 같은 key의 진행 중 요청이 있으면 그 Promise를 반환, 없으면 새로 실행
export async function dedupeInFlightRequest<T>(key: string, requestFn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = (async () => {
    try {
      return await requestFn();
    } finally {
      // jp: 완료되면 맵에서 제거 (성공/실패 무관)
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}

// jp: 진행 중 요청 수 (모니터링용)
export function getInFlightCount(): number {
  return inFlight.size;
}
