// jp: 테마 훅 - 다크/라이트 모드 전환 및 DOM 클래스 관리

import { useEffect } from 'react';
import { useThemeStore } from '@/store/themeStore';

export function useTheme() {
  const { mode, toggleTheme, setTheme } = useThemeStore();

  useEffect(() => {
    const root = document.documentElement;
    if (mode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [mode]);

  return { mode, toggleTheme, setTheme, isDark: mode === 'dark' };
}
