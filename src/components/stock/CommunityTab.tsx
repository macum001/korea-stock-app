// jp: 종목별 커뮤니티 탭 - 글 작성/조회/수정/삭제 + 댓글 + 좋아요
// jp: 로그인 사용자만 작성, 비회원은 읽기 전용

import { useState, useEffect, useCallback } from 'react';
import { Heart, MessageCircle, Trash2, Pencil, Send, X } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import * as community from '@/services/communityService';
import type { CommunityPost, CommunityComment } from '@/services/communityService';

interface CommunityTabProps {
  stockCode: string;
}

export function CommunityTab({ stockCode }: CommunityTabProps) {
  const { user, isAuthenticated } = useAuthStore();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const PAGE = 20;
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async (reset = false) => {
    try {
      const nextOffset = reset ? 0 : offset;
      const data = await community.getPosts(stockCode, PAGE, nextOffset);
      setPosts(prev => reset ? data : [...prev, ...data]);
      setHasMore(data.length === PAGE);
      setOffset(nextOffset + data.length);
    } catch {
      setError('게시글을 불러오지 못했어요.');
    } finally {
      setLoading(false);
    }
  }, [stockCode, offset]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setOffset(0);
    community.getPosts(stockCode, PAGE, 0)
      .then(data => { setPosts(data); setHasMore(data.length === PAGE); setOffset(data.length); })
      .catch(() => setError('게시글을 불러오지 못했어요.'))
      .finally(() => setLoading(false));
  }, [stockCode]);

  async function handleSubmit() {
    const content = draft.trim();
    if (!content || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const post = await community.createPost(stockCode, content);
      setPosts(prev => [post, ...prev]);
      setDraft('');
    } catch {
      setError('글 작성에 실패했어요. 다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="px-4 pt-4 pb-6">
      {/* jp: 작성 폼 - 로그인 시에만 */}
      {isAuthenticated ? (
        <div className="mb-4 p-3 rounded-2xl" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="이 종목에 대한 생각을 나눠보세요"
            maxLength={2000}
            rows={3}
            className="w-full text-sm bg-transparent outline-none resize-none"
            style={{ color: 'var(--text-primary)' }}
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{draft.length}/2000</span>
            <button
              onClick={handleSubmit}
              disabled={!draft.trim() || submitting}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-40"
              style={{ background: 'var(--accent)', color: '#000' }}
            >
              <Send size={13} /> 등록
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-4 p-3 rounded-2xl text-center text-xs" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-tertiary)' }}>
          로그인하면 글을 작성할 수 있어요.
        </div>
      )}

      {error && <p className="text-xs mb-3" style={{ color: 'var(--fall)' }}>{error}</p>}

      {/* jp: 게시글 목록 */}
      {loading ? (
        <p className="text-xs text-center py-8" style={{ color: 'var(--text-tertiary)' }}>불러오는 중…</p>
      ) : posts.length === 0 ? (
        <p className="text-xs text-center py-8" style={{ color: 'var(--text-tertiary)' }}>
          아직 글이 없어요. 첫 글을 남겨보세요!
        </p>
      ) : (
        <div className="space-y-3">
          {posts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              myUserId={user?.id}
              onUpdate={(updated) => setPosts(prev => prev.map(p => p.id === updated.id ? updated : p))}
              onDelete={(id) => setPosts(prev => prev.filter(p => p.id !== id))}
            />
          ))}
          {hasMore && (
            <button
              onClick={() => load(false)}
              className="w-full py-2.5 text-sm font-semibold active:opacity-70"
              style={{ color: 'var(--accent)' }}
            >
              더보기
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// jp: 게시글 카드 - 좋아요/댓글/수정/삭제
function PostCard({ post, myUserId, onUpdate, onDelete }: {
  post: CommunityPost;
  myUserId?: string;
  onUpdate: (p: CommunityPost) => void;
  onDelete: (id: string) => void;
}) {
  const isMine = myUserId === post.userId;
  const { isAuthenticated } = useAuthStore();
  const [liked, setLiked] = useState(post.likedByMe);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(post.content);
  const [showComments, setShowComments] = useState(false);

  async function handleLike() {
    if (!isAuthenticated) return;
    // jp: 낙관적 업데이트
    const prevLiked = liked, prevCount = likeCount;
    setLiked(!liked);
    setLikeCount(c => c + (liked ? -1 : 1));
    try {
      const res = await community.toggleLike(post.id);
      setLiked(res.liked);
      setLikeCount(res.likeCount);
    } catch {
      setLiked(prevLiked); setLikeCount(prevCount);
    }
  }

  async function handleSaveEdit() {
    const content = editDraft.trim();
    if (!content) return;
    try {
      const updated = await community.updatePost(post.id, content);
      onUpdate(updated);
      setEditing(false);
    } catch { /* 무시 */ }
  }

  async function handleDelete() {
    if (!confirm('이 글을 삭제할까요?')) return;
    try {
      await community.deletePost(post.id);
      onDelete(post.id);
    } catch { /* 무시 */ }
  }

  return (
    <div className="p-4 rounded-2xl" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black"
            style={{ background: 'var(--bg-elevated)', color: 'var(--accent)' }}>
            {post.nickname[0]}
          </div>
          <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{post.nickname}</span>
          <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
            {community.formatRelativeTime(post.createdAt)}
            {post.updatedAt !== post.createdAt && ' (수정됨)'}
          </span>
        </div>
        {isMine && !editing && (
          <div className="flex items-center gap-1">
            <button onClick={() => { setEditing(true); setEditDraft(post.content); }} className="p-1 active:opacity-60">
              <Pencil size={13} style={{ color: 'var(--text-tertiary)' }} />
            </button>
            <button onClick={handleDelete} className="p-1 active:opacity-60">
              <Trash2 size={13} style={{ color: 'var(--fall)' }} />
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <div>
          <textarea
            value={editDraft}
            onChange={e => setEditDraft(e.target.value)}
            maxLength={2000}
            rows={3}
            className="w-full text-sm bg-transparent outline-none resize-none rounded-lg p-2"
            style={{ color: 'var(--text-primary)', border: '1px solid var(--border)' }}
          />
          <div className="flex items-center gap-2 mt-2 justify-end">
            <button onClick={() => setEditing(false)} className="flex items-center gap-1 text-xs px-2 py-1" style={{ color: 'var(--text-tertiary)' }}>
              <X size={12} /> 취소
            </button>
            <button onClick={handleSaveEdit} className="text-xs px-3 py-1 rounded-lg font-bold" style={{ background: 'var(--accent)', color: '#000' }}>
              저장
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm whitespace-pre-wrap break-words" style={{ color: 'var(--text-primary)' }}>{post.content}</p>
      )}

      {/* jp: 좋아요 / 댓글 버튼 */}
      <div className="flex items-center gap-4 mt-3">
        <button onClick={handleLike} className="flex items-center gap-1 active:opacity-60" disabled={!isAuthenticated}>
          <Heart size={15} fill={liked ? 'var(--fall)' : 'none'} style={{ color: liked ? 'var(--fall)' : 'var(--text-tertiary)' }} />
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{likeCount}</span>
        </button>
        <button onClick={() => setShowComments(s => !s)} className="flex items-center gap-1 active:opacity-60">
          <MessageCircle size={15} style={{ color: 'var(--text-tertiary)' }} />
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{post.commentCount}</span>
        </button>
      </div>

      {showComments && <CommentList postId={post.id} myUserId={myUserId} />}
    </div>
  );
}

// jp: 댓글 목록 + 작성
function CommentList({ postId, myUserId }: { postId: string; myUserId?: string }) {
  const { isAuthenticated } = useAuthStore();
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    community.getComments(postId)
      .then(setComments)
      .catch(() => { /* 무시 */ })
      .finally(() => setLoading(false));
  }, [postId]);

  async function handleSubmit() {
    const content = draft.trim();
    if (!content || submitting) return;
    setSubmitting(true);
    try {
      const c = await community.createComment(postId, content);
      setComments(prev => [...prev, c]);
      setDraft('');
    } catch { /* 무시 */ } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await community.deleteComment(id);
      setComments(prev => prev.filter(c => c.id !== id));
    } catch { /* 무시 */ }
  }

  return (
    <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
      {loading ? (
        <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>댓글 불러오는 중…</p>
      ) : (
        <div className="space-y-2 mb-2">
          {comments.map(c => (
            <div key={c.id} className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>{c.nickname}</span>
                  <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{community.formatRelativeTime(c.createdAt)}</span>
                </div>
                <p className="text-xs whitespace-pre-wrap break-words" style={{ color: 'var(--text-primary)' }}>{c.content}</p>
              </div>
              {myUserId === c.userId && (
                <button onClick={() => handleDelete(c.id)} className="p-0.5 active:opacity-60">
                  <Trash2 size={11} style={{ color: 'var(--fall)' }} />
                </button>
              )}
            </div>
          ))}
          {comments.length === 0 && (
            <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>첫 댓글을 남겨보세요.</p>
          )}
        </div>
      )}

      {isAuthenticated && (
        <div className="flex items-center gap-2 mt-2">
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
            placeholder="댓글 달기"
            maxLength={2000}
            className="flex-1 text-xs px-2.5 py-1.5 rounded-lg bg-transparent outline-none"
            style={{ color: 'var(--text-primary)', border: '1px solid var(--border)' }}
          />
          <button onClick={handleSubmit} disabled={!draft.trim() || submitting} className="p-1.5 active:opacity-60 disabled:opacity-40">
            <Send size={14} style={{ color: 'var(--accent)' }} />
          </button>
        </div>
      )}
    </div>
  );
}
