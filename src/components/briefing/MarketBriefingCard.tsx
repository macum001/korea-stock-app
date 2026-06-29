// jp: 오늘의 시장 브리핑 카드 - 시황 탭 상단
// jp: 상태 뱃지 + 날짜/시간대 기준 + 한줄요약 + AI해석

import { MarketBriefing } from '@/types/briefing';
import { TrendingUp, Sparkles } from 'lucide-react';

interface Props {
  briefing: MarketBriefing;
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

// jp: slot 코드 → "19시" / "19시 5분" 형식
function slotToKorean(slot: string): string {
  if (!slot || slot === 'test') return '';
  if (slot.length !== 4) return slot;
  const hour = parseInt(slot.slice(0, 2), 10);
  const min = parseInt(slot.slice(2), 10);
  if (isNaN(hour)) return '';
  return min === 0 ? `${hour}시` : `${hour}시 ${min}분`;
}

// jp: date(ISO 또는 YYYY-MM-DD) → KST 기준 "2026년 6월 20일"
// jp: PostgreSQL date는 UTC 자정으로 오므로 KST(+9h) 보정 필요
function formatDateKST(dateStr: string): string {
  if (!dateStr) return '';
  try {
    // jp: YYYY-MM-DD만 있으면 그대로 파싱, ISO면 +9h 보정
    let d: Date;
    if (dateStr.length === 10) {
      // jp: 순수 날짜 - 그대로
      d = new Date(dateStr + 'T00:00:00+09:00');
    } else {
      // jp: ISO - KST 보정
      d = new Date(new Date(dateStr).getTime() + 9 * 60 * 60 * 1000);
    }
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    return `${y}년 ${m}월 ${day}일`;
  } catch {
    return String(dateStr).slice(0, 10);
  }
}

// jp: "2026년 6월 20일 · 22시 50분 기준"
function formatBasis(briefing: MarketBriefing): string {
  const date = formatDateKST(briefing.date);
  const time = slotToKorean(briefing.slot);
  if (time) return `${date} · ${time} 기준`;
  return `${date} 기준`;
}

function AnalysisRow({ label, text }: { label: string; text: string }) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="text-[11px] mb-1" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
      <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{text}</p>
    </div>
  );
}

export function MarketBriefingCard({ briefing }: Props) {
  const a = briefing.analysis;

  if (!a) {
    return (
      <div className="mx-4 mb-4 rounded-2xl px-4 py-5 text-center"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
          오늘의 시장 브리핑을 만들고 있어요
        </p>
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          잠시 후 다시 확인해주세요. 아래에서 실시간 시장 숫자는 바로 볼 수 있어요.
        </p>
      </div>
    );
  }

  const st = statusStyle(a.status);
  const basis = formatBasis(briefing);

  return (
    <div className="brief-grad mx-4 mb-4 rounded-2xl px-4 py-4"
      style={{ background: '#000000', border: '1px solid rgba(127,119,221,0.3)' }}>

      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={15} style={{ color: '#A78BFA' }} />
        <span className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>AI 시황 브리핑</span>
        <span className="text-[13px] font-bold px-2.5 py-0.5 rounded-full"
          style={{ background: st.bg, color: st.color }}>
          {st.label}
        </span>
      </div>

      <p className="text-[11px] mb-3" style={{ color: 'var(--text-tertiary)' }}>{basis}</p>

      <p className="text-[15px] font-bold leading-snug mb-3.5" style={{ color: 'var(--text-primary)' }}>
        {a.summary}
      </p>

      <div className="pt-3" style={{ borderTop: '1px solid var(--border-subtle, var(--border))' }}>
        <AnalysisRow label="왜 이렇게 됐나" text={a.why} />
        <AnalysisRow label="한국 영향" text={a.korea_impact} />
        <AnalysisRow label="조심할 점" text={a.caution} />
      </div>

      {/* jp: C방식 - 현재 브리핑 관련 통계 (있을 때만) */}
      {briefing.relevantStats && briefing.relevantStats.length > 0 && (
        <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border-subtle, var(--border))' }}>
          {briefing.relevantStats.map((stat) => (
            <div key={stat.key} className="flex items-start gap-2 rounded-xl px-3 py-2.5 mb-2 last:mb-0"
              style={{ background: 'rgba(77,124,254,0.10)' }}>
              <TrendingUp size={15} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }} />
              <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {stat.message}
              </p>
            </div>
          ))}
          <p className="text-[10px] mt-1 px-1" style={{ color: 'var(--text-tertiary)' }}>
            과거 누적 데이터 기반 참고 정보입니다
          </p>
        </div>
      )}
    </div>
  );
}
