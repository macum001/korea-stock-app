// jp: 네이버 소셜 로그인 라우트
// jp: 흐름: 프론트가 네이버 인증 후 code+state 전달 → 백엔드가 토큰교환 → 사용자정보 조회 → JWT 발급
import { Router, Request, Response } from 'express';
import axios from 'axios';
import { ApiResponse } from '../types';
import { isDbReady } from '../config/db';
import * as users from '../repositories/user.repository';
import { signAccessToken, signRefreshToken } from '../services/auth/jwt.service';
import { ENV } from '../config/env';

const router = Router();

// jp: POST /api/auth/naver - 네이버 로그인 (code, state 받아서 처리)
router.post('/naver', async (req: Request, res: Response) => {
  if (!isDbReady()) {
    return res.status(503).json({ success: false, error: '서버 준비 중이에요.' } as ApiResponse);
  }

  const { code, state } = req.body as { code: string; state: string };
  if (!code) {
    return res.status(400).json({ success: false, error: '인증 코드가 없어요.' } as ApiResponse);
  }

  const clientId = ENV.NAVER?.CLIENT_ID;
  const clientSecret = ENV.NAVER?.CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(500).json({ success: false, error: '네이버 로그인 설정이 없어요.' } as ApiResponse);
  }

  try {
    // jp: 1. 인증 코드로 네이버 access token 교환
    const tokenRes = await axios.get('https://nid.naver.com/oauth2.0/token', {
      params: {
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        state: state || '',
      },
      timeout: 10000,
    });

    const naverAccessToken = tokenRes.data?.access_token;
    if (!naverAccessToken) {
      console.error('[네이버로그인] 토큰 교환 실패:', tokenRes.data);
      return res.status(401).json({ success: false, error: '네이버 인증에 실패했어요.' } as ApiResponse);
    }

    // jp: 2. access token으로 네이버 사용자 정보 조회
    const profileRes = await axios.get('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: `Bearer ${naverAccessToken}` },
      timeout: 10000,
    });

    const naverUser = profileRes.data?.response;
    if (!naverUser || !naverUser.id) {
      console.error('[네이버로그인] 프로필 조회 실패:', profileRes.data);
      return res.status(401).json({ success: false, error: '네이버 사용자 정보를 가져오지 못했어요.' } as ApiResponse);
    }

    // jp: 3. 네이버가 주는 정보 - id(고유), email, nickname/name
    const providerId = String(naverUser.id);
    const email = naverUser.email || `naver_${providerId}@noemail.local`; // 이메일 미동의 시 대체
    const nickname = naverUser.nickname || naverUser.name || `네이버사용자`;

    // jp: 4. DB에서 사용자 찾기/생성
    const { user, isNew } = await users.findOrCreateSocialUser({
      provider: 'naver',
      providerId,
      email,
      nickname,
    });

    void users.touchLastLogin(user.id);

    // jp: 5. 우리 JWT 발급 (기존 로그인과 동일)
    const payload = { userId: user.id, email: user.email };
    res.json({
      success: true,
      data: {
        accessToken: signAccessToken(payload),
        refreshToken: signRefreshToken(payload),
        user: { id: user.id, email: user.email, nickname: user.nickname },
        isNew,
      },
    } as ApiResponse);
  } catch (err) {
    console.error('[네이버로그인] 오류:', err instanceof Error ? err.message : err);
    res.status(500).json({ success: false, error: '네이버 로그인 처리 중 오류가 발생했어요.' } as ApiResponse);
  }
});

export default router;
