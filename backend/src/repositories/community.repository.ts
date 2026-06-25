// jp: 커뮤니티 저장소 - 종목별 게시글/댓글/좋아요
// jp: 원문 본문은 content에 저장, 작성자 닉네임은 스냅샷

import { query, isDbReady } from '../config/db';

export interface CommunityPost {
  id: string;
  stockCode: string;
  userId: string;
  nickname: string;
  content: string;
  likeCount: number;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
  likedByMe?: boolean; // jp: 현재 사용자가 좋아요 눌렀는지 (optionalAuth)
}

export interface CommunityComment {
  id: string;
  postId: string;
  userId: string;
  nickname: string;
  content: string;
  createdAt: string;
}

interface PostRow {
  id: string; stock_code: string; user_id: string; nickname: string;
  content: string; like_count: number; comment_count: number;
  created_at: string; updated_at: string; liked_by_me?: boolean;
}

function rowToPost(r: PostRow): CommunityPost {
  return {
    id: r.id, stockCode: r.stock_code, userId: r.user_id, nickname: r.nickname,
    content: r.content, likeCount: r.like_count, commentCount: r.comment_count,
    createdAt: r.created_at, updatedAt: r.updated_at,
    likedByMe: r.liked_by_me ?? false,
  };
}

// jp: 종목 게시글 목록 (최신순, 페이징). viewerId 있으면 좋아요 여부 포함
export async function getPostsByStock(
  stockCode: string, limit = 20, offset = 0, viewerId?: string
): Promise<CommunityPost[]> {
  if (!isDbReady()) return [];
  const rows = await query<PostRow>(
    `SELECT p.*,
            ${viewerId ? 'EXISTS(SELECT 1 FROM community_likes l WHERE l.post_id = p.id AND l.user_id = $4)' : 'FALSE'} AS liked_by_me
       FROM community_posts p
      WHERE p.stock_code = $1
      ORDER BY p.created_at DESC
      LIMIT $2 OFFSET $3`,
    viewerId ? [stockCode, limit, offset, viewerId] : [stockCode, limit, offset]
  );
  return rows.map(rowToPost);
}

// jp: 게시글 단건
export async function getPostById(id: string, viewerId?: string): Promise<CommunityPost | null> {
  if (!isDbReady()) return null;
  const rows = await query<PostRow>(
    `SELECT p.*,
            ${viewerId ? 'EXISTS(SELECT 1 FROM community_likes l WHERE l.post_id = p.id AND l.user_id = $2)' : 'FALSE'} AS liked_by_me
       FROM community_posts p WHERE p.id = $1`,
    viewerId ? [id, viewerId] : [id]
  );
  return rows.length > 0 ? rowToPost(rows[0]) : null;
}

// jp: 게시글 작성
export async function createPost(
  stockCode: string, userId: string, nickname: string, content: string
): Promise<CommunityPost> {
  const rows = await query<PostRow>(
    `INSERT INTO community_posts (stock_code, user_id, nickname, content)
     VALUES ($1, $2, $3, $4) RETURNING *, FALSE AS liked_by_me`,
    [stockCode, userId, nickname, content]
  );
  return rowToPost(rows[0]);
}

// jp: 게시글 수정 (본인만 - userId 일치 조건). 수정되면 row 반환, 권한 없으면 null
export async function updatePost(id: string, userId: string, content: string): Promise<CommunityPost | null> {
  const rows = await query<PostRow>(
    `UPDATE community_posts SET content = $3, updated_at = NOW()
      WHERE id = $1 AND user_id = $2 RETURNING *, FALSE AS liked_by_me`,
    [id, userId, content]
  );
  return rows.length > 0 ? rowToPost(rows[0]) : null;
}

// jp: 게시글 삭제 (본인만). 삭제 성공 true
export async function deletePost(id: string, userId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `DELETE FROM community_posts WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId]
  );
  return rows.length > 0;
}

// jp: 좋아요 토글. 반환: { liked, likeCount }
export async function toggleLike(postId: string, userId: string): Promise<{ liked: boolean; likeCount: number }> {
  // jp: 이미 눌렀으면 취소, 아니면 추가
  const existing = await query<{ post_id: string }>(
    `SELECT post_id FROM community_likes WHERE post_id = $1 AND user_id = $2`,
    [postId, userId]
  );
  let liked: boolean;
  if (existing.length > 0) {
    await query(`DELETE FROM community_likes WHERE post_id = $1 AND user_id = $2`, [postId, userId]);
    await query(`UPDATE community_posts SET like_count = GREATEST(0, like_count - 1) WHERE id = $1`, [postId]);
    liked = false;
  } else {
    await query(`INSERT INTO community_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [postId, userId]);
    await query(`UPDATE community_posts SET like_count = like_count + 1 WHERE id = $1`, [postId]);
    liked = true;
  }
  const cnt = await query<{ like_count: number }>(`SELECT like_count FROM community_posts WHERE id = $1`, [postId]);
  return { liked, likeCount: cnt[0]?.like_count ?? 0 };
}

// jp: 댓글 목록 (오래된순)
export async function getComments(postId: string): Promise<CommunityComment[]> {
  if (!isDbReady()) return [];
  const rows = await query<{
    id: string; post_id: string; user_id: string; nickname: string; content: string; created_at: string;
  }>(
    `SELECT * FROM community_comments WHERE post_id = $1 ORDER BY created_at ASC`,
    [postId]
  );
  return rows.map(r => ({
    id: r.id, postId: r.post_id, userId: r.user_id, nickname: r.nickname,
    content: r.content, createdAt: r.created_at,
  }));
}

// jp: 댓글 작성 + 게시글 댓글수 증가
export async function createComment(
  postId: string, userId: string, nickname: string, content: string
): Promise<CommunityComment> {
  const rows = await query<{
    id: string; post_id: string; user_id: string; nickname: string; content: string; created_at: string;
  }>(
    `INSERT INTO community_comments (post_id, user_id, nickname, content)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [postId, userId, nickname, content]
  );
  await query(`UPDATE community_posts SET comment_count = comment_count + 1 WHERE id = $1`, [postId]);
  return {
    id: rows[0].id, postId: rows[0].post_id, userId: rows[0].user_id,
    nickname: rows[0].nickname, content: rows[0].content, createdAt: rows[0].created_at,
  };
}

// jp: 댓글 삭제 (본인만) + 게시글 댓글수 감소
export async function deleteComment(id: string, userId: string): Promise<boolean> {
  const rows = await query<{ post_id: string }>(
    `DELETE FROM community_comments WHERE id = $1 AND user_id = $2 RETURNING post_id`,
    [id, userId]
  );
  if (rows.length > 0) {
    await query(`UPDATE community_posts SET comment_count = GREATEST(0, comment_count - 1) WHERE id = $1`, [rows[0].post_id]);
    return true;
  }
  return false;
}
