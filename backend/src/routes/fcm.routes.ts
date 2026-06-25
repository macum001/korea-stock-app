// jp: FCM 토큰 등록/해제 API
// jp: ★ 로그인 사용자 id로 토큰 저장 (개별 발송 푸시가 가능하도록)
// jp: POST /api/fcm/token   - 토큰 등록
// jp: DELETE /api/fcm/token - 토큰 해제
// jp: POST /api/fcm/test    - 테스트 푸시 (개발용)
import { Router, Response } from 'express';
import { saveFcmToken, deleteFcmToken, getUserFcmTokens } from '../repositories/fcmToken.repository';
import { sendPushToToken, isFcmEnabled } from '../services/fcm/firebase.service';
import { optionalAuth, AuthedRequest } from '../middleware/requireAuth';

const router = Router();

// jp: 비로그인 기본 사용자 (게스트)
const DEFAULT_USER = 'default-user';

// jp: 로그인했으면 그 사용자 id, 아니면 default
function getUserId(req: AuthedRequest): string {
  return req.userId || DEFAULT_USER;
}

// jp: 토큰 등록 - 로그인 사용자 id로 저장
router.post('/token', optionalAuth, async (req: AuthedRequest, res: Response) => {
  const { token } = req.body as { token?: string };
  if (!token || token.length < 20) {
    return res.status(400).json({ success: false, error: '유효한 토큰이 필요해요.' });
  }
  try {
    const userId = getUserId(req);
    await saveFcmToken(userId, token);
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, error: '토큰 등록에 실패했어요.' });
  }
});

// jp: 토큰 해제
router.delete('/token', optionalAuth, async (req: AuthedRequest, res: Response) => {
  const { token } = req.body as { token?: string };
  if (!token) {
    return res.status(400).json({ success: false, error: '토큰이 필요해요.' });
  }
  try {
    await deleteFcmToken(token);
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, error: '토큰 해제에 실패했어요.' });
  }
});

// jp: 테스트 푸시 (개발용) - 로그인 사용자(또는 default)의 토큰으로 발송
router.post('/test', optionalAuth, async (req: AuthedRequest, res: Response) => {
  if (!isFcmEnabled()) {
    return res.status(503).json({ success: false, error: 'FCM이 비활성 상태예요.' });
  }
  try {
    const userId = getUserId(req);
    const tokens = await getUserFcmTokens(userId);
    if (tokens.length === 0) {
      return res.json({ success: false, error: '등록된 토큰이 없어요. 먼저 알림을 허용하세요.' });
    }
    let sent = 0;
    for (const t of tokens) {
      const ok = await sendPushToToken(
        t,
        '공시탐정 AI 테스트',
        '푸시 알림이 정상 작동해요! 🎉',
        { type: 'test' }
      );
      if (ok) sent++;
    }
    res.json({ success: true, sent, total: tokens.length });
  } catch {
    res.status(500).json({ success: false, error: '테스트 푸시 실패' });
  }
});

export default router;
