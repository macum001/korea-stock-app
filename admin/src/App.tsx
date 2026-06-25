// jp: 어드민 앱 루트 - 로그인 안 됐으면 LoginPage, 됐으면 DashboardPage

import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/lib/authStore';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';

export default function App() {
  const { admin, loading, init } = useAuthStore();

  // jp: 시작 시 저장된 토큰으로 자동 로그인 시도
  useEffect(() => { void init(); }, [init]);

  // jp: 초기 토큰 검증 중
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={28} className="spin" color="var(--admin-accent)" />
        <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return admin ? <DashboardPage /> : <LoginPage />;
}
