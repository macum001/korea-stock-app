// jp: 특징 사유 / 주의 사유 배지 - 톤별 색상
// jp: positive=빨강, negative=파랑, caution=주황, neutral=회색

import { FeatureReason } from '@/types/stockFeature';

const TONE_STYLE: Record<FeatureReason['tone'], { bg: string; color: string }> = {
  positive: { bg: 'rgba(255,82,82,0.12)',  color: 'var(--rise)' },
  negative: { bg: 'rgba(92,138,255,0.12)', color: 'var(--fall)' },
  caution:  { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
  neutral:  { bg: 'var(--bg-elevated)',    color: 'var(--text-secondary)' },
};

export function FeaturedStockReasonBadges({ reasons }: { reasons: FeatureReason[] }) {
  if (reasons.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      {reasons.map((r, i) => {
        const s = TONE_STYLE[r.tone];
        return (
          <span
            key={i}
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full truncate self-start"
            style={{ background: s.bg, color: s.color }}
          >
            {r.label}
          </span>
        );
      })}
    </div>
  );
}
