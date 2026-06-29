// jp: 어드민 대시보드 - 사이드바 + 메인
// jp: Overview에 캐시 초기화 버튼 + 공시 가격영향 재계산 버튼 추가
import { useState, useEffect } from 'react';
import {
  LayoutDashboard, FileText, Sparkles, Bell, Users,
  Settings, LogOut, Shield, Trash2, Loader2, Check, RefreshCw, BarChart2,
} from 'lucide-react';
import { useAuthStore } from '@/lib/authStore';
import { dataApi, DisclosureStats, AiHistoryStats, NotificationStats, TokenStats } from '@/lib/dataApi';
import { usersApi, UsersStats } from '@/lib/usersApi';
import { DisclosuresPage } from '@/pages/DisclosuresPage';
import { AiHistoryPage } from '@/pages/AiHistoryPage';
import { NotificationsPage } from '@/pages/NotificationsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { UsersPage } from '@/pages/UsersPage';
import { BriefingPage } from '@/pages/BriefingPage';
import { DisclosureStatsPage } from '@/pages/DisclosureStatsPage';

type MenuId = 'overview' | 'briefing' | 'disclosure-stats' | 'disclosures' | 'ai' | 'notifications' | 'users' | 'settings';

const MENUS: { id: MenuId; label: string; Icon: typeof FileText; ready: boolean; cost?: boolean }[] = [
  { id: 'overview',         label: '개요',             Icon: LayoutDashboard, ready: true },
  { id: 'briefing',         label: '시황 브리핑',       Icon: Sparkles,        ready: true, cost: true },
  { id: 'disclosure-stats', label: '공시 통계',         Icon: BarChart2,       ready: true },
  { id: 'disclosures',      label: '공시 관리',         Icon: FileText,        ready: true, cost: true },
  { id: 'ai',               label: 'AI 분석 기록',      Icon: Sparkles,        ready: true, cost: true },
  { id: 'notifications',    label: '알림 관리',         Icon: Bell,            ready: true },
  { id: 'users',            label: '사용자 관리',       Icon: Users,           ready: true },
  { id: 'settings',         label: '설정 / 프롬프트',   Icon: Settings,        ready: true },
];

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export function DashboardPage() {
  const { admin, logout } = useAuthStore();
  const [active, setActive] = useState<MenuId>('overview');

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{ width: 240, background: 'var(--admin-card)', borderRight: '1px solid var(--admin-border)', display: 'flex', flexDirection: 'column', padding: '20px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px 20px' }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--admin-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Shield size={18} color="#fff" />
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>공시정보 AI</p>
            <p style={{ fontSize: 11, color: 'var(--admin-text-ter)', margin: 0 }}>어드민</p>
          </div>
        </div>

        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {MENUS.map(({ id, label, Icon, ready, cost }) => (
            <button key={id} onClick={() => setActive(id)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 9, border: 'none', cursor: 'pointer', textAlign: 'left', background: active === id ? 'var(--admin-accent)' : 'transparent', color: active === id ? '#fff' : 'var(--admin-text-sec)', fontSize: 13.5, fontWeight: active === id ? 600 : 500 }}>
              <Icon size={17} />
              <span style={{ flex: 1 }}>{label}</span>
              {cost && <span title="AI 토큰/비용 발생" style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 5, background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>$</span>}
              {!ready && <span style={{ fontSize: 9, padding: '2px 5px', borderRadius: 4, background: 'var(--admin-elevated)', color: 'var(--admin-text-ter)' }}>준비중</span>}
            </button>
          ))}
        </nav>

        <div style={{ borderTop: '1px solid var(--admin-border)', paddingTop: 12, marginTop: 12 }}>
          <div style={{ padding: '0 8px 10px' }}>
            <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{admin?.name || admin?.username}</p>
            <p style={{ fontSize: 11, color: 'var(--admin-text-ter)', margin: '2px 0 0' }}>{admin?.username} · {admin?.role}</p>
          </div>
          <button onClick={logout} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 12px', borderRadius: 9, border: 'none', cursor: 'pointer', background: 'transparent', color: 'var(--admin-text-sec)', fontSize: 13 }}>
            <LogOut size={16} /> 로그아웃
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, padding: 28, overflowY: 'auto' }}>
        {active === 'overview'         && <Overview adminName={admin?.name || admin?.username || ''} />}
        {active === 'briefing'         && <BriefingPage />}
        {active === 'disclosure-stats' && <DisclosureStatsPage />}
        {active === 'disclosures'      && <DisclosuresPage />}
        {active === 'ai'               && <AiHistoryPage />}
        {active === 'notifications'    && <NotificationsPage />}
        {active === 'users'            && <UsersPage />}
        {active === 'settings'         && <SettingsPage />}
      </main>
    </div>
  );
}

