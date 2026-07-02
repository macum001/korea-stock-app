// jp: 관리자 AI 분석 기록 - 사용자별 집계 + 전체 기록 (뷰 토글)
// jp: 사용자별: 누가 몇 번 분석, 주로 본 종목, 토큰 / 행 펼치면 그 사용자 내역
// jp: 전체 기록: 기존 시간순 목록 + 검색/필터/상세

import { useState, useEffect, useCallback } from 'react';
import { Search, X, ChevronLeft, ChevronRight, RefreshCw, ExternalLink, User, ChevronDown } from 'lucide-react';
import { dataApi, AiHistoryItem, AiUserAggItem, TokenStats, AiHistoryStats } from '@/lib/dataApi';

const KIND_LABEL: Record<string, string> = { receipt: '공시분석', stock: '종목분석' };
const CATEGORY_COLOR: Record<string, string> = {
  capital: '#8b5cf6', good: '#10b981', bad: '#ef4444', important: '#f59e0b', general: '#6b7280',
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

function fmtToken(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString();
}

function userLabel(it: { user_id: string; user_email?: string | null; user_nickname?: string | null }): string {
  if (it.user_id === 'default-user' || (!it.user_email && !it.user_nickname)) return '비회원';
  const nick = it.user_nickname || '';
  const email = it.user_email || '';
  if (nick && email) return `${nick} (${email})`;
  return nick || email || it.user_id;
}

export function AiHistoryPage() {
  const [view, setView] = useState<'user' | 'all'>('user');

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>AI 분석 기록</h1>
        {/* jp: 뷰 토글 */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setView('user')} style={view === 'user' ? tabOn : tabOff}>사용자별</button>
          <button onClick={() => setView('all')} style={view === 'all' ? tabOn : tabOff}>전체 기록</button>
        </div>
      </div>

      {/* jp: 요약 카드 (공통) */}
      <SummaryCards />

      {view === 'user' ? <UserView /> : <AllView />}
    </div>
  );
}

// jp: ===== 상단 요약 카드 =====
function SummaryCards() {
  const [t, setT] = useState<TokenStats | null>(null);
  const [s, setS] = useState<AiHistoryStats | null>(null);
  useEffect(() => {
    dataApi.tokenStats().then(setT).catch(() => setT(null));
    dataApi.aiHistoryStats().then(setS).catch(() => setS(null));
  }, []);

  const avg = s && s.users > 0 ? (s.total / s.users).toFixed(1) : '–';
  const cards = [
    { label: '총 분석', value: s ? s.total.toLocaleString() : '–', hint: s ? `오늘 ${s.today}건` : '누적' },
    { label: '분석한 사용자', value: s ? s.users.toLocaleString() : '–', hint: '전체 중' },
    { label: 'AI 총 토큰', value: t ? fmtToken(t.totalTokens) : '–', hint: t ? `$${t.estimatedCostUsd.toLocaleString()} 누적` : '누적' },
    { label: '인당 평균', value: avg, hint: '건/사용자' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
      {cards.map((c) => (
        <div key={c.label} style={{ background: 'var(--admin-card)', border: '1px solid var(--admin-border)', borderRadius: 12, padding: 14 }}>
          <p style={{ fontSize: 12, color: 'var(--admin-text-sec)', margin: 0 }}>{c.label}</p>
          <p style={{ fontSize: 22, fontWeight: 700, margin: '5px 0 0' }}>{c.value}</p>
          <p style={{ fontSize: 10, color: 'var(--admin-text-ter)', margin: '3px 0 0' }}>{c.hint}</p>
        </div>
      ))}
    </div>
  );
}

// jp: ===== 사용자별 집계 뷰 =====
function UserView() {
  const [items, setItems] = useState<AiUserAggItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [qInput, setQInput] = useState('');
  const [sort, setSort] = useState('count');
  const [openUser, setOpenUser] = useState<string | null>(null);

  const size = 20;
  const totalPages = Math.max(1, Math.ceil(total / size));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await dataApi.listAiByUser({ q, sort, page, size });
      setItems(res.items);
      setTotal(res.total);
    } catch {
      setItems([]); setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [q, sort, page]);

  useEffect(() => { void load(); }, [load]);
  const search = () => { setPage(1); setQ(qInput); };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flex: 1, minWidth: 220, gap: 6 }}>
          <input value={qInput} onChange={(e) => setQInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
            placeholder="사용자 닉네임·이메일 검색"
            style={inputStyle} />
          <button onClick={search} style={btnStyle}><Search size={15} /></button>
        </div>
        <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} style={selectStyle}>
          <option value="count">분석 많은 순</option>
          <option value="tokens">토큰 많은 순</option>
          <option value="recent">최근 분석 순</option>
        </select>
        <button onClick={() => load()} style={btnStyle}><RefreshCw size={15} /></button>
      </div>

      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text-sec)', margin: '0 0 12px' }}>사용자별 분석 현황</p>

      {loading ? (
        <p style={{ padding: 30, textAlign: 'center', color: 'var(--admin-text-ter)' }}>불러오는 중...</p>
      ) : items.length === 0 ? (
        <p style={{ padding: 30, textAlign: 'center', color: 'var(--admin-text-ter)' }}>분석 기록이 없어요</p>
      ) : items.map((u) => (
        <UserRow key={u.user_id} u={u} open={openUser === u.user_id}
          onToggle={() => setOpenUser(openUser === u.user_id ? null : u.user_id)} />
      ))}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16 }}>
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} style={{ ...btnStyle, opacity: page <= 1 ? 0.4 : 1 }}><ChevronLeft size={15} /></button>
        <span style={{ fontSize: 13, color: 'var(--admin-text-sec)' }}>{page} / {totalPages}</span>
        <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ ...btnStyle, opacity: page >= totalPages ? 0.4 : 1 }}><ChevronRight size={15} /></button>
      </div>
    </div>
  );
}

