// jp: 어드민 사용자 관리 - 목록/검색/통계 (조회 전용, 알림 발송은 알림 관리로 이동)

import { useState, useEffect, useCallback } from 'react';
import { Search, ChevronLeft, ChevronRight, RefreshCw, User, Mail, Sparkles } from 'lucide-react';
import { usersApi, AdminUser, UsersStats } from '@/lib/usersApi';

function relTime(iso: string | null): string {
  if (!iso) return '—';
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

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' });
}

export function UsersPage() {
  const [items, setItems] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [qInput, setQInput] = useState('');
  const [stats, setStats] = useState<UsersStats | null>(null);

  const size = 20;
  const totalPages = Math.max(1, Math.ceil(total / size));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await usersApi.list({ q, page, size });
      setItems(res.items); setTotal(res.total);
    } catch { setItems([]); setTotal(0); }
    finally { setLoading(false); }
  }, [q, page]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { usersApi.stats().then(setStats).catch(() => setStats(null)); }, []);

  const search = () => { setPage(1); setQ(qInput); };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>사용자 관리</h1>
        <span style={{ fontSize: 13, color: 'var(--admin-text-sec)' }}>총 {total.toLocaleString()}명</span>
      </div>

      {/* jp: 통계 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
        <StatCard label="전체 가입자" value={stats ? stats.total.toLocaleString() : '…'} />
        <StatCard label="오늘 가입" value={stats ? stats.today.toLocaleString() : '…'} />
        <StatCard label="활성 사용자" value={stats ? stats.active7d.toLocaleString() : '…'} hint="최근 7일 로그인" />
      </div>

      {/* jp: 검색 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flex: 1, minWidth: 220, gap: 6 }}>
          <input value={qInput} onChange={(e) => setQInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
            placeholder="이메일, 닉네임 검색"
            style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--admin-border)', background: 'var(--admin-elevated)', color: 'var(--admin-text)', fontSize: 13, outline: 'none' }} />
          <button onClick={search} style={btnStyle}><Search size={15} /></button>
        </div>
        <button onClick={() => load()} style={btnStyle}><RefreshCw size={15} /></button>
      </div>

      {/* jp: 테이블 */}
      <div style={{ background: 'var(--admin-card)', border: '1px solid var(--admin-border)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--admin-elevated)', textAlign: 'left' }}>
              <th style={thStyle}>닉네임</th>
              <th style={thStyle}>이메일</th>
              <th style={thStyle}>AI 분석</th>
              <th style={thStyle}>가입일</th>
              <th style={thStyle}>마지막 로그인</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding: 30, textAlign: 'center', color: 'var(--admin-text-ter)' }}>불러오는 중...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--admin-text-ter)' }}>사용자가 없어요.</td></tr>
            ) : items.map((u) => (
              <tr key={u.id} style={{ borderTop: '1px solid var(--admin-border)' }}>
                <td style={tdStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--admin-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <User size={14} style={{ color: 'var(--admin-accent)' }} />
                    </div>
                    <span style={{ fontWeight: 600 }}>{u.nickname}</span>
                    {(u as { provider?: string }).provider === 'naver' && (
                      <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#03C75A', color: '#fff' }}>N 네이버</span>
                    )}
                    {(u as { provider?: string }).provider === 'kakao' && (
                      <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#FEE500', color: '#000' }}>카카오</span>
                    )}
                    {(u as { provider?: string }).provider === 'google' && (
                      <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#fff', color: '#3c4043', border: '1px solid #dadce0' }}>G 구글</span>
                    )}
                    {(!(u as { provider?: string }).provider || (u as { provider?: string }).provider === 'email') && (
                      <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: 'var(--admin-elevated)', color: 'var(--admin-text-ter)' }}>이메일</span>
                    )}
                  </div>
                </td>
                <td style={tdStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--admin-text-sec)' }}>
                    <Mail size={12} style={{ color: 'var(--admin-text-ter)' }} />
                    <span style={{ fontSize: 12 }}>{u.email}</span>
                  </div>
                </td>
                <td style={tdStyle}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: 'var(--admin-elevated)', color: u.ai_count > 0 ? 'var(--admin-accent)' : 'var(--admin-text-ter)' }}>
                    <Sparkles size={11} /> {u.ai_count}
                  </span>
                </td>
                <td style={{ ...tdStyle, fontSize: 12, color: 'var(--admin-text-sec)' }}>{fmtDate(u.created_at)}</td>
                <td style={{ ...tdStyle, fontSize: 12, color: 'var(--admin-text-sec)' }}>{relTime(u.last_login_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* jp: 페이지네이션 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16 }}>
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} style={{ ...btnStyle, opacity: page <= 1 ? 0.4 : 1 }}><ChevronLeft size={15} /></button>
        <span style={{ fontSize: 13, color: 'var(--admin-text-sec)' }}>{page} / {totalPages}</span>
        <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ ...btnStyle, opacity: page >= totalPages ? 0.4 : 1 }}><ChevronRight size={15} /></button>
      </div>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{ background: 'var(--admin-card)', border: '1px solid var(--admin-border)', borderRadius: 12, padding: 16 }}>
      <p style={{ fontSize: 12, color: 'var(--admin-text-sec)', margin: 0 }}>{label}</p>
      <p style={{ fontSize: 24, fontWeight: 700, margin: '6px 0 0' }}>{value}</p>
      {hint && <p style={{ fontSize: 11, color: 'var(--admin-text-ter)', margin: '4px 0 0' }}>{hint}</p>}
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: '10px 12px', fontSize: 12, fontWeight: 600, color: 'var(--admin-text-sec)' };
const tdStyle: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'middle' };
const btnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--admin-border)', background: 'var(--admin-elevated)', color: 'var(--admin-text)', fontSize: 13, cursor: 'pointer' };
