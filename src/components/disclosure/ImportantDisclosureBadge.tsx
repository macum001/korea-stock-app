// jp: 공시 중요도 배지 컴포넌트

import { DisclosureImportance, DisclosureSentiment } from '@/types/disclosure';
import { Badge } from '@/components/common/Badge';
import { AlertTriangle, TrendingUp, TrendingDown, Info } from 'lucide-react';

interface ImportantDisclosureBadgeProps {
  importance: DisclosureImportance;
  sentiment: DisclosureSentiment;
  showSentiment?: boolean;
}

export function ImportantDisclosureBadge({
  importance,
  sentiment,
  showSentiment = true,
}: ImportantDisclosureBadgeProps) {
  const importanceConfig = {
    important: { label: '중요', variant: 'important' as const },
    warning: { label: '주의', variant: 'warning' as const },
    normal: { label: '일반', variant: 'neutral' as const },
  };

  const sentimentConfig = {
    positive: { label: '호재', variant: 'rise' as const, Icon: TrendingUp },
    negative: { label: '악재', variant: 'fall' as const, Icon: TrendingDown },
    caution: { label: '주의', variant: 'caution' as const, Icon: AlertTriangle },
    neutral: { label: '중립', variant: 'neutral' as const, Icon: Info },
  };

  const impConf = importanceConfig[importance];
  const sentConf = sentimentConfig[sentiment];
  const { Icon } = sentConf;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {importance !== 'normal' && (
        <Badge variant={impConf.variant} size="sm">
          {impConf.label}
        </Badge>
      )}
      {showSentiment && (
        <span
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
          style={
            sentiment === 'positive'
              ? { backgroundColor: 'var(--rise-bg)', color: 'var(--rise)' }
              : sentiment === 'negative'
              ? { backgroundColor: 'var(--fall-bg)', color: 'var(--fall)' }
              : sentiment === 'caution'
              ? { backgroundColor: 'rgba(249,115,22,0.12)', color: '#f97316' }
              : { backgroundColor: 'rgba(127,119,221,0.15)', color: '#A78BFA' }
          }
        >
          <Icon size={9} />
          {sentConf.label}
        </span>
      )}
    </div>
  );
}
