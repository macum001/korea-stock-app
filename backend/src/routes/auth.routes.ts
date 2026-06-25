// jp: 인증 API - 회원가입/로그인/토큰갱신/내정보 + 내정보 관리(닉네임/비번 변경)
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { ApiResponse } from '../types';
import { isDbReady } from '../config/db';
import * as users from '../repositories/user.repository';
import { signAccessToken, signRefreshToken, verifyToken } from '../services/auth/jwt.service';
import { requireAuth, AuthedRequest } from '../middleware/requireAuth';

const router = Router();

// jp: 간단한 이메일/비밀번호 검증
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validCredentials(email: string, password: string): string | null {
  if (!email || !EMAIL_RE.test(email)) return '올바른 이메일을 입력해주세요.';
  if (!password || password.length < 8) return '비밀번호는 8자 이상이어야 해요.';
  return null;
}

// jp: DB 필요
function requireDb(res: Response): boolean {
  if (!isDbReady()) {
    res.status(503).json({ success: false, error: '서비스 준비 중이에요. 잠시 후 다시 시도해주세요.' } as ApiResponse);
    return false;
  }
  return true;
}

// jp: POST /api/auth/register
router.post('/register', async (req: Request, res: Response) => {
  if (!requireDb(res)) return;
  const { email, password, nickname } = req.body as { email: string; password: string; nickname?: string };

  const err = validCredentials(email, password);
  if (err) return res.status(400).json({ success: false, error: err } as ApiResponse);

  try {
    if (await users.emailExists(email)) {
      return res.status(409).json({ success: false, error: '이미 가입된 이메일이에요.' } as ApiResponse);
    }
    const hash = await bcrypt.hash(password, 10);
    const user = await users.createUser(email, (nickname || email.split('@')[0]).slice(0, 100), hash);

    // jp: ★ 신규 가입자에게 기본 관심종목 7개 자동 추가 (지수 5 + 종목 2)
    // jp: 실패해도 회원가입은 성공 (함수 내부에서 에러 잡음)
    await users.seedDefaultWatchlist(user.id);

    const payload = { userId: user.id, email: user.email };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    res.json({
      success: true,
      data: { accessToken, refreshToken, user: { id: user.id, email: user.email, nickname: user.nickname } },
    } as ApiResponse);
  } catch {
    res.status(500).json({ success: false, error: '회원가입에 실패했어요.' } as ApiResponse);
  }
});

// jp: POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  if (!requireDb(res)) return;
  const { email, password } = req.body as { email: string; password: string };
  if (!email || !password) {
    return res.status(400).json({ success: false, error: '이메일과 비밀번호를 입력해주세요.' } as ApiResponse);
  }

  try {
    const user = await users.findUserByEmail(email);
    const ok = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!user || !ok) {
      return res.status(401).json({ success: false, error: '이메일 또는 비밀번호가 올바르지 않아요.' } as ApiResponse);
    }

    void users.touchLastLogin(user.id);
    const payload = { userId: user.id, email: user.email };
    res.json({
      success: true,
      data: {
        accessToken: signAccessToken(payload),
        refreshToken: signRefreshToken(payload),
        user: { id: user.id, email: user.email, nickname: user.nickname },
      },
    } as ApiResponse);
  } catch {
    res.status(500).json({ success: false, error: '로그인에 실패했어요.' } as ApiResponse);
  }
});

// jp: POST /api/auth/refresh - refresh 토큰으로 access 재발급
router.post('/refresh', async (req: Request, res: Response) => {
  const { refreshToken } = req.body as { refreshToken: string };
  if (!refreshToken) return res.status(400).json({ success: false, error: '토큰이 필요해요.' } as ApiResponse);

  const payload = verifyToken(refreshToken);
  if (!payload || payload.type !== 'refresh') {
    return res.status(401).json({ success: false, error: '토큰이 유효하지 않아요.' } as ApiResponse);
  }
  const newPayload = { userId: payload.userId, email: payload.email };
  res.json({ success: true, data: { accessToken: signAccessToken(newPayload) } } as ApiResponse);
});

// jp: GET /api/auth/me - 내 정보 (인증 필요) - 프로필 전체 반환
router.get('/me', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const profile = await users.getProfileById(req.userId!);
    if (!profile) {
      return res.status(404).json({ success: false, error: '사용자를 찾을 수 없어요.' } as ApiResponse);
    }
    res.json({
      success: true,
      data: {
        id: profile.id,
        email: profile.email,
        nickname: profile.nickname,
        createdAt: profile.created_at,
        lastLoginAt: profile.last_login_at,
      },
    } as ApiResponse);
  } catch {
    res.status(500).json({ success: false, error: '정보를 불러오지 못했어요.' } as ApiResponse);
  }
});

// jp: PATCH /api/auth/me/nickname - 닉네임 변경
router.patch('/me/nickname', requireAuth, async (req: AuthedRequest, res: Response) => {
  if (!requireDb(res)) return;
  const nickname = (req.body?.nickname as string || '').trim();

  if (nickname.length < 1 || nickname.length > 20) {
    return res.status(400).json({ success: false, error: '닉네임은 1~20자로 입력해주세요.' } as ApiResponse);
  }

  try {
    await users.updateNickname(req.userId!, nickname);
    res.json({ success: true, data: { nickname } } as ApiResponse);
  } catch {
    res.status(500).json({ success: false, error: '닉네임 변경에 실패했어요.' } as ApiResponse);
  }
});

// jp: PATCH /api/auth/me/password - 비밀번호 변경 (현재 비번 확인 후)
router.patch('/me/password', requireAuth, async (req: AuthedRequest, res: Response) => {
  if (!requireDb(res)) return;
  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, error: '현재 비밀번호와 새 비밀번호를 입력해주세요.' } as ApiResponse);
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ success: false, error: '새 비밀번호는 8자 이상이어야 해요.' } as ApiResponse);
  }

  try {
    // jp: 현재 비번 확인
    const hash = await users.getPasswordHashById(req.userId!);
    if (!hash) {
      return res.status(404).json({ success: false, error: '사용자를 찾을 수 없어요.' } as ApiResponse);
    }
    const ok = await bcrypt.compare(currentPassword, hash);
    if (!ok) {
      return res.status(401).json({ success: false, error: '현재 비밀번호가 올바르지 않아요.' } as ApiResponse);
    }

    // jp: 새 비번 해시 저장
    const newHash = await bcrypt.hash(newPassword, 10);
    await users.updatePasswordHash(req.userId!, newHash);
    res.json({ success: true } as ApiResponse);
  } catch {
    res.status(500).json({ success: false, error: '비밀번호 변경에 실패했어요.' } as ApiResponse);
  }
});

export default router;
