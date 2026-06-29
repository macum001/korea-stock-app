// jp: 내 정보 관리 - 공통 BottomSheet(중앙 모달) 사용
// jp: ★ 푸시 알림 토글 제거 (종목별 🔔로 관리), 아바타 제거, 얇은 폰트 통일
import { useState, useEffect } from 'react';
import { Pencil, KeyRound, LogOut, Check, Loader2, Mail, Calendar, Eye, EyeOff, ChevronRight } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { BottomSheet } from '@/components/common/BottomSheet';
import * as authService from '@/services/authService';
import type { MyProfile } from '@/services/authService';

interface ProfileSheetProps {
  open: boolean;
  onClose: () => void;
}

type Mode = 'view' | 'nickname' | 'password';

export function ProfileSheet({ open, onClose }: ProfileSheetProps) {
  const { user, logout, setNickname } = useAuthStore();
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [mode, setMode] = useState<Mode>('view');

  useEffect(() => {
    if (open) {
      setMode('view');
      authService.getMe().then(setProfile).catch(() => setProfile(null));
    }
  }, [open]);

  return (
    <BottomSheet isOpen={open} onClose={onClose} title="내 정보 관리">
      <div className="px-5 pt-2 pb-5">
        {mode === 'view' && (
          <ViewMode
            profile={profile}
            nickname={user?.nickname || profile?.nickname || ''}
            onEditNickname={() => setMode('nickname')}
            onEditPassword={() => setMode('password')}
            onLogout={() => { logout(); onClose(); }}
          />
        )}
        {mode === 'nickname' && (
          <NicknameMode
            current={user?.nickname || ''}
            onDone={(nn) => { setNickname(nn); setProfile((p) => p ? { ...p, nickname: nn } : p); setMode('view'); }}
            onCancel={() => setMode('view')}
          />
        )}
        {mode === 'password' && (
          <PasswordMode onDone={() => setMode('view')} onCancel={() => setMode('view')} />
        )}
      </div>
    </BottomSheet>
  );
}

function ViewMode({ profile, nickname, onEditNickname, onEditPassword, onLogout }: {
  profile: MyProfile | null;
  nickname: string;
  onEditNickname: () => void;
  onEditPassword: () => void;
  onLogout: () => void;
}) {
  return (
    <div>
      {/* jp: 그라데이션 프로필 헤더 - 아바타 없이 닉네임 중심, 얇은 폰트 */}
      <div
        className="rounded-2xl p-5 mb-4"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
      >
        <p className="text-[19px] font-medium" style={{ color: 'var(--text-primary)' }}>{nickname}</p>
        <p className="text-xs font-light mt-1" style={{ color: 'var(--text-tertiary)' }}>{profile?.email || ''}</p>
        <span className="inline-flex items-center gap-1.5 text-[10px] font-normal px-2.5 py-1 rounded-full mt-3"
          style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--success)' }} />활동 중
        </span>
      </div>

      {/* jp: 정보 */}
      <div className="space-y-2 mb-4">
        <InfoRow Icon={Mail} label="이메일" value={profile?.email || '—'} />
        <InfoRow Icon={Calendar} label="가입일" value={profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString('ko-KR') : '—'} />
      </div>

      {/* jp: 계정 (푸시 알림 토글 제거됨) */}
      <p className="text-[11px] font-normal mb-2 px-1" style={{ color: 'var(--text-tertiary)' }}>계정</p>
      <button onClick={onEditNickname}
        className="w-full flex items-center gap-3 p-3.5 rounded-xl mb-2 active:opacity-70 transition-all"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
        <span className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--accent-bg)' }}>
          <Pencil size={16} style={{ color: 'var(--purple2, #ffffff)' }} />
        </span>
        <span className="text-sm font-normal flex-1 text-left" style={{ color: 'var(--text-primary)' }}>닉네임 변경</span>
        <ChevronRight size={16} style={{ color: 'var(--text-tertiary)' }} />
      </button>
      <button onClick={onEditPassword}
        className="w-full flex items-center gap-3 p-3.5 rounded-xl mb-2 active:opacity-70 transition-all"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
        <span className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--accent-bg)' }}>
          <KeyRound size={16} style={{ color: 'var(--purple2, #ffffff)' }} />
        </span>
        <span className="text-sm font-normal flex-1 text-left" style={{ color: 'var(--text-primary)' }}>비밀번호 변경</span>
        <ChevronRight size={16} style={{ color: 'var(--text-tertiary)' }} />
      </button>

      {/* jp: 로그아웃 */}
      <button onClick={onLogout}
        className="w-full flex items-center justify-center gap-2 p-3.5 rounded-xl mt-2 active:opacity-70 transition-all"
        style={{ background: 'rgba(194,98,14,0.10)', border: '1px solid rgba(194,98,14,0.4)' }}>
        <LogOut size={16} style={{ color: '#c2620e' }} />
        <span className="text-sm font-medium" style={{ color: '#c2620e' }}>로그아웃</span>
      </button>
    </div>
  );
}

