// jp: 관리자 공시 관리 - 목록/검색/필터/페이지/상세 + AI 토큰 사용량

import { useState, useEffect, useCallback } from 'react';
import { Search, ExternalLink, X, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { dataApi, DisclosureListItem, TokenStats } from '@/lib/dataApi';

const CATEGORY_LABEL: Record<string, string> = {
  capital: '자본조달', good: '호재', bad: '악재', important: '중요', general: '일반',
};
const CATEGORY_COLOR: Record<string, string> = {
  capital: '#8b5cf6', good: '#10b981', bad: '#ef4444', important: '#f59e0b', general: '#6b7280',
};
const AI_STATUS_LABEL: Record<string, string> = {
  completed: '완료', pending: '대기', failed: '실패', processing: '처리중',
};

// jp: 토큰 숫자 읽기 좋게
function fmtToken(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString();
}

// jp: AI 토큰 사용량 카드 섹션
function TokenStatsSection() {
  const [t, setT] = useState<TokenStats | null>(null);
  useEffect(() => {
    dataApi.tokenStats().then(setT).catch(() => setT(null));
  }, []);

  const cards = [
    { label: '총 토큰 (누적)', value: t ? fmtToken(t.totalTokens) : '–', hint: t ? `공시 ${fmtToken(t.disclosure.totalTokens)} + 브리핑 ${fmtToken(t.briefing.totalTokens)} + 종목 ${fmtToken(t.stock.totalTokens)}` : '전체' },
    { label: '오늘 토큰', value: t ? fmtToken(t.todayTokens) : '–', hint: t ? `공시 ${t.disclosure.todayCount}건 + 브리핑 ${t.briefing.todayCount}건` : '오늘' },
    { label: '예상 비용 (공시)', value: t ? `$${t.estimatedCostUsd.toLocaleString()}` : '–', hint: '누적 (Claude 단가)' },
    { label: '공시 분석', value: t ? t.disclosure.totalCount.toLocaleString() : '–', hint: t ? `오늘 ${t.disclosure.todayCount}건` : '토큰 기록' },
    { label: '브리핑 생성', value: t ? t.briefing.totalCount.toLocaleString() : '–', hint: t ? `오늘 ${t.briefing.todayCount}건` : '토큰 기록' },
    { label: '종목 분석', value: t ? t.stock.totalCount.toLocaleString() : '–', hint: t ? `오늘 ${t.stock.todayCount}건 · ${fmtToken(t.stock.totalTokens)}` : '토큰 기록' },
  ];

  return (
    <div style={{ marginBottom: 20 }}>
      <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 10px' }}>AI 토큰 사용량</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {cards.map((c) => (
          <div key={c.label} style={{ background: 'var(--admin-card)', border: '1px solid var(--admin-border)', borderRadius: 12, padding: 14 }}>
            <p style={{ fontSize: 12, color: 'var(--admin-text-sec)', margin: 0 }}>{c.label}</p>
            <p style={{ fontSize: 22, fontWeight: 700, margin: '5px 0 0' }}>{c.value}</p>
            <p style={{ fontSize: 10, color: 'var(--admin-text-ter)', margin: '3px 0 0' }}>{c.hint}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DisclosuresPage() {
  const [items, setItems] = useState<DisclosureListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [qInput, setQInput] = useState('');
  const [category, setCategory] = useState('');
  const [aiStatus, setAiStatus] = useState('');
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);

  const size = 20;
  const totalPages = Math.max(1, Math.ceil(total / size));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await dataApi.listDisclosures({ q, category, aiStatus, page, size });
      setItems(res.items);
      setTotal(res.total);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [q, category, aiStatus, page]);

  useEffect(() => { void load(); }, [load]);

  const search = () => { setPage(1); setQ(qInput); };

  const openDetail = async (receiptNo: string) => {
    try {
      const d = await dataApi.getDisclosure(receiptNo);
      setDetail(d);
    } catch { /* noop */ }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>공시 관리</h1>
        <span style={{ fontSize: 13, color: 'var(--admin-text-sec)' }}>총 {total.toLocaleString()}건</span>
      </div>

      {/* jp: AI 토큰 사용량 */}
      <TokenStatsSection />

      {/* jp: 검색 + 필터 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flex: 1, minWidth: 220, gap: 6 }}>
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
            placeholder="종목명, 공시명, 종목코드, 접수번호 검색"
            style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--admin-border)', background: 'var(--admin-elevated)', color: 'var(--admin-text)', fontSize: 13, outline: 'none' }}
          />
          <button onClick={search} style={btnStyle}><Search size={15} /></button>
        </div>
        <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} style={selectStyle}>
          <option value="">전체 분류</option>
          <option value="capital">자본조달</option>
          <option value="good">호재</option>
          <option value="bad">악재</option>
          <option value="important">중요</option>
          <option value="general">일반</option>
        </select>
        <select value={aiStatus} onChange={(e) => { setAiStatus(e.target.value); setPage(1); }} style={selectStyle}>
          <option value="">전체 AI상태</option>
          <option value="completed">완료</option>
          <option value="pending">대기</option>
          <option value="failed">실패</option>
        </select>
        <button onClick={() => load()} style={btnStyle}><RefreshCw size={15} /></button>
      </div>

      {/* jp: 테이블 */}
      <div style={{ background: 'var(--admin-card)', border: '1px solid var(--admin-border)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--admin-elevated)', textAlign: 'left' }}>
              <th style={thStyle}>종목</th>
              <th style={thStyle}>공시명</th>
              <th style={thStyle}>분류</th>
              <th style={thStyle}>AI</th>
              <th style={thStyle}>공시일</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ padding: 30, textAlign: 'center', color: 'var(--admin-text-ter)' }}>불러오는 중...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 30, textAlign: 'center', color: 'var(--admin-text-ter)' }}>결과가 없어요</td></tr>
            ) : items.map((it) => (
              <tr key={it.receipt_no} style={{ borderTop: '1px solid var(--admin-border)' }}>
                <td style={tdStyle}>
                  <div style={{ fontWeight: 600 }}>{it.stock_name || '-'}</div>
                  <div style={{ fontSize: 11, color: 'var(--admin-text-ter)' }}>{it.stock_code || ''}</div>
                </td>
                <td style={{ ...tdStyle, maxWidth: 280 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.report_name}</div>
                </td>
                <td style={tdStyle}>
                  {it.category && (
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: `${CATEGORY_COLOR[it.category] || '#6b7280'}22`, color: CATEGORY_COLOR[it.category] || '#9aa0ac' }}>
                      {CATEGORY_LABEL[it.category] || it.category}
                    </span>
                  )}
                </td>
                <td style={tdStyle}>
                  <span style={{ fontSize: 11, color: it.ai_status === 'completed' ? 'var(--admin-success)' : 'var(--admin-text-ter)' }}>
                    {AI_STATUS_LABEL[it.ai_status || ''] || it.ai_status || '-'}
                  </span>
                </td>
                <td style={{ ...tdStyle, fontSize: 12, color: 'var(--admin-text-sec)' }}>
                  {new Date(it.disclosed_at).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
                </td>
                <td style={tdStyle}>
                  <button onClick={() => openDetail(it.receipt_no)} style={{ ...btnStyle, padding: '5px 8px', fontSize: 12 }}>상세</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* jp: 페이지 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16 }}>
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} style={{ ...btnStyle, opacity: page <= 1 ? 0.4 : 1 }}><ChevronLeft size={15} /></button>
        <span style={{ fontSize: 13, color: 'var(--admin-text-sec)' }}>{page} / {totalPages}</span>
        <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ ...btnStyle, opacity: page >= totalPages ? 0.4 : 1 }}><ChevronRight size={15} /></button>
      </div>

      {/* jp: 상세 모달 */}
      {detail && <DetailModal detail={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function DetailModal({ detail, onClose }: { detail: Record<string, unknown>; onClose: () => void }) {
  const s = (k: string) => (detail[k] != null ? String(detail[k]) : '-');
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--admin-card)', border: '1px solid var(--admin-border)', borderRadius: 16, padding: 24, maxWidth: 560, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>{s('stock_name')} <span style={{ fontSize: 13, color: 'var(--admin-text-ter)' }}>{s('stock_code')}</span></h2>
            <p style={{ fontSize: 13, color: 'var(--admin-text-sec)', margin: '4px 0 0' }}>{s('report_name')}</p>
          </div>
          <button onClick={onClose} style={btnStyle}><X size={16} /></button>
        </div>

        <Field label="접수번호" value={s('receipt_no')} mono />
        <Field label="공시유형" value={s('disclosure_type')} />
        <Field label="분류" value={`${CATEGORY_LABEL[s('category')] || s('category')} (${s('importance')} / ${s('sentiment')})`} />
        <Field label="AI 상태" value={`${AI_STATUS_LABEL[s('ai_status')] || s('ai_status')} ${detail['ai_model'] ? '· ' + s('ai_model') : ''}`} />

        {detail['ai_summary'] && (
          <div style={{ marginTop: 14, padding: 14, background: 'var(--admin-elevated)', borderRadius: 10 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--admin-text-sec)', margin: '0 0 6px' }}>AI 요약</p>
            <p style={{ fontSize: 13, margin: 0, lineHeight: 1.6 }}>{s('ai_summary')}</p>
            {detail['ai_investor_note'] && <p style={{ fontSize: 12, color: 'var(--admin-text-sec)', margin: '8px 0 0', lineHeight: 1.6 }}>💡 {s('ai_investor_note')}</p>}
            {detail['ai_risk_note'] && <p style={{ fontSize: 12, color: '#f59e0b', margin: '6px 0 0', lineHeight: 1.6 }}>⚠ {s('ai_risk_note')}</p>}
          </div>
        )}

        {detail['original_url'] && (
          <a href={s('original_url')} target="_blank" rel="noopener noreferrer"
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
      <span style={{ fontSize: 13, fontFamily: mono ? 'monospace' : 'inherit' }}>{value}</span>
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: '10px 12px', fontSize: 12, fontWeight: 600, color: 'var(--admin-text-sec)' };
const tdStyle: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'middle' };
const btnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--admin-border)', background: 'var(--admin-elevated)', color: 'var(--admin-text)', fontSize: 13, cursor: 'pointer' };
const selectStyle: React.CSSProperties = { padding: '9px 12px', borderRadius: 8, border: '1px solid var(--admin-border)', background: 'var(--admin-elevated)', color: 'var(--admin-text)', fontSize: 13, cursor: 'pointer', outline: 'none' };
