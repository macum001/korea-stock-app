// jp: 알림 API 라우트
// jp: GET    /api/notifications            - 목록 조회 (공시 category 포함)
// jp: GET    /api/notifications/unread-count - 안 읽음 개수
// jp: POST   /api/notifications/:id/read    - 1건 읽음
// jp: POST   /api/notifications/read-all     - 전체 읽음
// jp: DELETE /api/notifications/:id          - 1건 삭제
// jp: DELETE /api/notifications              - 전체 삭제
import { Router, Response } from 'express';
import {
  getNotificationsByUser,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearAllNotifications,
} from '../repositories/notification.repository';
import { optionalAuth, AuthedRequest } from '../middleware/requireAuth';

const router = Router();

// jp: 비로그인 기본 사용자 (게스트)
const DEFAULT_USER = 'default-user';

// jp: 로그인했으면 그 사용자 id, 아니면 query.userId, 그것도 없으면 default
// jp: optionalAuth가 req.userId를 넣어줌 (토큰 기반)
function getUserId(req: AuthedRequest): string {
  return req.userId || (req.query.userId as string) || DEFAULT_USER;
}

// jp: 목록 조회
router.get('/', optionalAuth, async (req: AuthedRequest, res: Response) => {
  const userId = getUserId(req);
  const limit = Math.min(parseInt((req.query.limit as string) || '50', 10), 100);
  const data = await getNotificationsByUser(userId, limit);
  res.json({ success: true, data });
});

// jp: 안 읽음 개수
router.get('/unread-count', optionalAuth, async (req: AuthedRequest, res: Response) => {
  const userId = getUserId(req);
  const count = await getUnreadCount(userId);
  res.json({ success: true, data: { count } });
});

// jp: 1건 읽음
router.post('/:id/read', optionalAuth, async (req: AuthedRequest, res: Response) => {
  const userId = getUserId(req);
  await markNotificationRead(userId, req.params.id);
  res.json({ success: true });
});

// jp: 전체 읽음
router.post('/read-all', optionalAuth, async (req: AuthedRequest, res: Response) => {
  const userId = getUserId(req);
  await markAllNotificationsRead(userId);
  res.json({ success: true });
});

// jp: 1건 삭제
router.delete('/:id', optionalAuth, async (req: AuthedRequest, res: Response) => {
  const userId = getUserId(req);
  await deleteNotification(userId, req.params.id);
  res.json({ success: true });
});

// jp: 전체 삭제
router.delete('/', optionalAuth, async (req: AuthedRequest, res: Response) => {
  const userId = getUserId(req);
  await clearAllNotifications(userId);
  res.json({ success: true });
});

export default router;
