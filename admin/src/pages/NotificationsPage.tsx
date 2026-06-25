// jp: 어드민 알림 관리 - 발송(전체/개별) + 발송된 알림 목록/검색/삭제
import { useState, useEffect, useCallback } from 'react';
import { Search, ChevronLeft, ChevronRight, RefreshCw, Trash2, User, Megaphone, Bell, X, Send, Loader2, Check } from 'lucide-react';
import { dataApi, NotificationItem } from '@/lib/dataApi';
import { usersApi, AdminUser } from '@/lib/usersApi';

// jp: 알림 타입 라벨 (백엔드 type 값에 맞춰 표시)
const TYPE_LABEL: Record<string, string> = {
  disclosure: '공시', price: '가격', capital: '자본조달', good: '호재', bad: '악재', important: '중요', general: '일반', system: '소식',
};

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}일 전`;
  return new Date(iso).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' });
}

export function NotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [qInput, setQInput] = useState('');
  const [showSend, setShowSend] = useState(false);

  const size = 20;
  const totalPages = Math.max(1, Math.ceil(total / size));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await dataApi.listNotifications({ q, page, size });
      setItems(res.items); setTotal(res.total);
    } catch { setItems([]); setTotal(0); }
    finally { setLoading(false); }
  }, [q, page]);

  useEffect(() => { void load(); }, [load]);

  const search = () => { setPage(1); setQ(qInput); };

  const handleDelete = async (id: string) => {
    if (!window.confirm('이 알림을 삭제할까요?')) return;
    const prev = items;
    setItems((l) => l.filter((i) => i.id !== id));
    try { await dataApi.deleteNotification(id); } catch { setItems(prev); }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>알림 관리</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--admin-text-sec)' }}>총 {total.toLocaleString()}건</span>
          <button onClick={() => setShowSend(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 8, border: 'none', background: 'var(--admin-accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <Send size={15} /> 알림 보내기
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flex: 1, minWidth: 220, gap: 6 }}>
          <input value={qInput} onChange={(e) => setQInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
            placeholder="제목, 내용, 종목코드, 사용자 검색"
            style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--admin-border)', background: 'var(--admin-elevated)', color: 'var(--admin-text)', fontSize: 13, outline: 'none' }} />
          <button onClick={search} style={btnStyle}><Search size={15} /></button>
        </div>
        <button onClick={() => load()} style={btnStyle}><RefreshCw size={15} /></button>
      </div>

      <div style={{ background: 'var(--admin-card)', border: '1px solid var(--admin-border)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--admin-elevated)', textAlign: 'left' }}>
              <th style={thStyle}>사용자</th>
              <th style={thStyle}>유형</th>
              <th style={thStyle}>제목 / 내용</th>
              <th style={thStyle}>읽음</th>
              <th style={thStyle}>시간</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ padding: 30, textAlign: 'center', color: 'var(--admin-text-ter)' }}>불러오는 중...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'var(--admin-text-ter)' }}>알림이 없어요.</td></tr>
            ) : items.map((it) => (
              <tr key={it.id} style={{ borderTop: '1px solid var(--admin-border)' }}>
                <td style={tdStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <User size={13} style={{ color: 'var(--admin-text-ter)' }} />
                    <span style={{ fontSize: 12 }}>{it.user_id}</span>
                  </div>
                </td>
                <td style={tdStyle}>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: 'var(--admin-elevated)', color: 'var(--admin-text-sec)' }}>
                    {TYPE_LABEL[it.type] || it.type}
                  </span>
                  {it.stock_code && <span style={{ fontSize: 11, color: 'var(--admin-text-ter)', marginLeft: 6, fontFamily: 'monospace' }}>{it.stock_code}</span>}
                </td>
                <td style={{ ...tdStyle, maxWidth: 320 }}>
                  <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</div>
                  {it.body && <div style={{ fontSize: 11, color: 'var(--admin-text-ter)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.body}</div>}
                </td>
                <td style={tdStyle}>
                  <span style={{ fontSize: 11, color: it.is_read ? 'var(--admin-text-ter)' : 'var(--admin-accent)' }}>
                    {it.is_read ? '읽음' : '안읽음'}
                  </span>
                </td>
                <td style={{ ...tdStyle, fontSize: 12, color: 'var(--admin-text-sec)' }}>{relTime(it.created_at)}</td>
                <td style={tdStyle}>
                  <button onClick={() => handleDelete(it.id)} style={{ ...btnStyle, padding: '5px 8px', color: 'var(--admin-danger)', borderColor: 'var(--admin-danger)' }}><Trash2 size={13} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16 }}>
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} style={{ ...btnStyle, opacity: page <= 1 ? 0.4 : 1 }}><ChevronLeft size={15} /></button>
        <span style={{ fontSize: 13, color: 'var(--admin-text-sec)' }}>{page} / {totalPages}</span>
        <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ ...btnStyle, opacity: page >= totalPages ? 0.4 : 1 }}><ChevronRight size={15} /></button>
      </div>

      {showSend && <SendModal onClose={() => setShowSend(false)} onSent={() => { setShowSend(false); load(); }} />}
    </div>
  );
}

// jp: ===== 알림 발송 모달 (전체 / 개별) =====
function SendModal({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const [mode, setMode] = useState<'all' | 'user'>('all');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ sentTo: number; pushCount: number } | null>(null);

  // jp: 개별 발송용 사용자 검색/선택
  const [userQ, setUserQ] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [searching, setSearching] = useState(false);

  // jp: 개별 모드일 때 사용자 목록 로드
  useEffect(() => {
    if (mode !== 'user') return;
    setSearching(true);
    usersApi.list({ q: userQ, page: 1, size: 10 })
      .then((res) => setUsers(res.items))
      .catch(() => setUsers([]))
      .finally(() => setSearching(false));
  }, [mode, userQ]);

  const send = async () => {
    const t = title.trim();
    if (!t) { setError('제목을 입력해주세요.'); return; }
    if (mode === 'user' && !selected) { setError('받을 사용자를 선택해주세요.'); return; }
    setBusy(true); setError('');
    try {
      const res = mode === 'all'
        ? await usersApi.sendNotification({ target: 'all', title: t, body: body.trim() })
        : await usersApi.sendNotification({ target: 'user', userId: selected!.id, title: t, body: body.trim() });
      setDone(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : '발송에 실패했어요.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 480, maxHeight: '88vh', overflowY: 'auto', background: 'var(--admin-card)', border: '1px solid var(--admin-border)', borderRadius: 16, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>알림 보내기</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} style={{ color: 'var(--admin-text-sec)' }} /></button>
        </div>

        {done ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--admin-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <Check size={28} color="#fff" />
            </div>
            <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 6px' }}>알림을 보냈어요</p>
            <p style={{ fontSize: 13, color: 'var(--admin-text-sec)', margin: 0, textAlign: 'center' }}>
              {done.sentTo.toLocaleString()}명에게 알림 저장 완료<br />
              {done.pushCount > 0 ? `${done.pushCount.toLocaleString()}건 푸시 발송됨` : '푸시 받을 기기는 없었어요'}
            </p>
            <button onClick={onSent} style={{ marginTop: 18, padding: '9px 24px', borderRadius: 8, border: 'none', background: 'var(--admin-accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>닫기</button>
          </div>
        ) : (
          <>
            {/* jp: 대상 선택 토글 */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button onClick={() => { setMode('all'); setSelected(null); }}
                style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', borderRadius: 9, border: mode === 'all' ? 'none' : '1px solid var(--admin-border)', background: mode === 'all' ? 'var(--admin-accent)' : 'var(--admin-elevated)', color: mode === 'all' ? '#fff' : 'var(--admin-text-sec)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                <Megaphone size={15} /> 전체 발송
              </button>
              <button onClick={() => setMode('user')}
                style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', borderRadius: 9, border: mode === 'user' ? 'none' : '1px solid var(--admin-border)', background: mode === 'user' ? 'var(--admin-accent)' : 'var(--admin-elevated)', color: mode === 'user' ? '#fff' : 'var(--admin-text-sec)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                <Bell size={15} /> 개별 발송
              </button>
            </div>

            {/* jp: 개별 발송 - 사용자 검색/선택 */}
            {mode === 'user' && (
              <div style={{ marginBottom: 16 }}>
                {selected ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--admin-elevated)', borderRadius: 10 }}>
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{selected.nickname}</span>
                      <span style={{ fontSize: 12, color: 'var(--admin-text-ter)', marginLeft: 8 }}>{selected.email}</span>
                    </div>
                    <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--admin-text-sec)', fontSize: 12 }}>변경</button>
                  </div>
                ) : (
                  <>
                    <input value={userQ} onChange={(e) => setUserQ(e.target.value)} placeholder="사용자 이메일/닉네임 검색"
                      style={inputStyle} />
                    <div style={{ marginTop: 8, maxHeight: 160, overflowY: 'auto', border: '1px solid var(--admin-border)', borderRadius: 9 }}>
                      {searching ? (
                        <p style={{ padding: 14, fontSize: 12, color: 'var(--admin-text-ter)', textAlign: 'center', margin: 0 }}>검색 중...</p>
                      ) : users.length === 0 ? (
                        <p style={{ padding: 14, fontSize: 12, color: 'var(--admin-text-ter)', textAlign: 'center', margin: 0 }}>사용자가 없어요.</p>
                      ) : users.map((u) => (
                        <button key={u.id} onClick={() => setSelected(u)}
                          style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%', padding: '9px 12px', background: 'none', border: 'none', borderBottom: '1px solid var(--admin-border)', cursor: 'pointer', textAlign: 'left' }}>
                          <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--admin-text)' }}>{u.nickname}</span>
                          <span style={{ fontSize: 11, color: 'var(--admin-text-ter)' }}>{u.email}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* jp: 대상 안내 */}
            <div style={{ padding: '10px 14px', background: 'var(--admin-elevated)', borderRadius: 10, marginBottom: 16, fontSize: 13, color: 'var(--admin-text-sec)' }}>
              {mode === 'all'
                ? <>받는 사람: <strong style={{ color: 'var(--admin-text)' }}>전체 사용자</strong></>
                : selected
                  ? <>받는 사람: <strong style={{ color: 'var(--admin-text)' }}>{selected.nickname}</strong></>
                  : <>받는 사람: <strong style={{ color: 'var(--admin-text)' }}>(사용자 선택 필요)</strong></>}
            </div>

            <label style={labelStyle}>제목</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="알림 제목" style={inputStyle} />

            <label style={{ ...labelStyle, marginTop: 14 }}>내용</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="알림 내용 (선택)" style={{ ...inputStyle, resize: 'vertical', minHeight: 80, fontFamily: 'inherit' }} />

            {error && <p style={{ fontSize: 12, color: 'var(--admin-danger)', margin: '10px 0 0' }}>{error}</p>}
            {mode === 'all' && <p style={{ fontSize: 12, color: 'var(--admin-text-ter)', margin: '12px 0 0' }}>⚠️ 모든 사용자에게 발송됩니다.</p>}

            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button onClick={onClose} style={{ flex: 1, padding: '11px', borderRadius: 9, border: '1px solid var(--admin-border)', background: 'var(--admin-elevated)', color: 'var(--admin-text-sec)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>취소</button>
              <button onClick={send} disabled={busy || !title.trim() || (mode === 'user' && !selected)}
                style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px', borderRadius: 9, border: 'none', background: 'var(--admin-accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: busy ? 'default' : 'pointer', opacity: (!title.trim() || (mode === 'user' && !selected)) ? 0.5 : 1 }}>
                {busy ? <Loader2 size={15} className="spin" /> : <Send size={15} />} 발송
              </button>
            </div>
            <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </>
        )}
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: '10px 12px', fontSize: 12, fontWeight: 600, color: 'var(--admin-text-sec)' };
const tdStyle: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'middle' };
const btnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--admin-border)', background: 'var(--admin-elevated)', color: 'var(--admin-text)', fontSize: 13, cursor: 'pointer' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--admin-text-sec)', marginBottom: 6 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--admin-border)', background: 'var(--admin-elevated)', color: 'var(--admin-text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' };
