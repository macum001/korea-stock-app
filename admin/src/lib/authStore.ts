// jp: 관리자 인증 상태 (zustand)

import { create } from 'zustand';
import { authApi, getToken, clearToken, AdminInfo } from '@/lib/api';

interface AuthState {
  admin: AdminInfo | null;
  loading: boolean;       // jp: 초기 토큰 검증 중
  error: string;
  // jp: 앱 시작 시 저장된 토큰으로 자동 로그인 시도
  init: () => Promise<void>;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  admin: null,
  loading: true,
  error: '',

  init: async () => {
    if (!getToken()) {
      set({ loading: false });
      return;
    }
    try {
      const admin = await authApi.me();
      set({ admin, loading: false });
    } catch {
      clearToken();
      set({ admin: null, loading: false });
    }
  },

  login: async (username, password) => {
    set({ error: '' });
    try {
      const admin = await authApi.login(username, password);
      set({ admin });
      return true;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '로그인에 실패했어요.' });
      return false;
    }
  },

  logout: () => {
    authApi.logout();
    set({ admin: null });
  },
}));
