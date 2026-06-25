// jp: 관리자 전용 JWT 발급/검증 (일반 사용자 토큰과 분리)
// jp: payload에 adminId, role, type:'admin' 포함 → requireAdmin에서 확인

import jwt from 'jsonwebtoken';
import { ENV } from '../../config/env';

export interface AdminTokenPayload {
  adminId: string;
  username: string;
  role: string;
}

// jp: 관리자 토큰은 짧게 (4시간)
const ADMIN_EXPIRES = '4h';

// jp: 관리자 access 토큰 발급 (type:'admin' 표시)
export function signAdminToken(payload: AdminTokenPayload): string {
  return jwt.sign({ ...payload, type: 'admin' }, ENV.JWT_SECRET, { expiresIn: ADMIN_EXPIRES });
}

// jp: 관리자 토큰 검증 - type:'admin'이 아니면 null
export function verifyAdminToken(token: string): (AdminTokenPayload & { type: string }) | null {
  try {
    const decoded = jwt.verify(token, ENV.JWT_SECRET) as AdminTokenPayload & { type?: string };
    // jp: 일반 사용자 토큰으로 어드민 접근 차단
    if (decoded.type !== 'admin') return null;
    return decoded as AdminTokenPayload & { type: string };
  } catch {
    return null;
  }
}
