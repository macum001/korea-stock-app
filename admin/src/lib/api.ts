// jp: 어드민 API 클라이언트 - 토큰 저장(localStorage) + 자동 헤더

const TOKEN_KEY = 'admin_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(path, { ...options, headers });

  // jp: 401 → 토큰 만료/무효 → 로그인으로
  if (res.status === 401) {
    clearToken();
    throw new Error('AUTH_EXPIRED');
  }

  const json = (await res.json()) as ApiResponse<T>;
  if (!json.success) {
    throw new Error(json.error || '요청에 실패했어요.');
  }
  return json.data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

// jp: ===== 인증 API =====
export interface AdminInfo {
  id: string;
  username: string;
  name?: string;
  role: string;
}

export const authApi = {
  // jp: 로그인 → 토큰 저장
  async login(username: string, password: string): Promise<AdminInfo> {
    const data = await api.post<{ token: string; admin: AdminInfo }>(
      '/api/admin/auth/login',
      { username, password }
    );
    setToken(data.token);
    return data.admin;
  },
  // jp: 토큰 검증 → 현재 관리자 정보
  async me(): Promise<AdminInfo> {
    return api.get<AdminInfo>('/api/admin/auth/me');
  },
  logout(): void {
    clearToken();
  },
};
