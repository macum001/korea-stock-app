// jp: 관리자 인증 미들웨어 (통합)
// jp: 두 방식 중 하나만 맞으면 통과:
// jp:   1) x-admin-key 헤더 == ENV.ADMIN_API_KEY  (기존 어드민 라우트용 - adminDisclosure/adminPrice 등)
// jp:   2) Authorization: Bearer <관리자 JWT> (type:'admin')  (새 관리자 로그인용)
// jp: requireRole = 권한 등급 체크 (super > admin > viewer). JWT 로그인 시에만 role 있음.

import { Request, Response, NextFunction } from 'express';
import { ENV } from '../config/env';
import { verifyAdminToken } from '../services/auth/adminJwt.service';

export interface AdminRequest extends Request {
  adminId?: string;
  adminUsername?: string;
  adminRole?: string;
}

function extractBearer(req: Request): string | null {
  const auth = req.header('authorization') || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return null;
}

// jp: 관리자 인증 필수 - 헤더 키 OR JWT 둘 중 하나
export function requireAdmin(req: AdminRequest, res: Response, next: NextFunction): void {
  // jp: 방식 1) x-admin-key 헤더 (기존 어드민 라우트 호환)
  const headerKey = req.header('x-admin-key');
  if (ENV.ADMIN_API_KEY && headerKey && headerKey === ENV.ADMIN_API_KEY) {
    // jp: 키 방식은 최고 권한으로 취급 (기존 동작 유지)
    req.adminRole = 'super';
    return next();
  }

  // jp: 방식 2) 관리자 JWT (새 로그인)
  const token = extractBearer(req);
  if (token) {
    const payload = verifyAdminToken(token);
    if (payload) {
      req.adminId = payload.adminId;
      req.adminUsername = payload.username;
      req.adminRole = payload.role;
      return next();
    }
  }

  // jp: 둘 다 실패
  res.status(401).json({ success: false, error: '관리자 인증이 필요해요.' });
}

// jp: 권한 등급 체크 (requireAdmin 다음에 사용)
const ROLE_RANK: Record<string, number> = { viewer: 1, admin: 2, super: 3 };

export function requireRole(minRole: 'viewer' | 'admin' | 'super') {
  return (req: AdminRequest, res: Response, next: NextFunction): void => {
    const rank = ROLE_RANK[req.adminRole || ''] ?? 0;
    const need = ROLE_RANK[minRole] ?? 99;
    if (rank < need) {
      res.status(403).json({ success: false, error: '이 작업을 수행할 권한이 없어요.' });
      return;
    }
    next();
  };
}
