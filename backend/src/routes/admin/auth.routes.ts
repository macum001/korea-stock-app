// jp: 관리자 인증 API (/api/admin/auth/*)
// jp: 일반 사용자 auth.routes 패턴 따름

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { ApiResponse } from '../../types';
import { isDbReady } from '../../config/db';
import * as admins from '../../repositories/adminUser.repository';
import { signAdminToken } from '../../services/auth/adminJwt.service';
import { requireAdmin, AdminRequest } from '../../middleware/requireAdmin';

const router = Router();

function requireDb(res: Response): boolean {
  if (!isDbReady()) {
    res.status(503).json({ success: false, error: '서비스 준비 중이에요. 잠시 후 다시 시도해주세요.' } as ApiResponse);
    return false;
  }
  return true;
}

// jp: POST /api/admin/auth/login
router.post('/login', async (req: Request, res: Response) => {
  if (!requireDb(res)) return;
  const { username, password } = req.body as { username: string; password: string };
  if (!username || !password) {
    return res.status(400).json({ success: false, error: '아이디와 비밀번호를 입력해주세요.' } as ApiResponse);
  }

  try {
    const admin = await admins.findAdminByUsername(username);
    // jp: 계정 없음/비번 불일치 같은 메시지 (계정 존재 여부 노출 방지)
    const ok = admin ? await bcrypt.compare(password, admin.password_hash) : false;
    if (!admin || !ok) {
      return res.status(401).json({ success: false, error: '아이디 또는 비밀번호가 올바르지 않아요.' } as ApiResponse);
    }
    // jp: 비활성 계정 차단
    if (!admin.is_active) {
      return res.status(403).json({ success: false, error: '비활성화된 계정이에요.' } as ApiResponse);
    }

    void admins.touchAdminLogin(admin.id);
    const token = signAdminToken({ adminId: admin.id, username: admin.username, role: admin.role });
    res.json({
      success: true,
      data: {
        token,
        admin: { id: admin.id, username: admin.username, name: admin.name, role: admin.role },
      },
    } as ApiResponse);
  } catch (err) {
    console.error('[관리자] 로그인 실패:', err instanceof Error ? err.message : err);
    res.status(500).json({ success: false, error: '로그인에 실패했어요.' } as ApiResponse);
  }
});

// jp: GET /api/admin/auth/me - 현재 관리자 정보 (토큰 검증용)
router.get('/me', requireAdmin, (req: AdminRequest, res: Response) => {
  res.json({
    success: true,
    data: { id: req.adminId, username: req.adminUsername, role: req.adminRole },
  } as ApiResponse);
});

export default router;
