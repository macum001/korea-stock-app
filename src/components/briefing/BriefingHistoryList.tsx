// jp: "지난 기록" 탭 - 회원: 과거 브리핑 목록 / 비회원: 잠금 안내

import { useState, useEffect } from 'react';
import { Lock } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { getBriefingHistory } from '@/services/marketBriefingService';
import { MarketBriefing } from '@/types/briefing';
import { BriefingTimelineItem } from './BriefingTimelineItem';
import { DisclaimerNote } from './DisclaimerNote';
import { AuthModal } from '@/components/auth/AuthModal';

export function BriefingHistoryList() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [briefings, setBriefings] = useState<MarketBriefing[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    let active = true;
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    getBriefingHistory(50).then(list => {
      if (active) {
        setBriefings(list);
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, [isAuthenticated]);

  // jp: 비회원 - 히스토리 잠금 안내
  if (!isAuthenticated) {
    return (
      <>
        <div className="px-4 pt-6">
          <div className="rounded-2xl px-4 py-10 flex flex-col items-center gap-3 text-center"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div className="w-11 h-11 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(77,124,254,0.15)' }}>
              <Lock size={22} style={{ color: 'var(--accent)' }} />
            </div>
            <p className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>
              지난 기록은 회원 전용이에요
            </p>
            <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
              과거 시점의 시황이 실제로 맞았는지<br />회원가입 후 직접 확인해보세요
            </p>
            <button onClick={() => setShowLogin(true)}
              className="text-[13px] font-bold px-5 py-2 rounded-full mt-1 active:scale-95 transition-transform"
              style={{ background: 'var(--accent)', color: '#fff' }}>
              회원가입하고 보기
            </button>
          </div>
        </div>
        <AuthModal open={showLogin} onClose={() => setShowLogin(false)} />
      </>
    );
  }

  if (loading) {
    return (
      <div className="mx-4 mt-4 rounded-2xl px-4 py-8 text-center"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>지난 기록을 불러오는 중...</p>
      </div>
    );
  }

  const past = briefings.slice(1);

  if (past.length === 0) {
    return (
      <div className="mx-4 mt-4 rounded-2xl px-4 py-8 text-center"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
          아직 지난 기록이 없어요
        </p>
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          브리핑이 쌓이면 여기서 과거 시점의 시황을 다시 볼 수 있어요.
        </p>
      </div>
    );
  }

  return (
    <div>
      {past.map(b => (
        <BriefingTimelineItem key={b.id} briefing={b} defaultExpanded={false} />
      ))}
      <DisclaimerNote />
    </div>
  );
}