// jp: 사용자 한 행 (펼치면 내역)
function UserRow({ u, open, onToggle }: { u: AiUserAggItem; open: boolean; onToggle: () => void }) {
  const [detail, setDetail] = useState<AiHistoryItem[] | null>(null);
  const [loadingD, setLoadingD] = useState(false);
  const [modal, setModal] = useState<AiHistoryItem | null>(null);

  useEffect(() => {
    if (open && detail === null && !loadingD) {
      setLoadingD(true);
      dataApi.listAiByUserDetail(u.user_id, 20)
        .then((r) => setDetail(r.items))
        .catch(() => setDetail([]))
        .finally(() => setLoadingD(false));
    }
  }, [open, detail, loadingD, u.user_id]);

  const isGuest = u.user_id === 'default-user';
  const name = isGuest ? '비회원' : (u.user_nickname || u.user_email || u.user_id);
  const initial = name.charAt(0);

  return (
    <div style={{ background: 'var(--admin-card)', border: '1px solid var(--admin-border)', borderRadius: 12, marginBottom: 10, overflow: 'hidden' }}>
      <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', cursor: 'pointer' }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: isGuest ? '#3a3a48' : 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: isGuest ? '#9a9aa8' : '#fff', flexShrink: 0 }}>{initial}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</p>
          <p style={{ fontSize: 11, color: 'var(--admin-text-ter)', margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isGuest ? '로그인 안 한 분석 (default-user)' : (u.user_email || u.user_id)}</p>
        </div>

        {/* jp: 통계 - 고정폭 우측정렬 (분석 / 토큰) */}
        <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ width: 78, textAlign: 'center' }}>
            <p style={{ fontSize: 17, fontWeight: 800, margin: 0, lineHeight: 1.1, color: '#a5b4fc' }}>{u.count}</p>
            <p style={{ fontSize: 9.5, color: 'var(--admin-text-ter)', margin: '3px 0 0' }}>분석</p>
          </div>
          <div style={{ width: 78, textAlign: 'center' }}>
            <p style={{ fontSize: 17, fontWeight: 800, margin: 0, lineHeight: 1.1, color: u.tokens > 0 ? 'var(--admin-text)' : 'var(--admin-text-ter)' }}>{fmtToken(u.tokens)}</p>
            <p style={{ fontSize: 9.5, color: 'var(--admin-text-ter)', margin: '3px 0 0' }}>토큰</p>
          </div>
        </div>

        {/* jp: 주로 본 종목 - 고정폭 + 칩, 세로줄로 구분 */}
        <div style={{ width: 210, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 14, borderLeft: '1px solid var(--admin-border)' }}>
          <span style={{ fontSize: 9, color: 'var(--admin-text-ter)' }}>주로 본 종목</span>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {u.topStocks.length > 0
              ? u.topStocks.slice(0, 2).map((s, idx) => (
                  <span key={idx} style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: 'var(--admin-elevated)', color: 'var(--admin-text-sec)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }}>
                    {s.name}<b style={{ color: '#a5b4fc', marginLeft: 3 }}>{s.count}</b>
                  </span>
                ))
              : <span style={{ fontSize: 10, color: 'var(--admin-text-ter)' }}>–</span>}
          </div>
        </div>
        <ChevronDown size={16} style={{ color: 'var(--admin-text-ter)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} />
      </div>

      {open && (
        <div style={{ borderTop: '1px solid var(--admin-border)', background: 'var(--admin-elevated)' }}>
          {loadingD ? (
            <p style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'var(--admin-text-ter)' }}>내역 불러오는 중...</p>
          ) : !detail || detail.length === 0 ? (
            <p style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'var(--admin-text-ter)' }}>내역이 없어요</p>
          ) : detail.map((d) => {
            const cat = d.answer?.analysis?.category || 'general';
            const catLabel = d.answer?.analysis?.categoryLabel;
            return (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px', borderBottom: '1px solid var(--admin-border)' }}>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: d.kind === 'receipt' ? 'rgba(99,102,241,0.18)' : 'rgba(16,185,129,0.16)', color: d.kind === 'receipt' ? '#a5b4fc' : '#34d399', flexShrink: 0 }}>{KIND_LABEL[d.kind] || d.kind}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12.5, fontWeight: 600, margin: 0 }}>{d.stock_name || d.question}</p>
                  <p style={{ fontSize: 11, color: 'var(--admin-text-ter)', margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.question}</p>
                </div>
                {catLabel && <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: `${CATEGORY_COLOR[cat]}22`, color: CATEGORY_COLOR[cat], flexShrink: 0 }}>{catLabel}</span>}
                <span style={{ fontSize: 10.5, color: 'var(--admin-text-ter)', width: 60, textAlign: 'right', flexShrink: 0 }}>{relTime(d.created_at)}</span>
                <button onClick={() => setModal(d)} style={{ fontSize: 11, color: '#a5b4fc', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>상세 ›</button>
              </div>
            );
          })}
        </div>
      )}
      {modal && <DetailModal item={modal} onClose={() => setModal(null)} />}
    </div>
  );
}

