// jp: 공시 상세 시트 안의 "과거 이런 공시 후 주가는?" 통계 섹션
// jp: receiptNo로 그 공시 유형의 과거 주가반응 통계를 가져와 표시
// jp: 공시탐정의 핵심 가치 - 단순 공시가 아니라 "이런 공시 후 보통 어떻게 됐나"

import { useState, useEffect } from 'react';
import { apiClient } from '@/services/apiClient';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface UserDisclosureStat {
  found: boolean;
  type: string | null;
  sampleSize: number;
  avgD5: number;
  avgD30: number;
  upRateD30: number;
  trend: 'up' | 'down' | 'mixed' | 'flat';
}

interface Props {
  receiptNo: string;
}

// jp: 등락 색 (한국식: 양수 빨강, 음수 파랑)
function rateColor(v: number): string {
  if (v > 0.05) return '#ef4444';
  if (v < -0.05) return '#3b82f6';
  return 'var(--text-secondary)';
}
function fmtRate(v: number): string {
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(1)}%`;
}

// jp: 흐름 한 줄 해설
function trendText(stat: UserDisclosureStat): string {
  const { trend, type } = stat;
  switch (trend) {
    case 'up':
      return `과거 ${type} 공시 후에는 시간이 지날수록 주가가 오르는 경향이 있었어요.`;
    case 'down':
      return `과거 ${type} 공시 후에는 시간이 지날수록 주가가 내리는 경향이 있었어요.`;
    case 'mixed':
      return `과거 ${type} 공시 후 단기와 장기 흐름이 달랐어요. 시점에 주의하세요.`;
    default:
      return `과거 ${type} 공시 후 주가는 뚜렷한 방향 없이 보합권이었어요.`;
  }
}

export function DisclosureImpactStat({ receiptNo }: Props) {
  const [stat, setStat] = useState<UserDisclosureStat | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    apiClient.get<UserDisclosureStat>(`/api/disclosures/${receiptNo}/impact-stat`)
      .then(d => { if (alive) { setStat(d); setLoading(false); } })
      .catch(() => { if (alive) { setStat(null); setLoading(false); } });
    return () => { alive = false; };
  }, [receiptNo]);

  // jp: 로딩 중엔 자리만 차지 안 하게 숨김
  if (loading) return null;
  // jp: 통계 없으면(표본 부족 등) 섹션 자체를 안 보여줌
  if (!stat || !stat.found) return null;

  const TrendIcon = stat.trend === 'up' ? TrendingUp : stat.trend === 'down' ? TrendingDown : Minus;

  return (
    <div
      className="rounded-2xl p-4 mb-4"
      style={{
        background: 'linear-gradient(135deg, var(--accent)1f, var(--accent)08)',
        border: '1px solid var(--accent)33',
      }}
    >
      {/* 헤더 */}
      <div className="flex items-center gap-1.5 mb-3">
        <span className="text-sm">💡</span>
        <span className="text-xs font-bold" style={{ color: 'var(--accent)' }}>
          과거 '{stat.type}' 공시 후 주가는?
        </span>
      </div>

      {/* 3개 지표 */}
      <div className="flex gap-2 mb-3">
        <div className="flex-1 rounded-xl py-2.5 text-center" style={{ background: 'var(--bg-card)' }}>
          <p className="text-[10px] mb-0.5" style={{ color: 'var(--text-tertiary)' }}>5일 후</p>
          <p className="text-base font-bold" style={{ color: rateColor(stat.avgD5) }}>{fmtRate(stat.avgD5)}</p>
        </div>
        <div className="flex-1 rounded-xl py-2.5 text-center" style={{ background: 'var(--bg-card)' }}>
          <p className="text-[10px] mb-0.5" style={{ color: 'var(--text-tertiary)' }}>30일 후</p>
          <p className="text-base font-bold" style={{ color: rateColor(stat.avgD30) }}>{fmtRate(stat.avgD30)}</p>
        </div>
        <div className="flex-1 rounded-xl py-2.5 text-center" style={{ background: 'var(--bg-card)' }}>
          <p className="text-[10px] mb-0.5" style={{ color: 'var(--text-tertiary)' }}>30일 상승확률</p>
          <p className="text-base font-bold" style={{ color: stat.upRateD30 >= 50 ? '#10b981' : '#ef4444' }}>{stat.upRateD30}%</p>
        </div>
      </div>

      {/* 한 줄 해설 */}
      <div className="flex items-start gap-1.5 mb-2">
        <TrendIcon size={13} style={{ color: 'var(--text-secondary)', marginTop: 1, flexShrink: 0 }} />
        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {trendText(stat)}
        </p>
      </div>

      {/* 표본 + 주의 */}
      <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
        과거 {stat.type} 공시 {stat.sampleSize}건 분석 · 과거 통계일 뿐 미래를 보장하지 않아요{stat.sampleSize < 10 ? ' (표본이 적어 참고용)' : ''}
      </p>
    </div>
  );
}
