// jp: 테마 상태 관리 스토어 - 다크/라이트 모드 토글 (localStorage 저장)
import { create } from 'zustand';
import { ThemeMode } from '@/types/stock';

// jp: 저장된 테마 읽기 (없으면 dark 기본)
function getInitialMode(): ThemeMode {
  try {
    const saved = localStorage.getItem('theme-mode');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* 무시 */ }
  return 'dark';
}

interface ThemeStore {
  mode: ThemeMode;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
}

export const useThemeStore = create<ThemeStore>()((set) => ({
  mode: getInitialMode(),
  toggleTheme: () => set((state) => {
    const next: ThemeMode = state.mode === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('theme-mode', next); } catch { /* 무시 */ }
    return { mode: next };
  }),
  setTheme: (mode) => {
    try { localStorage.setItem('theme-mode', mode); } catch { /* 무시 */ }
    set({ mode });
  },
}));