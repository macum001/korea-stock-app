// jp: 어드민 사용자 관리 API 함수 + 알림 발송

import { api } from './api';

export interface AdminUser {
  id: string;
  email: string;
  nickname: string;
  created_at: string;
  last_login_at: string | null;
  ai_count: number;
}

export interface UsersPage {
  items: AdminUser[];
  total: number;
  page: number;
  size: number;
}

export interface UsersStats {
  total: number;
  today: number;
  active7d: number;
}

export interface SendNotiResult {
  sentTo: number;
  pushCount: number;
}

export const usersApi = {
  // jp: 사용자 목록 (검색 q, 페이지)
  list(params: { q?: string; page?: number; size?: number } = {}): Promise<UsersPage> {
    const sp = new URLSearchParams();
    if (params.q) sp.set('q', params.q);
    if (params.page) sp.set('page', String(params.page));
    if (params.size) sp.set('size', String(params.size));
    const qs = sp.toString();
    return api.get<UsersPage>(`/api/admin/data/users${qs ? `?${qs}` : ''}`);
  },
  // jp: 사용자 통계
  stats(): Promise<UsersStats> {
    return api.get<UsersStats>('/api/admin/data/users-stats');
  },
  // jp: 알림 발송 - 특정 사용자(target='user', userId) 또는 전체(target='all')
  sendNotification(input: { target: 'all' | 'user'; userId?: string; title: string; body: string }): Promise<SendNotiResult> {
    return api.post<SendNotiResult>('/api/admin/data/send-notification', input);
  },
};
