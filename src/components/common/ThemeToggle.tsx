// jp: 다크/라이트 모드 토글 컴포넌트

import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';

interface ThemeToggleProps {
  size?: 'sm' | 'md';
}

export function ThemeToggle({ size = 'md' }: ThemeToggleProps) {
  const { isDark, toggleTheme } = useTheme();
  const iconSize = size === 'sm' ? 16 : 20;

  return (
    <button
      onClick={toggleTheme}
      className="flex items-center justify-center rounded-full transition-all active:scale-95"
      style={{
        width: size === 'sm' ? 32 : 40,
        height: size === 'sm' ? 32 : 40,
        backgroundColor: 'var(--bg-elevated)',
        color: 'var(--text-secondary)',
      }}
      aria-label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
    >
      {isDark ? <Sun size={iconSize} /> : <Moon size={iconSize} />}
    </button>
  );
}
