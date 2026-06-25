// jp: 종목 위험도 배지

import { RiskLevel } from '@/types/stockFeature';

const RISK_CONFIG: Record<RiskLevel, { label: string; bg: string; color: string }> = {
  low:      { label: '위험 낮음', bg: 'rgba(148,152,168,0.15)', color: 'var(--text-secondary)' },
  medium:   { label: '주의',      bg: 'rgba(245,158,11,0.15)',  color: '#f59e0b' },
  high:     { label: '위험',      bg: 'rgba(249,115,22,0.18)',  color: '#f97316' },
  critical: { label: '높은 위험', bg: 'rgba(255,82,82,0.18)',   color: 'var(--rise)' },
};

export function FeaturedStockRiskBadge({ level }: { level: RiskLevel }) {
  const c = RISK_CONFIG[level];
  return (
    <span
      className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
      style={{ background: c.bg, color: c.color }}
    >
      {c.label}
    </span>
  );
}
