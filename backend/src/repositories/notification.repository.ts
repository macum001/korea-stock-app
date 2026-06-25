// jp: 알림 PostgreSQL 저장소
// jp: 공시 알림은 target_id로 disclosures와 조인해 category + receipt_no 포함

import { db, query } from '../config/db';

export interface CreateNotificationInput {
  userId:    string;
  type:      'disclosure' | 'price' | 'volume';
  stockCode: string;
  title:     string;
  body:      string;
  targetId?: string;
}

// jp: 프론트로 내려주는 알림 형태
export interface NotificationRow {
  id: string;
  type: string;
  stockCode: string | null;
  stockName: string | null;
  title: string;
  body: string | null;
  category: string | null;   // jp: 공시면 capital/good/bad/important/general
  receiptNo: string | null;  // jp: 공시 접수번호 (알림 클릭 → 공시 상세용)
  isRead: boolean;
  createdAt: string;
}

// jp: 알림 생성
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  try {
    await db.query(
      `INSERT INTO notifications (user_id, type, stock_code, title, body, target_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [input.userId, input.type, input.stockCode, input.title, input.body, input.targetId ?? null]
    );
  } catch (err) {
    console.error('[Notification] 저장 실패:', err instanceof Error ? err.message : err);
  }
}

// jp: 여러 사용자에게 알림 일괄 생성 (UNNEST 한 방 INSERT)
export async function createNotificationsForUsers(
  userIds: string[],
  input: Omit<CreateNotificationInput, 'userId'>
): Promise<void> {
  if (userIds.length === 0) return;
  try {
    await db.query(
      `INSERT INTO notifications (user_id, type, stock_code, title, body, target_id)
       SELECT uid, $2, $3, $4, $5, $6
         FROM UNNEST($1::varchar[]) AS uid`,
      [userIds, input.type, input.stockCode, input.title, input.body, input.targetId ?? null]
    );
  } catch (err) {
    console.error('[Notification] 일괄 저장 실패:', err instanceof Error ? err.message : err);
    await Promise.all(userIds.map(userId => createNotification({ ...input, userId })));
  }
}

// jp: 여러 사용자 중 "아직 이 target 알림을 안 받은" 사용자만 한 방 쿼리로 걸러냄
export async function filterNewUserIdsForTarget(
  userIds: string[],
  targetId: string,
  type: string
): Promise<string[]> {
  if (!targetId || userIds.length === 0) return userIds;
  try {
    const res = await db.query(
      `SELECT DISTINCT user_id FROM notifications
        WHERE target_id = $1 AND type = $2 AND user_id = ANY($3)`,
      [targetId, type, userIds]
    );
    const already = new Set(res.rows.map((r) => r.user_id as string));
    return userIds.filter((uid) => !already.has(uid));
  } catch (err) {
    console.error('[Notification] 일괄 중복체크 실패:', err instanceof Error ? err.message : err);
    return userIds;
  }
}

// jp: 사용자 알림 목록 조회 (공시 category + receipt_no 조인)
export async function getNotificationsByUser(userId: string, limit = 50): Promise<NotificationRow[]> {
  try {
    const rows = await query<{
      id: string;
      type: string;
      stock_code: string | null;
      title: string;
      body: string | null;
      category: string | null;
      receipt_no: string | null;
      is_read: boolean;
      created_at: string;
    }>(
      `SELECT n.id, n.type, n.stock_code, n.title, n.body,
              d.category AS category, d.receipt_no AS receipt_no,
              n.is_read, n.created_at
         FROM notifications n
         LEFT JOIN disclosures d ON n.target_id = d.id::text
        WHERE n.user_id = $1
        ORDER BY n.created_at DESC
        LIMIT $2`,
      [userId, limit]
    );
    return rows.map(r => ({
      id: r.id,
      type: r.type,
      stockCode: r.stock_code,
      stockName: null,
      title: r.title,
      body: r.body,
      category: r.category,
      receiptNo: r.receipt_no,
      isRead: r.is_read,
      createdAt: r.created_at,
    }));
  } catch (err) {
    console.error('[Notification] 조회 실패:', err instanceof Error ? err.message : err);
    return [];
  }
}

// jp: 안 읽은 알림 개수
export async function getUnreadCount(userId: string): Promise<number> {
  try {
    const rows = await query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM notifications WHERE user_id = $1 AND is_read = FALSE`,
      [userId]
    );
    return parseInt(rows[0]?.cnt ?? '0', 10);
  } catch {
    return 0;
  }
}

// jp: 알림 1건 읽음 처리
export async function markNotificationRead(userId: string, id: string): Promise<void> {
  try {
    await db.query(
      `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
  } catch (err) {
    console.error('[Notification] 읽음 처리 실패:', err instanceof Error ? err.message : err);
  }
}

// jp: 전체 읽음 처리
export async function markAllNotificationsRead(userId: string): Promise<void> {
  try {
    await db.query(
      `UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE`,
      [userId]
    );
  } catch (err) {
    console.error('[Notification] 전체 읽음 실패:', err instanceof Error ? err.message : err);
  }
}

// jp: 알림 1건 삭제
export async function deleteNotification(userId: string, id: string): Promise<void> {
  try {
    await db.query(
      `DELETE FROM notifications WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
  } catch (err) {
    console.error('[Notification] 삭제 실패:', err instanceof Error ? err.message : err);
  }
}

// jp: 전체 삭제
export async function clearAllNotifications(userId: string): Promise<void> {
  try {
    await db.query(`DELETE FROM notifications WHERE user_id = $1`, [userId]);
  } catch (err) {
    console.error('[Notification] 전체 삭제 실패:', err instanceof Error ? err.message : err);
  }
}

// jp: 한 user가 이 공시(targetId)로 이미 알림 받았는지 (중복 방지, 단건)
export async function notificationExistsForTarget(
  userId: string, targetId: string, type: string
): Promise<boolean> {
  if (!targetId) return false;
  try {
    const rows = await query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM notifications
        WHERE user_id = $1 AND target_id = $2 AND type = $3`,
      [userId, targetId, type]
    );
    return parseInt(rows[0]?.cnt ?? '0', 10) > 0;
  } catch {
    return false;
  }
}