// jp: ===== 전체 기록 뷰 (기존) =====
function AllView() {
  const [items, setItems] = useState<AiHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [qInput, setQInput] = useState('');
  const [kind, setKind] = useState('');
  const [detail, setDetail] = useState<AiHistoryItem | null>(null);

  const size = 20;
  const totalPages = Math.max(1, Math.ceil(total / size));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await dataApi.listAiHistory({ q, kind, page, size });
      setItems(res.items);
      setTotal(res.total);
    } catch {
      setItems([]); setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [q, kind, page]);

  useEffect(() => { void load(); }, [load]);
  const search = () => { setPage(1); setQ(qInput); };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flex: 1, minWidth: 220, gap: 6 }}>
          <input value={qInput} onChange={(e) => setQInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
            placeholder="질문, 종목명, 접수번호, 사용자 검색" style={inputStyle} />
          <button onClick={search} style={btnStyle}><Search size={15} /></button>
        </div>
        <select value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }} style={selectStyle}>
          <option value="">전체 종류</option>
          <option value="receipt">공시분석</option>
          <option value="stock">종목분석</option>
        </select>
        <button onClick={() => load()} style={btnStyle}><RefreshCw size={15} /></button>
      </div>

      <div style={{ background: 'var(--admin-card)', border: '1px solid var(--admin-border)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--admin-elevated)', textAlign: 'left' }}>
              <th style={thStyle}>사용자</th><th style={thStyle}>종류</th><th style={thStyle}>질문 / 종목</th>
              <th style={thStyle}>AI 요약</th><th style={thStyle}>시간</th><th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ padding: 30, textAlign: 'center', color: 'var(--admin-text-ter)' }}>불러오는 중...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 30, textAlign: 'center', color: 'var(--admin-text-ter)' }}>분석 기록이 없어요</td></tr>
            ) : items.map((it) => (
              <tr key={it.id} style={{ borderTop: '1px solid var(--admin-border)' }}>
                <td style={tdStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <User size={13} style={{ color: 'var(--admin-text-ter)' }} />
                    <div>
                      <div style={{ fontSize: 12 }}>{it.user_nickname || '비회원'}</div>
                      {it.user_email && <div style={{ fontSize: 10, color: 'var(--admin-text-ter)' }}>{it.user_email}</div>}
                    </div>
                  </div>
                </td>
                <td style={tdStyle}><span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: 'var(--admin-elevated)', color: 'var(--admin-text-sec)' }}>{KIND_LABEL[it.kind] || it.kind}</span></td>
                <td style={{ ...tdStyle, maxWidth: 200 }}>
                  <div style={{ fontWeight: 600 }}>{it.stock_name || it.question}</div>
                  {it.receipt_no && <div style={{ fontSize: 11, color: 'var(--admin-text-ter)', fontFamily: 'monospace' }}>{it.receipt_no}</div>}
                </td>
                <td style={{ ...tdStyle, maxWidth: 260 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--admin-text-sec)', fontSize: 12 }}>{it.answer?.analysis?.summary || '-'}</div>
                </td>
                <td style={{ ...tdStyle, fontSize: 12, color: 'var(--admin-text-sec)' }}>{relTime(it.created_at)}</td>
                <td style={tdStyle}><button onClick={() => setDetail(it)} style={{ ...btnStyle, padding: '5px 8px', fontSize: 12 }}>상세</button></td>
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

      {detail && <DetailModal item={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

// jp: ===== 상세 모달 (공통) =====
function DetailModal({ item, onClose }: { item: AiHistoryItem; onClose: () => void }) {
  const a = item.answer?.analysis;
  const cat = a?.category || 'general';
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--admin-card)', border: '1px solid var(--admin-border)', borderRadius: 16, padding: 24, maxWidth: 560, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>{item.answer?.stockName || item.stock_name || item.question}</h2>
            <p style={{ fontSize: 13, color: 'var(--admin-text-sec)', margin: '4px 0 0' }}>{item.answer?.reportName || KIND_LABEL[item.kind]}</p>
          </div>
          <button onClick={onClose} style={btnStyle}><X size={16} /></button>
        </div>
        <Field label="사용자" value={userLabel(item)} />
        <Field label="종류" value={KIND_LABEL[item.kind] || item.kind} />
        {item.receipt_no && <Field label="접수번호" value={item.receipt_no} mono />}
        <Field label="질문" value={item.question} />
        <Field label="분석 시각" value={new Date(item.created_at).toLocaleString('ko-KR')} />
        {a && (
          <div style={{ marginTop: 14, padding: 14, background: 'var(--admin-elevated)', borderRadius: 10 }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {a.categoryLabel && <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: `${CATEGORY_COLOR[cat]}22`, color: CATEGORY_COLOR[cat] }}>{a.categoryLabel}</span>}
              {a.impactLabel && <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: 'var(--admin-card)', color: 'var(--admin-text-sec)' }}>{a.impactLabel}</span>}
            </div>
            {a.summary && <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 8px', lineHeight: 1.6 }}>{a.summary}</p>}
            {a.detail && <p style={{ fontSize: 13, margin: '0 0 8px', lineHeight: 1.7, color: 'var(--admin-text-sec)' }}>{a.detail}</p>}
            {a.reason && <p style={{ fontSize: 12, margin: '8px 0 0', lineHeight: 1.6, color: 'var(--admin-text-sec)' }}>💡 {a.reason}</p>}
            {a.risks && a.risks.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {a.risks.map((r, i) => (<p key={i} style={{ fontSize: 12, margin: '4px 0 0', lineHeight: 1.5, color: '#f59e0b' }}>⚠ {r}</p>))}
              </div>
            )}
          </div>
        )}
        {item.answer?.originalUrl && (
          <a href={item.answer.originalUrl} target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16, padding: 11, borderRadius: 10, background: 'var(--admin-accent)', color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
            <ExternalLink size={15} /> DART 원문 보기
          </a>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--admin-border)' }}>
      <span style={{ fontSize: 12, color: 'var(--admin-text-ter)', width: 80, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, fontFamily: mono ? 'monospace' : 'inherit', wordBreak: 'break-all' }}>{value}</span>
    </div>
  );
}

const tabOn: React.CSSProperties = { fontSize: 12.5, fontWeight: 600, padding: '7px 15px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--admin-accent)', color: '#fff' };
const tabOff: React.CSSProperties = { fontSize: 12.5, fontWeight: 600, padding: '7px 15px', borderRadius: 8, border: '1px solid var(--admin-border)', cursor: 'pointer', background: 'var(--admin-elevated)', color: 'var(--admin-text-sec)' };
const thStyle: React.CSSProperties = { padding: '10px 12px', fontSize: 12, fontWeight: 600, color: 'var(--admin-text-sec)' };
const tdStyle: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'middle' };
const btnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--admin-border)', background: 'var(--admin-elevated)', color: 'var(--admin-text)', fontSize: 13, cursor: 'pointer' };
const inputStyle: React.CSSProperties = { flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--admin-border)', background: 'var(--admin-elevated)', color: 'var(--admin-text)', fontSize: 13, outline: 'none' };
const selectStyle: React.CSSProperties = { padding: '9px 12px', borderRadius: 8, border: '1px solid var(--admin-border)', background: 'var(--admin-elevated)', color: 'var(--admin-text)', fontSize: 13, cursor: 'pointer' };
