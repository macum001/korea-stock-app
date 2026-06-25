// jp: 비회원 잠금 카드
// jp: 상태+요약은 보이고, 나머지는 블러+자물쇠+회원가입 버튼
// jp: ★ 자물쇠/버튼 이색적으로 (그라데이션)

import { Lock } from 'lucide-react';
import { MarketBriefing } from '@/types/briefing';

interface Props {
  briefing: Partial<MarketBriefing> & { locked?: boolean };
  onSignupClick: () => void;
}

function statusStyle(status?: string): { bg: string; color: string; label: string } {
  switch (status) {
    case '좋음':
      return { bg: 'rgba(16,185,129,0.15)', color: '#10b981', label: '좋음' };
    case '나쁨':
      return { bg: 'rgba(255,82,82,0.15)', color: 'var(--fall, #ef4444)', label: '나쁨' };
    default:
      return { bg: 'var(--bg-elevated)', color: 'var(--text-secondary)', label: '보통' };
  }
}

function slotToKorean(slot?: string): string {
  if (!slot || slot === 'test' || slot.length !== 4) return '';
  const h = parseInt(slot.slice(0, 2), 10);
  const m = parseInt(slot.slice(2), 10);
  if (isNaN(h)) return '';
  return m === 0 ? `${h}시` : `${h}시 ${m}분`;
}

function formatDateKST(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const d = dateStr.length === 10
      ? new Date(dateStr + 'T00:00:00+09:00')
      : new Date(new Date(dateStr).getTime() + 9 * 60 * 60 * 1000);
    return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
  } catch {
    return String(dateStr).slice(0, 10);
  }
}

export function GuestLockedCard({ briefing, onSignupClick }: Props) {
  const st = statusStyle(briefing.analysis?.status ?? briefing.status);
  const date = formatDateKST(briefing.date);
  const time = slotToKorean(briefing.slot);
  const basis = time ? `${date} · ${time} 기준` : `${date} 기준`;

  return (
    <div className="px-4 pt-2">
      <div className="rounded-2xl px-4 py-4"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>

        {/* jp: 상태 뱃지 (보임) */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>오늘의 시장</span>
          <span className="text-[13px] font-bold px-2.5 py-0.5 rounded-full"
            style={{ background: st.bg, color: st.color }}>{st.label}</span>
        </div>
        <p className="text-[11px] mb-3" style={{ color: 'var(--text-tertiary)' }}>{basis}</p>

        {/* jp: 한 줄 요약 (보임) */}
        <p className="text-[15px] font-bold leading-snug mb-1" style={{ color: 'var(--text-primary)' }}>
          {briefing.summary ?? ''}
        </p>

        {/* jp: 잠금 영역 - 블러된 가짜 텍스트 + 자물쇠 오버레이 */}
        <div className="relative pt-3 mt-2" style={{ borderTop: '1px solid var(--border-subtle, var(--border))', minHeight: 150 }}>
          {/* jp: 블러 처리될 더미 내용 */}
          <div style={{ filter: 'blur(5px)', opacity: 0.5, userSelect: 'none', pointerEvents: 'none' }}>
            <p className="text-[11px] mb-1" style={{ color: 'var(--text-tertiary)' }}>왜 이렇게 됐나</p>
            <p className="text-[13px] leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>
              반도체 지수가 급등하며 기술주 전반을 끌어올렸고 주요 종목이 일제히 강세를 보이며 시장을 견인했습니다
            </p>
            <p className="text-[11px] mb-1" style={{ color: 'var(--text-tertiary)' }}>한국 영향</p>
            <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              국내 반도체주 강세 기대 환율 변동으로 외국인 자금 흐름에 영향을 줄 수 있습니다
            </p>
          </div>

          {/* jp: 자물쇠 + 가입 버튼 오버레이 - ★ 이색적으로 */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5">
            <div className="w-12 h-12 rounded-[14px] flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg,#7F77DD,#DB2777)', boxShadow: '0 8px 24px rgba(219,39,119,0.4)' }}>
              <Lock size={20} style={{ color: '#fff' }} />
            </div>
            <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              전체 분석은 회원만 볼 수 있어요
            </p>
            <button onClick={onSignupClick}
              className="text-[13px] font-extrabold px-5 py-2.5 rounded-[14px] active:scale-95 transition-transform"
              style={{ background: 'linear-gradient(135deg,#7F77DD,#DB2777)', color: '#fff', boxShadow: '0 10px 28px rgba(219,39,119,0.36)' }}>
              ✦ 회원가입하고 전체 보기
            </button>
          </div>
        </div>
      </div>

      {/* jp: 하단 안내 */}
      <p className="text-[11px] text-center leading-relaxed mt-3 px-2" style={{ color: 'var(--text-tertiary)' }}>
        하루 5번 시장 브리핑 · 26개 지표 · 지난 기록까지<br />
        회원가입 후 무료로 모두 이용하세요
      </p>
    </div>
  );
}
