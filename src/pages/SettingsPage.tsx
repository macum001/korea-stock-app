// jp: ???ㅼ젙 ?섏씠吏
// jp: Row/Toggle/Section 紐⑤몢 ?뚯씪 理쒖긽???낅┰ 而댄룷?뚰듃 ??SettingsPage 由щ젋?????ъ깮??諛⑹?
// jp: NicknameForm/PasswordForm???낅┰ 而댄룷?뚰듃 + 紐낆떆??key濡?unmount 諛⑹?
import { useState, useCallback } from 'react';
import { Moon, Sun, User, LogOut, Info, ChevronRight, Check, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useThemeStore } from '@/store/themeStore';
import { useAuthStore } from '@/store/authStore';
import { PushNotificationToggle } from '@/components/common/PushNotificationToggle';
import * as authService from '@/services/authService';

// =====================================================================
// jp: 怨듯넻 UI ???뚯씪 理쒖긽???낅┰ ?좎뼵 (SettingsPage ?대? X)
// =====================================================================

interface ToggleProps { on: boolean }
function ToggleUI({ on }: ToggleProps) {
  return (
    <span className="relative inline-block w-[42px] h-[24px] rounded-full transition-all"
      style={{ background: 'var(--border)', flexShrink: 0 }}>
      <span className="absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white transition-all"
        style={{ left: on ? '21px' : '3px' }} />
    </span>
  );
}

interface RowProps {
  icon: React.ReactNode;
  label: string;
  right?: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  noBorder?: boolean;
}
function SettingRow({ icon, label, right, onClick, danger = false, noBorder = false }: RowProps) {
  return (
    <button
      className="w-full flex items-center gap-3 px-4 py-[14px] text-left active:opacity-70"
      style={{
        background: 'var(--bg-elevated)',
        borderBottom: noBorder ? 'none' : '1px solid var(--border-subtle)',
        color: danger ? '#e8893f' : 'var(--text-primary)',
        cursor: onClick ? 'pointer' : 'default',
        width: '100%',
      }}
      onClick={onClick}
    >
      <span style={{ color: danger ? '#e8893f' : 'var(--text-tertiary)', flexShrink: 0 }}>{icon}</span>
      <span className="flex-1 text-[14px]">{label}</span>
      {right}
    </button>
  );
}

interface SectionProps { title: string; children: React.ReactNode }
function SettingSection({ title, children }: SectionProps) {
  return (
    <div className="mb-5">
      <p className="text-[11px] px-4 pb-1.5 pt-1" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.4px' }}>{title}</p>
      <div className="mx-4 overflow-hidden rounded-[14px]" style={{ border: '1px solid var(--border-subtle)' }}>
        {children}
      </div>
    </div>
  );
}

const inputBase: React.CSSProperties = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box',
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '13px 16px',
  fontSize: 14,
  outline: 'none',
  fontFamily: 'inherit',
  WebkitAppearance: 'none',
};

