// jp: 백엔드 API 클라이언트 - 모든 HTTP 요청을 여기서 처리 (인증 토큰 자동 부착)
// jp: ★ 추가: accessToken 만료(401) 시 refreshToken으로 자동 재발급 후 1회 재시도
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

// jp: 인메모리 액세스 토큰 (authStore가 설정/해제)
let accessToken: string | null = null;
export function setAccessToken(token: string | null): void {
  accessToken = token;
}
// jp: 인증 여부 (게스트면 백엔드 동기화 스킵)
export function hasAuth(): boolean {
  return accessToken != null;
}

// jp: 401 콜백 (refresh도 실패하면 authStore가 로그아웃 처리)
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn;
}

// jp: ★ 토큰 재발급 콜백 (authStore가 주입). 성공 시 새 accessToken 문자열 반환, 실패 시 null
let refreshTokenFn: (() => Promise<string | null>) | null = null;
export function setRefreshHandler(fn: (() => Promise<string | null>) | null): void {
  refreshTokenFn = fn;
}

// jp: 동시에 여러 요청이 401 나도 refresh는 1번만 (나머지는 같은 Promise 대기)
let refreshing: Promise<string | null> | null = null;
function refreshOnce(): Promise<string | null> {
  if (!refreshTokenFn) return Promise.resolve(null);
  if (!refreshing) {
    refreshing = refreshTokenFn()
      .catch(() => null)
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

// jp: 공통 헤더 (토큰 있으면 Authorization 부착)
function buildHeaders(extra?: HeadersInit): HeadersInit {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  return { ...headers, ...(extra as Record<string, string>) };
}

// jp: 공통 fetch 래퍼 (_retried: refresh 후 재시도 표시 - 무한루프 방지)
async function apiFetch<T>(path: string, options?: RequestInit, _retried = false): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: buildHeaders(options?.headers),
  });

  // jp: ★ 401 → refresh로 새 토큰 받아 딱 1번 재시도
  if (res.status === 401 && !_retried && refreshTokenFn) {
    const newToken = await refreshOnce();
    if (newToken) {
      accessToken = newToken;
      return apiFetch<T>(path, options, true); // jp: 재시도
    }
    // jp: refresh 실패 → 로그아웃
    if (onUnauthorized) onUnauthorized();
    throw new Error('API 오류: 401');
  }

  if (res.status === 401 && onUnauthorized) onUnauthorized();
  if (!res.ok) {
    throw new Error(`API 오류: ${res.status}`);
  }
  const json = await res.json();
  if (!json.success) {
    throw new Error(json.error || '알 수 없는 오류');
  }
  return json.data as T;
}

export const apiClient = {
  // jp: GET 요청 (data만)
  get: <T>(path: string) => apiFetch<T>(path),
  // jp: GET 요청 (success/data/stale 등 전체 응답)
  getRaw: async <T>(path: string): Promise<{ data: T; stale?: boolean; staleReason?: string }> => {
    const res = await fetch(`${API_URL}${path}`, { headers: buildHeaders() });
    if (res.status === 401 && onUnauthorized) onUnauthorized();
    if (!res.ok) throw new Error(`API 오류: ${res.status}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || '알 수 없는 오류');
    return { data: json.data as T, stale: json.stale, staleReason: json.staleReason };
  },
  // jp: POST 요청
  post: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  // jp: PATCH 요청
  patch: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  // jp: DELETE 요청 (body 선택)
  delete: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, {
      method: 'DELETE',
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
};