function Overview({ adminName }: { adminName: string }) {
  const [stats, setStats] = useState<DisclosureStats | null>(null);
  const [aiStats, setAiStats] = useState<AiHistoryStats | null>(null);
  const [notiStats, setNotiStats] = useState<NotificationStats | null>(null);
  const [userStats, setUserStats] = useState<UsersStats | null>(null);
  const [tokenStats, setTokenStats] = useState<TokenStats | null>(null);

  // jp: 캐시 초기화 상태
  const [cacheClearing, setCacheClearing] = useState(false);
  const [cacheDone, setCacheDone] = useState(false);
  const [cacheCleared, setCacheCleared] = useState(0);
  const [cacheError, setCacheError] = useState('');

  // jp: 공시 가격영향 재계산 상태
  const [impactRunning, setImpactRunning] = useState(false);
  const [impactDone, setImpactDone] = useState(false);
  const [impactResult, setImpactResult] = useState('');
  const [impactError, setImpactError] = useState('');

  useEffect(() => {
    dataApi.disclosureStats().then(setStats).catch(() => setStats(null));
    dataApi.aiHistoryStats().then(setAiStats).catch(() => setAiStats(null));
    dataApi.notificationStats().then(setNotiStats).catch(() => setNotiStats(null));
    usersApi.stats().then(setUserStats).catch(() => setUserStats(null));
    dataApi.tokenStats().then(setTokenStats).catch(() => setTokenStats(null));
  }, []);

  const fmtToken = (n: number): string => {
    if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toLocaleString();
  };

  // jp: AI 분석 캐시 초기화
  const handleClearCache = async () => {
    if (!window.confirm('AI 분석 캐시를 초기화할까요? 캐시된 분석 결과가 모두 삭제되고 다음 요청 시 새로 분석합니다.')) return;
    setCacheClearing(true); setCacheError(''); setCacheDone(false);
    try {
      const token = localStorage.getItem('admin_token') || '';
      const res = await fetch(`${API_URL}/api/admin/data/ai-cache`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json() as { data?: { cleared?: number } };
      setCacheCleared(json.data?.cleared ?? 0);
      setCacheDone(true);
      setTimeout(() => setCacheDone(false), 4000);
    } catch {
      setCacheError('초기화 실패. 다시 시도해주세요.');
    } finally {
      setCacheClearing(false);
    }
  };

  // jp: 공시 가격영향 재계산 수동 실행
  const handleRunImpact = async () => {
    if (!window.confirm('공시 가격영향 재계산을 실행할까요?\n최대 2,000개 처리 (약 1~2분 소요)')) return;
    setImpactRunning(true); setImpactError(''); setImpactDone(false); setImpactResult('');
    try {
      const token = localStorage.getItem('admin_token') || '';
      const res = await fetch(`${API_URL}/api/admin/data/impact/recompute`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error(`${res.status}`);
      // jp: 백엔드 응답 형태: { success, data: { processed, recovered, ... } }
      const json = await res.json() as { data?: { processed?: number; recovered?: number; pending_left?: number } };
      const d = json.data ?? {};
      setImpactDone(true);
      const parts: string[] = [`처리 ${(d.processed ?? 0).toLocaleString()}개`];
      if (d.recovered != null) parts.push(`복구 ${d.recovered.toLocaleString()}개`);
      if (d.pending_left != null) parts.push(`남은 pending ${d.pending_left.toLocaleString()}개`);
      setImpactResult(parts.join(' · '));
      setTimeout(() => { setImpactDone(false); setImpactResult(''); }, 5000);
    } catch {
      setImpactError('실행 실패. 백엔드 로그를 확인해주세요.');
    } finally {
      setImpactRunning(false);
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>안녕하세요, {adminName}님</h1>
      <p style={{ fontSize: 14, color: 'var(--admin-text-sec)', margin: '8px 0 28px' }}>공시정보 AI 어드민 대시보드입니다.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
        <StatCard label="가입자" value={userStats ? userStats.total.toLocaleString() : '…'} hint={userStats ? `오늘 ${userStats.today}명` : '전체 사용자'} />
        <StatCard label="수집된 공시" value={stats ? stats.total.toLocaleString() : '…'} hint="전체 건수" />
        <StatCard label="AI 분석 기록" value={aiStats ? aiStats.total.toLocaleString() : '…'} hint={aiStats ? `오늘 ${aiStats.today}건` : '사용자 분석'} />
        <StatCard label="발송 알림" value={notiStats ? notiStats.total.toLocaleString() : '…'} hint={notiStats ? `오늘 ${notiStats.today}건` : '전체'} />
        <StatCard label="AI 총 토큰" value={tokenStats ? fmtToken(tokenStats.totalTokens) : '…'} hint="공시+브리핑+종목분석" />
        <StatCard label="예상 비용" value={tokenStats ? `$${tokenStats.estimatedCostUsd.toLocaleString()}` : '…'} hint="누적 (Claude 기준)" />
      </div>

      {/* jp: 공시 분류 현황 */}
      {stats && (
        <div style={{ marginTop: 20, padding: 20, background: 'var(--admin-card)', border: '1px solid var(--admin-border)', borderRadius: 14 }}>
          <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 14px' }}>공시 현황</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ padding: '8px 14px', background: 'var(--admin-elevated)', borderRadius: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--admin-text-sec)' }}>전체 공시</span>
              <span style={{ fontSize: 15, fontWeight: 700, marginLeft: 8 }}>{stats.total.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      {/* jp: 관리 액션 버튼들 */}
      <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* AI 캐시 초기화 */}
        <div style={{ padding: 20, background: 'var(--admin-card)', border: '1px solid var(--admin-border)', borderRadius: 14 }}>
          <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 6px' }}>AI 분석 캐시</p>
          <p style={{ fontSize: 12, color: 'var(--admin-text-sec)', margin: '0 0 14px', lineHeight: 1.6 }}>
            캐시된 AI 분석 결과를 초기화해요. 다음 요청 시 새로 분석합니다.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={handleClearCache} disabled={cacheClearing}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 9, border: '1px solid var(--admin-border)', background: cacheDone ? '#10b98120' : 'var(--admin-elevated)', color: cacheDone ? '#10b981' : 'var(--admin-text-sec)', fontSize: 13, fontWeight: 600, cursor: cacheClearing ? 'default' : 'pointer', opacity: cacheClearing ? 0.6 : 1 }}>
              {cacheClearing ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : cacheDone ? <Check size={14} /> : <Trash2 size={14} />}
              {cacheDone ? '초기화 완료' : 'AI 캐시 초기화'}
            </button>
            {cacheDone && cacheCleared > 0 && <span style={{ fontSize: 12, color: '#10b981' }}>{cacheCleared.toLocaleString()}건 초기화됨</span>}
            {cacheError && <span style={{ fontSize: 12, color: '#ef4444' }}>{cacheError}</span>}
          </div>
        </div>

        {/* 공시 가격영향 재계산 */}
        <div style={{ padding: 20, background: 'var(--admin-card)', border: '1px solid var(--admin-border)', borderRadius: 14 }}>
          <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 6px' }}>공시 가격영향 재계산</p>
          <p style={{ fontSize: 12, color: 'var(--admin-text-sec)', margin: '0 0 14px', lineHeight: 1.6 }}>
            pending 공시의 주가영향을 재계산해요. 자동: 평일 09:00 / 16:30 / 21:00
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={handleRunImpact} disabled={impactRunning}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 9, border: '1px solid var(--admin-border)', background: impactDone ? '#10b98120' : 'var(--admin-elevated)', color: impactDone ? '#10b981' : 'var(--admin-text-sec)', fontSize: 13, fontWeight: 600, cursor: impactRunning ? 'default' : 'pointer', opacity: impactRunning ? 0.6 : 1 }}>
              {impactRunning ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : impactDone ? <Check size={14} /> : <RefreshCw size={14} />}
              {impactRunning ? '재계산 중...' : impactDone ? '완료' : '지금 재계산'}
            </button>
            {impactResult && <span style={{ fontSize: 12, color: '#10b981' }}>{impactResult}</span>}
            {impactError && <span style={{ fontSize: 12, color: '#ef4444' }}>{impactError}</span>}
          </div>
        </div>

      </div>

      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div style={{ background: 'var(--admin-card)', border: '1px solid var(--admin-border)', borderRadius: 14, padding: 18 }}>
      <p style={{ fontSize: 13, color: 'var(--admin-text-sec)', margin: 0 }}>{label}</p>
      <p style={{ fontSize: 28, fontWeight: 700, margin: '6px 0 0' }}>{value}</p>
      <p style={{ fontSize: 11, color: 'var(--admin-text-ter)', margin: '4px 0 0' }}>{hint}</p>
    </div>
  );
}
