// jp: 타임라인 접힌 항목 - 누르면 펼쳐짐
// jp: 접힘: 시간 + 상태 + 한줄요약 / 펼침: 전체 카드 + 숫자

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { MarketBriefing } from '@/types/briefing';
import { formatBriefingLabel } from '@/services/marketBriefingService';
import { MarketBriefingCard } from './MarketBriefingCard';
import { MarketDataGrid } from './MarketDataGrid';

interface Props {
  briefing: MarketBriefing;
  defaultExpanded?: boolean;
}

function statusStyle(status: string): { bg: string; color: string; label: string } {
  switch (status) {
    case '좋음':
      return { bg: 'rgba(16,185,129,0.15)', color: '#10b981', label: '좋음' };
    case '나쁨':
      return { bg: 'rgba(255,82,82,0.15)', color: 'var(--fall, #ef4444)', label: '나쁨' };
    default:
      return { bg: 'var(--bg-elevated)', color: 'var(--text-secondary)', label: '보통' };
  }
}

export function BriefingTimelineItem({ briefing, defaultExpanded = false }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const a = briefing.analysis;
  const st = statusStyle(a?.status ?? '보통');
  const label = formatBriefingLabel(briefing);

  // jp: 펼친 상태 - 전체 카드 + 숫자
  if (expanded) {
    return (
      <div className="mb-2">
        {/* jp: 접기 헤더 */}
        <button onClick={() => setExpanded(false)}
          className="flex items-center justify-between w-full px-4 py-2 active:opacity-70">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>{label}</span>
            <span className="text-[12px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: st.bg, color: st.color }}>{st.label}</span>
          </div>
          <ChevronDown size={18} style={{ color: 'var(--text-tertiary)', transform: 'rotate(180deg)' }} />
        </button>
        <MarketBriefingCard briefing={briefing} />
        <MarketDataGrid briefing={briefing} />
      </div>
    );
  }

  // jp: 접힌 상태 - 시간 + 상태 + 요약 한 줄
  return (
    <button onClick={() => setExpanded(true)}
      className="flex items-center gap-3 w-full px-4 py-3 text-left active:opacity-70"
      style={{ borderBottom: '1px solid var(--border-subtle, var(--border))' }}>
      <div className="flex flex-col items-start gap-1 flex-shrink-0" style={{ width: 72 }}>
        <span className="text-[12px] font-bold" style={{ color: 'var(--text-secondary)' }}>{label}</span>
        <span className="text-[11px] font-bold px-1.5 py-0.5 rounded"
          style={{ background: st.bg, color: st.color }}>{st.label}</span>
      </div>
      <p className="flex-1 text-[13px] leading-snug" style={{
        color: 'var(--text-secondary)',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}>
        {a?.summary ?? ''}
      </p>
      <ChevronDown size={16} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
    </button>
  );
}
