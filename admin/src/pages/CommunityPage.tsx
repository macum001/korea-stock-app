// jp: 어드민 커뮤니티 관리 - 글 목록/검색/상세/삭제 + 댓글 조회/삭제
// jp: 종목코드 + 종목명 둘 다 표시 (stock_master 조인)

import { useState, useEffect, useCallback } from 'react';
import { Search, X, ChevronLeft, ChevronRight, RefreshCw, Trash2, Heart, MessageSquare, User } from 'lucide-react';
import { dataApi, CommunityPost, CommunityComment } from '@/lib/dataApi';

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

// jp: 종목 표시 (종목명 + 종목코드). 종목명 없으면 코드만
function StockLabel({ code, name }: { code: string; name?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {name ? <span style={{ fontSize: 13, fontWeight: 600 }}>{name}</span> : null}
      <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--admin-text-ter)' }}>{code}</span>
    </div>
  );
}

export function CommunityPage() {
  const [items, setItems] = useState<CommunityPost[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [qInput, setQInput] = useState('');
  const [detail, setDetail] = useState<CommunityPost | null>(null);

  const size = 20;
  const totalPages = Math.max(1, Math.ceil(total / size));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await dataApi.listPosts({ q, page, size });
      setItems(res.items); setTotal(res.total);
    } catch {
      setItems([]); setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [q, page]);

  useEffect(() => { void load(); }, [load]);

  const search = () => { setPage(1); setQ(qInput); };

  const handleDelete = async (id: string) => {
    if (!window.confirm('이 글을 삭제할까요? 댓글도 함께 삭제됩니다.')) return;
    const prev = items;
    setItems((l) => l.filter((i) => i.id !== id));
    try { await dataApi.deletePost(id); } catch { setItems(prev); }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>커뮤니티 관리</h1>
        <span style={{ fontSize: 13, color: 'var(--admin-text-sec)' }}>총 {total.toLocaleString()}건</span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flex: 1, minWidth: 220, gap: 6 }}>
          <input value={qInput} onChange={(e) => setQInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
            placeholder="내용, 닉네임, 종목코드, 사용자 검색"
            style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--admin-border)', background: 'var(--admin-elevated)', color: 'var(--admin-text)', fontSize: 13, outline: 'none' }} />
          <button onClick={search} style={btnStyle}><Search size={15} /></button>
        </div>
        <button onClick={() => load()} style={btnStyle}><RefreshCw size={15} /></button>
      </div>

      <div style={{ background: 'var(--admin-card)', border: '1px solid var(--admin-border)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--admin-elevated)', textAlign: 'left' }}>
              <th style={thStyle}>작성자</th>
              <th style={thStyle}>종목</th>
              <th style={thStyle}>내용</th>
              <th style={thStyle}>반응</th>
              <th style={thStyle}>시간</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ padding: 30, textAlign: 'center', color: 'var(--admin-text-ter)' }}>불러오는 중...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'var(--admin-text-ter)' }}>
                아직 게시글이 없어요.
              </td></tr>
            ) : items.map((it) => (
              <tr key={it.id} style={{ borderTop: '1px solid var(--admin-border)' }}>
                <td style={tdStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <User size={13} style={{ color: 'var(--admin-text-ter)' }} />
                    <span>{it.nickname}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--admin-text-ter)' }}>{it.user_id}</div>
                </td>
                <td style={tdStyle}><StockLabel code={it.stock_code} name={it.stock_name} /></td>
                <td style={{ ...tdStyle, maxWidth: 320 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.content}</div>
                </td>
                <td style={tdStyle}>
                  <div style={{ display: 'flex', gap: 10, fontSize: 12, color: 'var(--admin-text-sec)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Heart size={12} /> {it.like_count}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><MessageSquare size={12} /> {it.comment_count}</span>
                  </div>
                </td>
                <td style={{ ...tdStyle, fontSize: 12, color: 'var(--admin-text-sec)' }}>{relTime(it.created_at)}</td>
                <td style={tdStyle}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => setDetail(it)} style={{ ...btnStyle, padding: '5px 8px', fontSize: 12 }}>댓글</button>
                    <button onClick={() => handleDelete(it.id)} style={{ ...btnStyle, padding: '5px 8px', color: 'var(--admin-danger)', borderColor: 'var(--admin-danger)' }}><Trash2 size={13} /></button>
                  </div>
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

      {detail && <CommentsModal post={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function CommentsModal({ post, onClose }: { post: CommunityPost; onClose: () => void }) {
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setComments(await dataApi.getComments(post.id)); }
    catch { setComments([]); }
    finally { setLoading(false); }
  }, [post.id]);

  useEffect(() => { void load(); }, [load]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('이 댓글을 삭제할까요?')) return;
    const prev = comments;
    setComments((l) => l.filter((c) => c.id !== id));
    try { await dataApi.deleteComment(id); } catch { setComments(prev); }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--admin-card)', border: '1px solid var(--admin-border)', borderRadius: 16, padding: 24, maxWidth: 560, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontWeight: 600 }}>{post.nickname}</span>
              {post.stock_name && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--admin-text-sec)' }}>{post.stock_name}</span>}
              <span style={{ fontSize: 12, color: 'var(--admin-text-ter)', fontFamily: 'monospace' }}>{post.stock_code}</span>
            </div>
            <p style={{ fontSize: 13, margin: 0, lineHeight: 1.6, color: 'var(--admin-text-sec)' }}>{post.content}</p>
          </div>
          <button onClick={onClose} style={btnStyle}><X size={16} /></button>
        </div>

        <div style={{ borderTop: '1px solid var(--admin-border)', paddingTop: 14 }}>
          <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 12px' }}>댓글 {comments.length}개</p>
          {loading ? (
            <p style={{ fontSize: 13, color: 'var(--admin-text-ter)', textAlign: 'center', padding: 16 }}>불러오는 중...</p>
          ) : comments.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--admin-text-ter)', textAlign: 'center', padding: 16 }}>댓글이 없어요.</p>
          ) : comments.map((c) => (
            <div key={c.id} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--admin-border)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{c.nickname}</span>
                  <span style={{ fontSize: 11, color: 'var(--admin-text-ter)' }}>{relTime(c.created_at)}</span>
                </div>
                <p style={{ fontSize: 13, margin: 0, lineHeight: 1.5, color: 'var(--admin-text-sec)' }}>{c.content}</p>
              </div>
              <button onClick={() => handleDelete(c.id)} style={{ ...btnStyle, padding: '4px 7px', color: 'var(--admin-danger)', borderColor: 'var(--admin-danger)', flexShrink: 0, alignSelf: 'flex-start' }}><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: '10px 12px', fontSize: 12, fontWeight: 600, color: 'var(--admin-text-sec)' };
const tdStyle: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'middle' };
const btnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--admin-border)', background: 'var(--admin-elevated)', color: 'var(--admin-text)', fontSize: 13, cursor: 'pointer' };