function InfoRow({ Icon, label, value }: { Icon: typeof Mail; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-3 rounded-xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
      <Icon size={15} style={{ color: 'var(--text-tertiary)' }} />
      <span className="text-xs font-light w-12" style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      <span className="text-sm font-normal flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

function NicknameMode({ current, onDone, onCancel }: { current: string; onDone: (nn: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    const nn = value.trim();
    if (nn.length < 1 || nn.length > 20) { setError('닉네임은 1~20자로 입력해주세요.'); return; }
    if (nn === current) { onCancel(); return; }
    setBusy(true); setError('');
    try {
      await authService.updateNickname(nn);
      onDone(nn);
    } catch (e) {
      setError(e instanceof Error ? e.message : '변경에 실패했어요.');
    } finally { setBusy(false); }
  };

  return (
    <div>
      <p className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>닉네임 변경</p>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={20}
        placeholder="새 닉네임 (1~20자)"
        className="w-full p-3 rounded-xl text-sm font-normal mb-1 outline-none"
        style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
      />
      <p className="text-[11px] font-light mb-3" style={{ color: 'var(--text-tertiary)' }}>{value.length}/20</p>
      {error && <p className="text-xs font-normal mb-3" style={{ color: 'var(--fall)' }}>{error}</p>}
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 p-3 rounded-xl text-sm font-normal" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>취소</button>
        <button onClick={save} disabled={busy} className="flex-1 p-3 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5"
          style={{ background: '#ffffff', color: '#000000' }}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} 저장
        </button>
      </div>
    </div>
  );
}

function PasswordMode({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const save = async () => {
    const cur = current.trim();
    const nxt = next.trim();
    const cfm = confirm.trim();
    if (!cur || !nxt) { setError('현재 비밀번호와 새 비밀번호를 입력해주세요.'); return; }
    if (nxt.length < 8) { setError('새 비밀번호는 8자 이상이어야 해요.'); return; }
    if (nxt !== cfm) { setError('새 비밀번호가 일치하지 않아요.'); return; }
    setBusy(true); setError('');
    try {
      await authService.changePassword(cur, nxt);
      setDone(true);
      setTimeout(onDone, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : '변경에 실패했어요.');
    } finally { setBusy(false); }
  };

  if (done) {
    return (
      <div className="flex flex-col items-center py-8 gap-3">
        <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: '#ffffff' }}>
          <Check size={28} color="#000000" />
        </div>
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>비밀번호가 변경됐어요</p>
      </div>
    );
  }

  const inputCls = "flex-1 bg-transparent outline-none text-sm font-normal";
  const boxCls = "flex items-center gap-2 w-full p-3 rounded-xl mb-2";
  const boxStyle = { background: 'var(--bg-elevated)', border: '1px solid var(--border)' };

  return (
    <div>
      <p className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>비밀번호 변경</p>
      <div className={boxCls} style={boxStyle}>
        <input type={showPw ? 'text' : 'password'} value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="현재 비밀번호" autoComplete="current-password" autoCapitalize="none" spellCheck={false} className={inputCls} style={{ color: 'var(--text-primary)' }} />
      </div>
      <div className={boxCls} style={boxStyle}>
        <input type={showPw ? 'text' : 'password'} value={next} onChange={(e) => setNext(e.target.value)} placeholder="새 비밀번호 (8자 이상)" autoComplete="new-password" autoCapitalize="none" spellCheck={false} className={inputCls} style={{ color: 'var(--text-primary)' }} />
      </div>
      <div className={boxCls} style={boxStyle}>
        <input type={showPw ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="새 비밀번호 확인" autoComplete="new-password" autoCapitalize="none" spellCheck={false} className={inputCls} style={{ color: 'var(--text-primary)' }} />
        <button type="button" onClick={() => setShowPw(v => !v)} className="p-0.5" aria-label={showPw ? '비밀번호 숨기기' : '비밀번호 보기'}>
          {showPw ? <EyeOff size={18} style={{ color: 'var(--text-tertiary)' }} /> : <Eye size={18} style={{ color: 'var(--text-tertiary)' }} />}
        </button>
      </div>
      {error && <p className="text-xs font-normal mb-3" style={{ color: 'var(--fall)' }}>{error}</p>}
      <div className="flex gap-2 mt-1">
        <button onClick={onCancel} className="flex-1 p-3 rounded-xl text-sm font-normal" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>취소</button>
        <button onClick={save} disabled={busy} className="flex-1 p-3 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5"
          style={{ background: '#ffffff', color: '#000000' }}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} 변경
        </button>
      </div>
    </div>
  );
}
