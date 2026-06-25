// jp: 관리자 로그인 화면

import { useState } from 'react';
import { Shield, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/lib/authStore';

export function LoginPage() {
  const { login, error } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!username.trim() || !password || busy) return;
    setBusy(true);
    await login(username.trim(), password);
    setBusy(false);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        {/* jp: 로고/타이틀 */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, background: 'var(--admin-accent)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14,
          }}>
            <Shield size={28} color="#fff" />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>공시탐정 ai</h1>
          <p style={{ fontSize: 13, color: 'var(--admin-text-sec)', margin: '6px 0 0' }}>관리자 페이지</p>
        </div>

        {/* jp: 로그인 카드 */}
        <div style={{
          background: 'var(--admin-card)', border: '1px solid var(--admin-border)',
          borderRadius: 16, padding: 24,
        }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text-sec)' }}>아이디</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
            placeholder="관리자 아이디"
            autoComplete="username"
            style={inputStyle}
          />

          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text-sec)', marginTop: 16, display: 'block' }}>비밀번호</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
            placeholder="비밀번호"
            autoComplete="current-password"
            style={inputStyle}
          />

          {error && (
            <p style={{ fontSize: 13, color: 'var(--admin-danger)', margin: '14px 0 0' }}>{error}</p>
          )}

          <button
            onClick={submit}
            disabled={busy || !username.trim() || !password}
            style={{
              width: '100%', marginTop: 20, padding: '12px', borderRadius: 10, border: 'none',
              background: 'var(--admin-accent)', color: '#fff', fontSize: 15, fontWeight: 600,
              cursor: busy ? 'default' : 'pointer', opacity: busy || !username.trim() || !password ? 0.5 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {busy && <Loader2 size={16} className="spin" />}
            {busy ? '로그인 중...' : '로그인'}
          </button>
        </div>

        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--admin-text-ter)', marginTop: 20 }}>
          관리자 전용 페이지입니다. 권한이 없는 접근은 차단됩니다.
        </p>
      </div>

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', marginTop: 6, padding: '11px 12px', borderRadius: 10,
  border: '1px solid var(--admin-border)', background: 'var(--admin-elevated)',
  color: 'var(--admin-text)', fontSize: 14, outline: 'none',
};
