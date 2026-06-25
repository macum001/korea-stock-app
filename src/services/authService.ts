// jp: 인증 서비스 - 백엔드 auth API 호출
import { apiClient } from '@/services/apiClient';

export interface AuthUser {
  id: string;
  email: string;
  nickname: string;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export async function register(email: string, password: string, nickname?: string): Promise<AuthResult> {
  return apiClient.post<AuthResult>('/api/auth/register', { email, password, nickname });
}

export async function login(email: string, password: string): Promise<AuthResult> {
  return apiClient.post<AuthResult>('/api/auth/login', { email, password });
}

export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string }> {
  return apiClient.post<{ accessToken: string }>('/api/auth/refresh', { refreshToken });
}

// jp: ===== 내 정보 관리 =====

export interface MyProfile {
  id: string;
  email: string;
  nickname: string;
  createdAt: string;
  lastLoginAt: string | null;
}

// jp: 내 정보 조회 (이메일, 닉네임, 가입일)
export async function getMe(): Promise<MyProfile> {
  return apiClient.get<MyProfile>('/api/auth/me');
}

// jp: 닉네임 변경
export async function updateNickname(nickname: string): Promise<{ nickname: string }> {
  return apiClient.patch<{ nickname: string }>('/api/auth/me/nickname', { nickname });
}

// jp: 비밀번호 변경 (현재 비번 확인 후)
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return apiClient.patch<void>('/api/auth/me/password', { currentPassword, newPassword });
}

// jp: 네이버 소셜 로그인 - 인증 code를 백엔드로 전송
export async function loginWithNaver(code: string, state: string): Promise<AuthResult & { isNew?: boolean }> {
  return apiClient.post<AuthResult & { isNew?: boolean }>('/api/auth/naver', { code, state });
}

// jp: 구글 소셜 로그인 - 인증 code를 백엔드로 전송
export async function loginWithGoogle(code: string, redirectUri: string): Promise<AuthResult & { isNew?: boolean }> {
  return apiClient.post<AuthResult & { isNew?: boolean }>('/api/auth/google', { code, redirectUri });
}
