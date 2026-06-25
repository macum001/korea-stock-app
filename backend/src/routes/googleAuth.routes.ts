// jp: 구글 소셜 로그인 라우트
// jp: 흐름: 프론트가 구글 인증 후 code 전달 → 백엔드가 토큰교환 → 사용자정보 조회 → JWT 발급
import { Router, Request, Response } from 'express';
import axios from 'axios';
import { ApiResponse } from '../types';
import { isDbReady } from '../config/db';
import * as users from '../repositories/user.repository';
import { signAccessToken, signRefreshToken } from '../services/auth/jwt.service';
import { ENV } from '../config/env';

const router = Router();

// jp: POST /api/auth/google - 구글 로그인 (code 받아서 처리)
router.post('/google', async (req: Request, res: Response) => {
  if (!isDbReady()) {
    return res.status(503).json({ success: false, error: '서버 준비 중이에요.' } as ApiResponse);
  }

  const { code, redirectUri } = req.body as { code: string; redirectUri: string };
  if (!code) {
    return res.status(400).json({ success: false, error: '인증 코드가 없어요.' } as ApiResponse);
  }

  const clientId = ENV.GOOGLE?.CLIENT_ID;
  const clientSecret = ENV.GOOGLE?.CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(500).json({ success: false, error: '구글 로그인 설정이 없어요.' } as ApiResponse);
  }

  try {
    // jp: 1. 인증 코드로 구글 access token 교환
    const tokenRes = await axios.post(
      'https://oauth2.googleapis.com/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri || '',
      }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000,
      }
    );

    const googleAccessToken = tokenRes.data?.access_token;
    if (!googleAccessToken) {
      console.error('[구글로그인] 토큰 교환 실패:', tokenRes.data);
      return res.status(401).json({ success: false, error: '구글 인증에 실패했어요.' } as ApiResponse);
    }

    // jp: 2. access token으로 구글 사용자 정보 조회
    const profileRes = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${googleAccessToken}` },
      timeout: 10000,
    });

    const googleUser = profileRes.data;
    if (!googleUser || !googleUser.id) {
      console.error('[구글로그인] 프로필 조회 실패:', profileRes.data);
      return res.status(401).json({ success: false, error: '구글 사용자 정보를 가져오지 못했어요.' } as ApiResponse);
    }

    // jp: 3. 구글이 주는 정보 - id(고유), email, name
    const providerId = String(googleUser.id);
    const email = googleUser.email || `google_${providerId}@noemail.local`;
    const nickname = googleUser.name || googleUser.email?.split('@')[0] || '구글사용자';

    // jp: 4. DB에서 사용자 찾기/생성
    const { user, isNew } = await users.findOrCreateSocialUser({
      provider: 'google',
      providerId,
      email,
      nickname,
    });

    void users.touchLastLogin(user.id);

    // jp: 5. 우리 JWT 발급
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
    console.error('[구글로그인] 오류:', err instanceof Error ? err.message : err);
    res.status(500).json({ success: false, error: '구글 로그인 처리 중 오류가 발생했어요.' } as ApiResponse);
  }
});

export default router;
