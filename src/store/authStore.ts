// jp: 인증 스토어 - 토큰/유저 관리. localStorage persist + apiClient 토큰 동기화
// jp: ★ 추가: accessToken 만료 시 refreshToken으로 자동 재발급하는 핸들러를 apiClient에 주입
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { setAccessToken, setRefreshHandler } from '@/services/apiClient';
import * as authService from '@/services/authService';
import type { AuthUser } from '@/services/authService';

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, nickname?: string) => Promise<void>;
  loginWithNaver: (code: string, state: string) => Promise<void>;
  loginWithGoogle: (code: string, redirectUri: string) => Promise<void>;
  logout: () => void;
  setNickname: (nickname: string) => void;
  hydrate: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      login: async (email, password) => {
        const res = await authService.login(email, password);
        setAccessToken(res.accessToken);
        set({ user: res.user, accessToken: res.accessToken, refreshToken: res.refreshToken, isAuthenticated: true });
        import('@/store/watchlistStore').then(m => m.useWatchlistStore.getState().hydrateFromServer());
      },

      register: async (email, password, nickname) => {
        const res = await authService.register(email, password, nickname);
        setAccessToken(res.accessToken);
        set({ user: res.user, accessToken: res.accessToken, refreshToken: res.refreshToken, isAuthenticated: true });
        import('@/store/watchlistStore').then(m => m.useWatchlistStore.getState().hydrateFromServer());
      },

      loginWithNaver: async (code, state) => {
        const res = await authService.loginWithNaver(code, state);
        setAccessToken(res.accessToken);
        set({ user: res.user, accessToken: res.accessToken, refreshToken: res.refreshToken, isAuthenticated: true });
        import('@/store/watchlistStore').then(m => m.useWatchlistStore.getState().hydrateFromServer());
      },

      loginWithGoogle: async (code, redirectUri) => {
        const res = await authService.loginWithGoogle(code, redirectUri);
        setAccessToken(res.accessToken);
        set({ user: res.user, accessToken: res.accessToken, refreshToken: res.refreshToken, isAuthenticated: true });
        import('@/store/watchlistStore').then(m => m.useWatchlistStore.getState().hydrateFromServer());
      },

      logout: () => {
        setAccessToken(null);
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
        import('@/store/watchlistStore').then(m => m.useWatchlistStore.getState().clearLocal());
      },

      setNickname: (nickname) => {
        const u = get().user;
        if (u) set({ user: { ...u, nickname } });
      },

      // jp: 앱 시작 시 저장된 토큰을 apiClient에 주입 + 자동 갱신 핸들러 등록
      hydrate: () => {
        const token = get().accessToken;
        if (token) setAccessToken(token);

        // jp: ★ 401 시 apiClient가 부를 refresh 핸들러 등록
        setRefreshHandler(async () => {
          const rt = get().refreshToken;
          if (!rt) return null;
          try {
            const { accessToken } = await authService.refreshAccessToken(rt);
            setAccessToken(accessToken);
            set({ accessToken, isAuthenticated: true });
            return accessToken; // jp: apiClient가 이 토큰으로 재시도
          } catch {
            // jp: refresh도 실패 → 로그아웃 상태로
            setAccessToken(null);
            set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
            import('@/store/watchlistStore').then(m => m.useWatchlistStore.getState().clearLocal());
            return null;
          }
        });
      },
    }),
    { name: 'auth-store-v1' }
  )
);
