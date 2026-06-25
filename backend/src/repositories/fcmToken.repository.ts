// jp: FCM 토큰 저장소
// jp: 한 사용자가 여러 기기를 쓸 수 있으니 토큰 여러 개 허용
// jp: 토큰은 기기당 고유. 만료 시 정리

import { db } from '../config/db';

// jp: 토큰 등록 (이미 있으면 갱신)
export async function saveFcmToken(userId: string, token: string): Promise<void> {
  await db.query(
    `INSERT INTO fcm_tokens (user_id, token, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (token) DO UPDATE SET user_id = $1, updated_at = NOW()`,
    [userId, token]
  );
}

// jp: 특정 사용자의 모든 토큰
export async function getUserFcmTokens(userId: string): Promise<string[]> {
  const res = await db.query(
    `SELECT token FROM fcm_tokens WHERE user_id = $1`,
    [userId]
  );
  return res.rows.map((r) => r.token as string);
}

// jp: 여러 사용자의 토큰을 한 방 쿼리로 (IN 쿼리)
// jp: ★ 대량 최적화 (기존: for 루프로 사용자마다 getUserFcmTokens → 1번)
export async function getFcmTokensForUsers(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const res = await db.query(
    `SELECT token FROM fcm_tokens WHERE user_id = ANY($1)`,
    [userIds]
  );
  return res.rows.map((r) => r.token as string);
}

// jp: 전체 토큰 (전체 공지)
export async function getAllFcmTokens(): Promise<string[]> {
  const res = await db.query(`SELECT token FROM fcm_tokens`);
  return res.rows.map((r) => r.token as string);
}

// jp: 만료/무효 토큰 삭제
export async function deleteFcmTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  await db.query(`DELETE FROM fcm_tokens WHERE token = ANY($1)`, [tokens]);
}

// jp: 단일 토큰 삭제 (로그아웃/구독 해제)
export async function deleteFcmToken(token: string): Promise<void> {
  await db.query(`DELETE FROM fcm_tokens WHERE token = $1`, [token]);
}
