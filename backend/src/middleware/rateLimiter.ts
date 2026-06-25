// jp: 인바운드 요청 rate limit - 들어오는 요청 폭주 방지 (외부 API 큐와 별개)

import rateLimit from 'express-rate-limit';

// jp: 전역 - 1분당 IP별 300회 (일반 조회는 넉넉히)
export const globalLimiter = rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: '요청이 너무 많아요. 잠시 후 다시 시도해주세요.' },
});

// jp: 비싼 엔드포인트(재계산 등) - 1분당 5회
export const strictLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: '요청이 너무 많아요. 잠시 후 다시 시도해주세요.' },
});

// jp: 인증(로그인/회원가입) - brute-force 방지. IP당 15분에 10회
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: '로그인 시도가 너무 많아요. 잠시 후 다시 시도해주세요.' },
});
