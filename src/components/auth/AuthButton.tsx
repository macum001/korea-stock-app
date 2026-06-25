// jp: 로그인/비로그인 버튼
// jp: 비로그인 = 로그인 아이콘 버튼(42px, 그라데이션 아이콘 버튼)
// jp: 로그인됨 = 유저 아이콘 + 심전도 라인 애니메이션 (로그인 상태 표시)
import { useState } from 'react';
import { LogOut, Settings, UserPlus } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { AuthModal } from './AuthModal';
import { ProfileSheet } from './ProfileSheet';

interface AuthButtonProps {
  size?: 'sm' | 'md' | 'lg';
}

// jp: 심전도 SVG 컴포넌트 - 그라데이션 라인이 좌→우로 흘러감
function HeartbeatLine() {
  return (
    <svg width="36" height="14" viewBox="0 0 36 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="hbGrad" x1="0" y1="0" x2="36" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7F77DD" />
          <stop offset="100%" stopColor="#DB2877" />
        </linearGradient>
      </defs>
      <path
        d="M0 7 L6 7 L8 2 L11 12 L13 7 L20 7 L22 3 L25 11 L27 7 L36 7"
        stroke="url(#hbGrad)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: 80,
          strokeDashoffset: 80,
          animation: 'hbDraw 1.6s ease-in-out infinite',
        }}
      />
      <style>{`
        @keyframes hbDraw {
          0%   { stroke-dashoffset: 80; opacity: 1; }
          55%  { stroke-dashoffset: 0;  opacity: 1; }
          80%  { stroke-dashoffset: 0;  opacity: 0.6; }
          100% { stroke-dashoffset: -80; opacity: 0; }
        }
      `}</style>
    </svg>
  );
}

export function AuthButton({ size = 'md' }: AuthButtonProps) {
  const { isAuthenticated, user, logout } = useAuthStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  if (!isAuthenticated) {
    return (
      <>
        <button
          onClick={() => setModalOpen(true)}
          className="w-[42px] h-[42px] rounded-[14px] flex items-center justify-center active:scale-95 transition-all"
          style={{ background: 'linear-gradient(135deg,#7F77DD,#DB2877)', boxShadow: '0 6px 18px rgba(219,39,119,0.36)' }}
          aria-label="로그인 또는 회원가입"
        >
          <UserPlus size={22} color="#fff" strokeWidth={2.1} />
        </button>
        <AuthModal open={modalOpen} onClose={() => setModalOpen(false)} />
      </>
    );
  }

  return (
    <div className="relative">
      {/* jp: 로그인됨 — 유저 아이콘 + 심전도 라인 */}
      <button
        onClick={() => setMenuOpen(v => !v)}
        className="flex flex-col items-center active:scale-95 transition-all"
        style={{ gap: 2, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        aria-label="프로필 메뉴"
      >
        {/* jp: 유저 아이콘 박스 */}
        <div
          className="w-[34px] h-[34px] rounded-[11px] flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg,#7F77DD,#DB2877)' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
        {/* jp: 심전도 라인 */}
        <HeartbeatLine />
      </button>

      {/* jp: 드롭다운 메뉴 */}
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
          <div
            className="absolute left-0 mt-2 w-48 rounded-2xl p-2 z-50 shadow-xl"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center gap-2.5 px-3 py-2.5 mb-1">
              <span
                className="rounded-full flex items-center justify-center flex-shrink-0 text-sm font-extrabold"
                style={{ width: 36, height: 36, background: 'linear-gradient(135deg,#7F77DD,#DB2877)', color: '#fff' }}
              >
                {(user?.nickname || '?').trim().charAt(0)}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>{user?.nickname}</p>
                <p className="text-[10px] truncate" style={{ color: 'var(--text-tertiary)' }}>{user?.email}</p>
              </div>
            </div>
            <button
              onClick={() => { setProfileOpen(true); setMenuOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold active:opacity-70"
              style={{ color: 'var(--text-primary)' }}
            >
              <Settings size={14} style={{ color: 'var(--accent)' }} />
              내 정보 관리
            </button>
            <button
              onClick={() => { logout(); setMenuOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold active:opacity-70"
              style={{ color: 'var(--fall)' }}
            >
              <LogOut size={14} />
              로그아웃
            </button>
          </div>
        </>
      )}
      <ProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}
