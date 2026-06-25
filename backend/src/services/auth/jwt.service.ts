// jp: JWT 토큰 발급/검증 유틸

import jwt from 'jsonwebtoken';
import { ENV } from '../../config/env';

export interface TokenPayload {
  userId: string;
  email: string;
}

// jp: access 토큰 (짧게 - 1시간) / refresh 토큰 (길게 - 30일)
const ACCESS_EXPIRES = '1h';
const REFRESH_EXPIRES = '30d';

export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, ENV.JWT_SECRET, { expiresIn: ACCESS_EXPIRES });
}

export function signRefreshToken(payload: TokenPayload): string {
  // jp: refresh는 별도 시크릿 + type 표시 (access로 오용 방지)
  return jwt.sign({ ...payload, type: 'refresh' }, ENV.JWT_SECRET, { expiresIn: REFRESH_EXPIRES });
}

// jp: 검증 - 실패 시 null
export function verifyToken(token: string): (TokenPayload & { type?: string }) | null {
  try {
    return jwt.verify(token, ENV.JWT_SECRET) as TokenPayload & { type?: string };
  } catch {
    return null;
  }
}
