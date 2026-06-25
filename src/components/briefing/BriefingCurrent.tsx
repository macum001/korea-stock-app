// jp: "현재" 탭 - 회원: 최신 브리핑 + 26개 지수 / 비회원: 잠금 카드

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { getLatestBriefing } from '@/services/marketBriefingService';
import { MarketBriefing } from '@/types/briefing';
import { MarketBriefingCard } from './MarketBriefingCard';
import { MarketDataGrid } from './MarketDataGrid';
import { DisclaimerNote } from './DisclaimerNote';
import { GuestLockedCard } from './GuestLockedCard';
import { AuthModal } from '@/components/auth/AuthModal';

export function BriefingCurrent() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [briefing, setBriefing] = useState<(MarketBriefing & { locked?: boolean }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    let active = true;
    const load = () => {
      getLatestBriefing().then(({ briefing }) => {
        if (active) {
          setBriefing(briefing as (MarketBriefing & { locked?: boolean }) | null);
          setLoading(false);
        }
      });
    };
    load();
    const timer = setInterval(load, 5 * 60 * 1000);
    return () => { active = false; clearInterval(timer); };
  }, [isAuthenticated]);  // jp: 로그인 상태 바뀌면 다시 로드

  if (loading) {
    return (
      <div className="mx-4 mt-4 rounded-2xl px-4 py-8 text-center"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>시장 브리핑을 불러오는 중...</p>
      </div>
    );
  }

  if (!briefing) {
    return (
      <div className="mx-4 mt-4 rounded-2xl px-4 py-8 text-center"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
          아직 브리핑이 없어요
        </p>
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          오늘의 첫 브리핑이 생성되면 여기에 표시돼요.
        </p>
      </div>
    );
  }

  // jp: 비회원 - 서버가 locked:true + 잘린 데이터를 보냄
  if (!isAuthenticated || briefing.locked) {
    return (
      <>
        <GuestLockedCard briefing={briefing} onSignupClick={() => setShowLogin(true)} />
        <AuthModal open={showLogin} onClose={() => setShowLogin(false)} />
      </>
    );
  }

  // jp: 회원 - 전체
  return (
    <div>
      <MarketBriefingCard briefing={briefing} />
      <MarketDataGrid briefing={briefing} />
      <DisclaimerNote />
    </div>
  );
}