// =====================================================================
// jp: ?됰꽕??蹂寃???// =====================================================================
interface NicknameFormProps {
  currentNickname: string;
  onCancel: () => void;
  onSuccess: (n: string) => void;
}
function NicknameForm({ currentNickname, onCancel, onSuccess }: NicknameFormProps) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const ok = value.trim().length > 0;

  const submit = async () => {
    if (!ok || busy) return;
    setBusy(true);
    try {
      await authService.updateNickname(value.trim());
      setMsg('?됰꽕?꾩씠 蹂寃쎈릱?댁슂!');
      setTimeout(() => onSuccess(value.trim()), 1200);
    } catch {
      setMsg('蹂寃쎌뿉 ?ㅽ뙣?덉뼱??');
    } finally { setBusy(false); }
  };

  return (
    <div style={{ padding: '12px 16px', background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-subtle)' }}>
      <input
        style={inputBase}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={currentNickname || '???됰꽕???낅젰'}
        autoFocus
        onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
      />
      {msg && <p style={{ fontSize: 11, marginTop: 6, color: msg.includes('?먯뼱') ? 'var(--success)' : 'var(--fall)' }}>{msg}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={onCancel}
          style={{ flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 700, background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: 'none', cursor: 'pointer' }}>
          痍⑥냼
        </button>
        <button onClick={submit} disabled={!ok || busy}
          style={{ flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 700, background: '#ffffff', color: '#000000', border: 'none', opacity: !ok || busy ? 0.5 : 1, cursor: !ok || busy ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          {busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />}
          蹂寃?        </button>
      </div>
    </div>
  );
}

// =====================================================================
// jp: 鍮꾨?踰덊샇 蹂寃???// =====================================================================
interface PasswordFormProps {
  onCancel: () => void;
  onSuccess: () => void;
}
function PasswordForm({ onCancel, onSuccess }: PasswordFormProps) {
  const [cur, setCur] = useState('');
  const [nxt, setNxt] = useState('');
  const [showCur, setShowCur] = useState(false);
  const [showNxt, setShowNxt] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [isErr, setIsErr] = useState(false);
  const ok = cur.length > 0 && nxt.length > 0;

  const submit = async () => {
    if (!ok || busy) return;
    if (nxt.length < 6) { setMsg('??鍮꾨?踰덊샇??6???댁긽?댁뼱???댁슂.'); setIsErr(true); return; }
    setBusy(true); setMsg(''); setIsErr(false);
    try {
      await authService.changePassword(cur, nxt);
      setMsg('鍮꾨?踰덊샇媛 蹂寃쎈릱?댁슂!');
      setTimeout(() => onSuccess(), 1200);
    } catch {
      setMsg('?꾩옱 鍮꾨?踰덊샇媛 ??멸굅???ㅻ쪟媛 諛쒖깮?덉뼱??');
      setIsErr(true);
    } finally { setBusy(false); }
  };

  return (
    <div style={{ padding: '12px 16px', background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ position: 'relative', marginBottom: 8 }}>
        <input
          style={{ ...inputBase, paddingRight: 44 }}
          value={cur}
          onChange={(e) => setCur(e.target.value)}
          placeholder="?꾩옱 鍮꾨?踰덊샇"
          type={showCur ? 'text' : 'password'}
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
        />
        <button type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setShowCur((v) => !v)}
          style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', padding: 4 }}>
          {showCur ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      <div style={{ position: 'relative' }}>
        <input
          style={{ ...inputBase, paddingRight: 44 }}
          value={nxt}
          onChange={(e) => setNxt(e.target.value)}
          placeholder="??鍮꾨?踰덊샇 (6???댁긽)"
          type={showNxt ? 'text' : 'password'}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
        />
        <button type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setShowNxt((v) => !v)}
          style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', padding: 4 }}>
          {showNxt ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {msg && <p style={{ fontSize: 11, marginTop: 6, color: isErr ? 'var(--fall)' : 'var(--success)' }}>{msg}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={onCancel}
          style={{ flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 700, background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: 'none', cursor: 'pointer' }}>
          痍⑥냼
        </button>
        <button onClick={submit} disabled={!ok || busy}
          style={{ flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 700, background: '#ffffff', color: '#000000', border: 'none', opacity: !ok || busy ? 0.5 : 1, cursor: !ok || busy ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          {busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />}
          蹂寃?        </button>
      </div>
    </div>
  );
}

// =====================================================================
// jp: 硫붿씤 ?ㅼ젙 ?섏씠吏
// =====================================================================
export function SettingsPage() {
  const { mode, toggleTheme } = useThemeStore();
  const isDark = mode === 'dark';
  const { user, isAuthenticated, logout, setNickname } = useAuthStore();
  const [showNickname, setShowNickname] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleNicknameSuccess = useCallback((n: string) => {
    setNickname(n);
    setShowNickname(false);
  }, [setNickname]);

  const handlePasswordSuccess = useCallback(() => {
    setShowPassword(false);
  }, []);

  return (
    <div style={{ minHeight: 'calc(100dvh - 60px - env(safe-area-inset-bottom))', background: 'var(--bg-primary)', paddingTop: 20 }}>

      <SettingSection title="?붾㈃">
        <SettingRow
          icon={isDark ? <Moon size={18} /> : <Sun size={18} />}
          label="?ㅽ겕 紐⑤뱶"
          right={<ToggleUI on={isDark} />}
          onClick={toggleTheme}
          noBorder
        />
      </SettingSection>

      <div className="mb-5">
        <p className="text-[11px] px-4 pb-1.5 pt-1" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.4px' }}>?뚮┝</p>
        <div className="mx-4"><PushNotificationToggle /></div>
      </div>

      {isAuthenticated ? (
        <SettingSection title="怨꾩젙">
          <div style={{ padding: '12px 16px', background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-subtle)' }}>
            <p style={{ fontSize: 13, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>{user?.nickname || '?됰꽕???놁쓬'}</p>
            <p style={{ fontSize: 11, margin: '4px 0 0', color: 'var(--text-tertiary)' }}>{user?.email}</p>
          </div>

          <SettingRow
            icon={<User size={18} />}
            label="?됰꽕??蹂寃?
            right={<ChevronRight size={15} style={{ color: 'var(--text-tertiary)', transform: showNickname ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />}
            onClick={() => setShowNickname((v) => !v)}
          />
          {/* jp: key 怨좎젙 ??showNickname ?좉? ??unmount/remount 諛⑹? */}
          {showNickname && (
            <NicknameForm
              key="nickname-form"
              currentNickname={user?.nickname || ''}
              onCancel={() => setShowNickname(false)}
              onSuccess={handleNicknameSuccess}
            />
          )}

          <SettingRow
            icon={<Eye size={18} />}
            label="鍮꾨?踰덊샇 蹂寃?
            right={<ChevronRight size={15} style={{ color: 'var(--text-tertiary)', transform: showPassword ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />}
            onClick={() => setShowPassword((v) => !v)}
          />
          {showPassword && (
            <PasswordForm
              key="password-form"
              onCancel={() => setShowPassword(false)}
              onSuccess={handlePasswordSuccess}
            />
          )}

          <SettingRow icon={<LogOut size={18} />} label="濡쒓렇?꾩썐" onClick={logout} danger noBorder />
        </SettingSection>
      ) : (
        <SettingSection title="怨꾩젙">
          <SettingRow
            icon={<User size={18} />}
            label="濡쒓렇?몄씠 ?꾩슂?댁슂"
            right={<ChevronRight size={15} style={{ color: 'var(--text-tertiary)' }} />}
            noBorder
          />
        </SettingSection>
      )}

      <SettingSection title="???뺣낫">
        <SettingRow
          icon={<Info size={18} />}
          label="踰꾩쟾"
          right={<span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>v1.0.0</span>}
          noBorder
        />
      </SettingSection>

      <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-tertiary)', paddingBottom: 24, marginTop: 8 }}>
        korea-stock-app 쨌 AI 湲곕컲 怨듭떆 遺꾩꽍 ?쒕퉬??      </p>

      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
