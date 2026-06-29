// jp: 로그인/회원가입 모달 - 백엔드 인증 API 연결 (authStore 사용)
// jp: ★ 이색적 디자인: 그라데이션 헤더(✦로고) + 글래스 필드(포커스 핑크 글로우) + 그라데이션 버튼
// jp: 기능 동일 - 비번 보기 토글, 공백 자동 제거, 에러 처리, 로그인/회원가입 토글

import { useState, useEffect } from 'react';
import { X, Mail, Lock, User, Loader2, Eye, EyeOff, Sparkles } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
}

type Mode = 'login' | 'register';

export function AuthModal({ open, onClose }: AuthModalProps) {
  const { login, register, loginWithNaver, loginWithGoogle } = useAuthStore();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // jp: 포커스된 필드 (핑크 글로우 표시용)
  const [focused, setFocused] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    const onMessage = async (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const data = e.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'NAVER_AUTH_SUCCESS' && data.code) {
        const savedState = sessionStorage.getItem('naver_state') || '';
        setLoading(true); setError('');
        try {
          await loginWithNaver(data.code, data.state || savedState);
          reset();
          onClose();
        } catch {
          setError('네이버 로그인에 실패했어요.');
          setLoading(false);
        }
      } else if (data.type === 'NAVER_AUTH_ERROR') {
        setError('네이버 로그인이 취소됐어요.');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [open]);

  const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  const GOOGLE_REDIRECT = window.location.origin + '/google-callback.html';

  const handleGoogleLogin = () => {
    if (!GOOGLE_CLIENT_ID) { setError('구글 로그인 설정이 없어요.'); return; }
    const url = 'https://accounts.google.com/o/oauth2/v2/auth'
      + '?response_type=code'
      + '&client_id=' + encodeURIComponent(GOOGLE_CLIENT_ID)
      + '&redirect_uri=' + encodeURIComponent(GOOGLE_REDIRECT)
      + '&scope=' + encodeURIComponent('email profile')
      + '&access_type=online'
      + '&prompt=select_account';
    const w = 480, h = 700;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    window.open(url, 'googleLogin', 'width=' + w + ',height=' + h + ',left=' + left + ',top=' + top);
  };

  useEffect(() => {
    if (!open) return;
    const onMessage = async (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const data = e.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'GOOGLE_AUTH_SUCCESS' && data.code) {
        setLoading(true); setError('');
        try {
          await loginWithGoogle(data.code, GOOGLE_REDIRECT);
          reset();
          onClose();
        } catch {
          setError('구글 로그인에 실패했어요.');
          setLoading(false);
        }
      } else if (data.type === 'GOOGLE_AUTH_ERROR') {
        setError('구글 로그인이 취소됐어요.');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [open]);

  if (!open) return null;

  const reset = () => {
    setEmail(''); setPassword(''); setNickname(''); setError(''); setLoading(false); setShowPw(false); setFocused('');
  };

  const NAVER_CLIENT_ID = import.meta.env.VITE_NAVER_CLIENT_ID || '';
  const NAVER_REDIRECT = window.location.origin + '/naver-callback.html';

  const handleNaverLogin = () => {
    if (!NAVER_CLIENT_ID) { setError('네이버 로그인 설정이 없어요.'); return; }
    const state = Math.random().toString(36).slice(2);
    sessionStorage.setItem('naver_state', state);
    const url = 'https://nid.naver.com/oauth2.0/authorize'
      + '?response_type=code'
      + '&client_id=' + encodeURIComponent(NAVER_CLIENT_ID)
      + '&redirect_uri=' + encodeURIComponent(NAVER_REDIRECT)
      + '&state=' + encodeURIComponent(state);
    const w = 480, h = 700;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    window.open(url, 'naverLogin', 'width=' + w + ',height=' + h + ',left=' + left + ',top=' + top);
  };


  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async () => {
    setError('');
    const cleanEmail = email.trim().toLowerCase();
    const cleanPw = password.trim();

    if (!cleanEmail.includes('@')) { setError('올바른 이메일을 입력해주세요.'); return; }
    if (cleanPw.length < 8) { setError('비밀번호는 8자 이상이어야 해요.'); return; }

    setLoading(true);
    try {
      if (mode === 'login') {
        await login(cleanEmail, cleanPw);
      } else {
        await register(cleanEmail, cleanPw, nickname.trim() || undefined);
      }
      reset();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('409')) setError('이미 가입된 이메일이에요.');
      else if (msg.includes('401')) setError('이메일 또는 비밀번호가 올바르지 않아요.');
      else if (msg.includes('429')) setError('잠시 후 다시 시도해주세요. (너무 많은 시도)');
      else setError(mode === 'login' ? '로그인에 실패했어요.' : '회원가입에 실패했어요.');
    } finally {
      setLoading(false);
    }
  };

  // jp: 글래스 입력 필드 스타일 (포커스 시 핑크 글로우)
  const fieldStyle = (name: string): React.CSSProperties => ({
    background: focused === name ? 'var(--accent-bg)' : 'var(--bg-elevated)',
    border: `1px solid ${focused === name ? 'var(--accent-border)' : 'var(--border)'}`,
    boxShadow: focused === name ? '0 0 0 3px var(--accent-bg)' : 'none',
    transition: 'all 0.18s',
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(3,1,8,0.72)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' }}
      onClick={handleClose}
    >
      <div
        className="w-full max-w-[400px] rounded-[26px] overflow-hidden"
        style={{ background: 'var(--bg-card)', maxHeight: '88vh', overflowY: 'auto', border: '1px solid var(--border)', boxShadow: '0 30px 70px rgba(0,0,0,0.6)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* jp: ★ 그라데이션 헤더 */}
        <div
          className="relative px-6 pt-6 pb-5"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          <button onClick={handleClose} className="absolute top-[18px] right-[18px] w-[30px] h-[30px] rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.1)' }} aria-label="닫기">
            <X size={16} color="#fff" />
          </button>
          <div className="w-[38px] h-[38px] rounded-xl flex items-center justify-center mb-3"
            style={{ background: '#ffffff', boxShadow: '0 6px 16px rgba(255,255,255,0.35)' }}>
            <Sparkles size={20} color="#000" />
          </div>
          <h2 className="text-xl font-extrabold" style={{ color: '#fff' }}>
            {mode === 'login' ? '다시 오셨네요' : '환영해요'}
          </h2>
          <p className="text-[11.5px] mt-1" style={{ color: 'rgba(255,255,255,0.6)' }}>
            {mode === 'login' ? '로그인하고 전체 기능을 이용하세요' : '가입하고 모든 기능을 무료로 즐기세요'}
          </p>
        </div>

        {/* jp: 바디 */}
        <div className="px-6 pt-5 pb-6">
          {/* jp: 닉네임 (회원가입만) */}
          {mode === 'register' && (
            <div className="mb-3 flex items-center gap-3 px-4 py-3.5 rounded-[15px]" style={fieldStyle('nickname')}>
              <User size={18} style={{ color: focused === 'nickname' ? '#ffffff' : 'var(--text-tertiary)' }} />
              <input
                type="text"
                placeholder="닉네임 (선택)"
                value={nickname}
                onChange={e => setNickname(e.target.value)}
                onFocus={() => setFocused('nickname')}
                onBlur={() => setFocused('')}
                maxLength={20}
                className="flex-1 bg-transparent outline-none text-sm"
                style={{ color: 'var(--text-primary)' }}
              />
            </div>
          )}

          {/* jp: 이메일 */}
          <div className="mb-3 flex items-center gap-3 px-4 py-3.5 rounded-[15px]" style={fieldStyle('email')}>
            <Mail size={18} style={{ color: focused === 'email' ? '#ffffff' : 'var(--text-tertiary)' }} />
            <input
              type="email"
              placeholder="이메일"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onFocus={() => setFocused('email')}
              onBlur={() => setFocused('')}
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: 'var(--text-primary)' }}
            />
          </div>

          {/* jp: 비밀번호 */}
          <div className="mb-3 flex items-center gap-3 px-4 py-3.5 rounded-[15px]" style={fieldStyle('password')}>
            <Lock size={18} style={{ color: focused === 'password' ? '#ffffff' : 'var(--text-tertiary)' }} />
            <input
              type={showPw ? 'text' : 'password'}
              placeholder="비밀번호 (8자 이상)"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onFocus={() => setFocused('password')}
              onBlur={() => setFocused('')}
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              autoCapitalize="none"
              spellCheck={false}
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: 'var(--text-primary)' }}
            />
            <button type="button" onClick={() => setShowPw(v => !v)} className="p-0.5"
              aria-label={showPw ? '비밀번호 숨기기' : '비밀번호 보기'}>
              {showPw
                ? <EyeOff size={18} style={{ color: 'var(--text-tertiary)' }} />
                : <Eye size={18} style={{ color: 'var(--text-tertiary)' }} />}
            </button>
          </div>

          {/* jp: 에러 */}
          {error && (
            <p className="text-xs mb-3 px-1" style={{ color: 'var(--fall)' }}>{error}</p>
          )}

          {/* jp: ★ 그라데이션 제출 버튼 */}
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full py-[15px] rounded-[15px] text-sm font-extrabold flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.99] transition-all mt-1"
            style={{ background: '#c2620e', color: '#ffffff', boxShadow: '0 10px 26px rgba(194,98,14,0.35)' }}
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {mode === 'login' ? '로그인' : '회원가입'}
          </button>

          {/* jp: 구분선 */}
          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
            <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>또는</span>
            <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
          </div>

          {/* jp: 네이버 로그인 버튼 */}
          <button
            onClick={handleNaverLogin}
            disabled={loading}
            className="w-full py-[14px] rounded-[15px] text-sm font-bold flex items-center justify-center disabled:opacity-60 active:scale-[0.99] transition-all"
            style={{ background: '#1e1f29', color: '#e5e7eb', border: '1px solid #2d2f3a' }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, width: 160 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, fontWeight: 900, fontSize: 20, lineHeight: 1, color: '#03C75A', flexShrink: 0 }}>N</span>
              <span>네이버로 시작하기</span>
            </span>
          </button>

          {/* jp: 구글 로그인 버튼 */}
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full py-[14px] rounded-[15px] text-sm font-bold flex items-center justify-center disabled:opacity-60 active:scale-[0.99] transition-all mt-2"
            style={{ background: '#1e1f29', color: '#e5e7eb', border: '1px solid #2d2f3a' }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, width: 160 }}>
              <svg width="22" height="22" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
                <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"/>
                <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"/>
                <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"/>
                <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"/>
              </svg>
              <span>구글로 시작하기</span>
            </span>
          </button>

          {/* jp: 모드 전환 - 박스 디자인 */}
          <div className="mt-4 rounded-[14px] p-[14px] text-center" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)' }}>
            <p className="text-xs mb-[10px]" style={{ color: 'var(--text-tertiary)' }}>
              {mode === 'login' ? '아직 계정이 없으신가요?' : '이미 계정이 있으신가요?'}
            </p>
            <button
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
              className="w-full py-[11px] rounded-[11px] text-sm font-bold active:scale-[0.99] transition-all"
              style={{ background: 'transparent', border: '1px solid var(--accent-border)', color: '#ffffff' }}
            >
              {mode === 'login' ? '회원가입하기' : '로그인하기'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
