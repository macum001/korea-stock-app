// jp: 배지 컴포넌트

import { cn } from '@/utils/format';

type BadgeVariant = 'rise' | 'fall' | 'neutral' | 'warning' | 'important' | 'caution';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md';
}

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  rise: 'bg-rise-subtle text-rise',
  fall: 'bg-fall-subtle text-fall',
  neutral: '',
  warning: '',
  important: 'bg-rise-subtle text-rise',
  caution: '',
};

export function Badge({ variant = 'neutral', children, className, size = 'sm' }: BadgeProps) {
  const inlineStyle = variant === 'neutral'
    ? { backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }
    : variant === 'warning'
    ? { backgroundColor: 'rgba(255,165,0,0.12)', color: '#f59e0b' }
    : variant === 'caution'
    ? { backgroundColor: 'rgba(249,115,22,0.12)', color: '#f97316' }
    : undefined;

  return (
    <span
      className={cn(
        'inline-flex items-center font-semibold rounded-full',
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs',
        VARIANT_STYLES[variant],
        className
      )}
      style={inlineStyle}
    >
      {children}
    </span>
  );
}
