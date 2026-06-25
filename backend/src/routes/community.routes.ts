// jp: 커뮤니티 API 라우트 - 종목별 게시판
// jp: 읽기는 비회원 허용(optionalAuth), 쓰기/수정/삭제/좋아요/댓글은 로그인 필수(requireAuth)

import { Router, Response } from 'express';
import { ApiResponse } from '../types';
import { isDbReady } from '../config/db';
import { requireAuth, optionalAuth, AuthedRequest } from '../middleware/requireAuth';
import * as community from '../repositories/community.repository';
import { getNicknameById } from '../repositories/user.repository';

const router = Router();

function requireDb(res: Response): boolean {
  if (!isDbReady()) {
    res.status(503).json({ success: false, error: 'DB 미연결' } as ApiResponse);
    return false;
  }
  return true;
}

// jp: 본문 길이 제한 (스팸/과대 입력 방지)
const MAX_CONTENT = 2000;

function validContent(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_CONTENT) return null;
  return trimmed;
}

// ============ 게시글 ============

// jp: 종목 게시글 목록 (비회원 읽기 가능). ?limit&offset 페이징
router.get('/stock/:stockCode/posts', optionalAuth, async (req: AuthedRequest, res: Response) => {
  if (!requireDb(res)) return;
  const { stockCode } = req.params;
  const limit = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 50);
  const offset = parseInt(String(req.query.offset ?? '0'), 10) || 0;
  try {
    const posts = await community.getPostsByStock(stockCode, limit, offset, req.userId);
    res.json({ success: true, data: posts } as ApiResponse);
  } catch {
    res.status(500).json({ success: false, error: '게시글 조회 실패' } as ApiResponse);
  }
});

// jp: 게시글 작성 (로그인 필수)
router.post('/stock/:stockCode/posts', requireAuth, async (req: AuthedRequest, res: Response) => {
  if (!requireDb(res)) return;
  const { stockCode } = req.params;
  const content = validContent(req.body?.content);
  if (!content) {
    res.status(400).json({ success: false, error: '내용을 입력해주세요 (최대 2000자).' } as ApiResponse);
    return;
  }
  try {
    const nickname = (await getNicknameById(req.userId!)) ?? '익명';
    const post = await community.createPost(stockCode, req.userId!, nickname, content);
    res.status(201).json({ success: true, data: post } as ApiResponse);
  } catch {
    res.status(500).json({ success: false, error: '게시글 작성 실패' } as ApiResponse);
  }
});

// jp: 게시글 수정 (본인만)
router.patch('/posts/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
  if (!requireDb(res)) return;
  const content = validContent(req.body?.content);
  if (!content) {
    res.status(400).json({ success: false, error: '내용을 입력해주세요 (최대 2000자).' } as ApiResponse);
    return;
  }
  try {
    const updated = await community.updatePost(req.params.id, req.userId!, content);
    if (!updated) {
      res.status(403).json({ success: false, error: '본인 글만 수정할 수 있어요.' } as ApiResponse);
      return;
    }
    res.json({ success: true, data: updated } as ApiResponse);
  } catch {
    res.status(500).json({ success: false, error: '게시글 수정 실패' } as ApiResponse);
  }
});

// jp: 게시글 삭제 (본인만)
router.delete('/posts/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
  if (!requireDb(res)) return;
  try {
    const ok = await community.deletePost(req.params.id, req.userId!);
    if (!ok) {
      res.status(403).json({ success: false, error: '본인 글만 삭제할 수 있어요.' } as ApiResponse);
      return;
    }
    res.json({ success: true, data: { deleted: true } } as ApiResponse);
  } catch {
    res.status(500).json({ success: false, error: '게시글 삭제 실패' } as ApiResponse);
  }
});

// jp: 좋아요 토글 (로그인 필수)
router.post('/posts/:id/like', requireAuth, async (req: AuthedRequest, res: Response) => {
  if (!requireDb(res)) return;
  try {
    const result = await community.toggleLike(req.params.id, req.userId!);
    res.json({ success: true, data: result } as ApiResponse);
  } catch {
    res.status(500).json({ success: false, error: '좋아요 처리 실패' } as ApiResponse);
  }
});

// ============ 댓글 ============

// jp: 댓글 목록 (비회원 읽기 가능)
router.get('/posts/:id/comments', async (req, res: Response) => {
  if (!requireDb(res)) return;
  try {
    const comments = await community.getComments(req.params.id);
    res.json({ success: true, data: comments } as ApiResponse);
  } catch {
    res.status(500).json({ success: false, error: '댓글 조회 실패' } as ApiResponse);
  }
});

// jp: 댓글 작성 (로그인 필수)
router.post('/posts/:id/comments', requireAuth, async (req: AuthedRequest, res: Response) => {
  if (!requireDb(res)) return;
  const content = validContent(req.body?.content);
  if (!content) {
    res.status(400).json({ success: false, error: '댓글 내용을 입력해주세요.' } as ApiResponse);
    return;
  }
  try {
    const nickname = (await getNicknameById(req.userId!)) ?? '익명';
    const comment = await community.createComment(req.params.id, req.userId!, nickname, content);
    res.status(201).json({ success: true, data: comment } as ApiResponse);
  } catch {
    res.status(500).json({ success: false, error: '댓글 작성 실패' } as ApiResponse);
  }
});

// jp: 댓글 삭제 (본인만)
router.delete('/comments/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
  if (!requireDb(res)) return;
  try {
    const ok = await community.deleteComment(req.params.id, req.userId!);
    if (!ok) {
      res.status(403).json({ success: false, error: '본인 댓글만 삭제할 수 있어요.' } as ApiResponse);
      return;
    }
    res.json({ success: true, data: { deleted: true } } as ApiResponse);
  } catch {
    res.status(500).json({ success: false, error: '댓글 삭제 실패' } as ApiResponse);
  }
});

export default router;
