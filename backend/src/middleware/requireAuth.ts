// jp: 인증 미들웨어 - Authorization: Bearer 토큰에서 userId 추출
// jp: requireAuth = 필수, optionalAuth = 있으면 부착(게스트 허용)

import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../services/auth/jwt.service';

// jp: Request에 인증 정보 부착용 타입
export interface AuthedRequest extends Request {
  userId?: string;
  userEmail?: string;
}

// jp: 헤더에서 토큰 추출
function extractToken(req: Request): string | null {
  const auth = req.header('authorization') || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return null;
}

// jp: 인증 필수 - 토큰 없거나 무효면 401
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ success: false, error: '로그인이 필요해요.' });
    return;
  }
  const payload = verifyToken(token);
  // jp: refresh 토큰으로 API 접근 시도 차단
  if (!payload || payload.type === 'refresh') {
    res.status(401).json({ success: false, error: '인증이 만료됐어요. 다시 로그인해주세요.' });
    return;
  }
  req.userId = payload.userId;
  req.userEmail = payload.email;
  next();
}

// jp: 선택적 인증 - 토큰 있으면 부착, 없으면 그냥 통과 (공개 데이터용)
export function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (token) {
    const payload = verifyToken(token);
    if (payload && payload.type !== 'refresh') {
      req.userId = payload.userId;
      req.userEmail = payload.email;
    }
  }
  next();
}
