// jp: Stale-While-Revalidate - 캐시/DB 데이터 먼저 반환 + 백그라운드 갱신
// jp: 외부 API 실패 시 가짜 데이터 금지. 마지막 정상 데이터를 stale=true로 반환

export interface SwrResult<T> {
  data: T | null;
  stale: boolean;
  staleReason?: string;
  source: 'cache' | 'db' | 'fresh' | 'none';
  updatedAt?: string;
}

interface SwrParams<T> {
  // jp: Redis 캐시 조회
  getCache: () => Promise<{ data: T; updatedAt?: string } | null>;
  // jp: DB 마지막 정상 데이터 조회
  getDb: () => Promise<{ data: T; updatedAt?: string } | null>;
  // jp: 외부 API 갱신 (성공 시 캐시/DB 저장은 refreshFn 내부에서)
  refreshFn: () => Promise<T | null>;
  // jp: 백그라운드로 돌릴지 (true면 기다리지 않음)
  background?: boolean;
}

// jp: 핵심 SWR 흐름
export async function getStaleWhileRevalidate<T>(params: SwrParams<T>): Promise<SwrResult<T>> {
  // jp: 1. Redis 캐시 우선
  try {
    const cached = await params.getCache();
    if (cached) {
      // jp: 백그라운드 갱신 트리거 (기다리지 않음)
      void triggerBackgroundRefresh(params.refreshFn);
      return { data: cached.data, stale: false, source: 'cache', updatedAt: cached.updatedAt };
    }
  } catch { /* 캐시 실패는 무시하고 다음 단계 */ }

  // jp: 2. 캐시 없으면 외부 API 직접 시도 (background=false일 때)
  if (!params.background) {
    try {
      const fresh = await params.refreshFn();
      if (fresh !== null) {
        return { data: fresh, stale: false, source: 'fresh', updatedAt: new Date().toISOString() };
      }
    } catch { /* 외부 실패 → DB fallback */ }
  }

  // jp: 3. DB 마지막 정상 데이터 (stale)
  try {
    const db = await params.getDb();
    if (db) {
      void triggerBackgroundRefresh(params.refreshFn);
      return { data: db.data, stale: true, staleReason: 'EXTERNAL_UNAVAILABLE', source: 'db', updatedAt: db.updatedAt };
    }
  } catch { /* DB도 실패 */ }

  // jp: 4. 아무 데이터도 없음 → 빈 상태 (가짜 데이터 금지)
  return { data: null, stale: true, staleReason: 'NO_REAL_DATA', source: 'none' };
}

// jp: 백그라운드 갱신 (에러 무시)
function triggerBackgroundRefresh<T>(refreshFn: () => Promise<T | null>): Promise<void> {
  return Promise.resolve()
    .then(() => refreshFn())
    .then(() => undefined)
    .catch(() => undefined);
}
