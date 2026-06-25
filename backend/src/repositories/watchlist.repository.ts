// jp: 관심종목 repository - PostgreSQL 저장 (멀티유저: 모든 함수가 userId를 받음)

import { query } from '../config/db';

// ============================================================
// jp: 그룹
// ============================================================
export interface WatchlistGroupRow {
  id: string;
  name: string;
  sort_order: number;
  is_default: boolean;
}

export async function getGroups(userId: string): Promise<WatchlistGroupRow[]> {
  return query<WatchlistGroupRow>(
    `SELECT id, name, sort_order, is_default
       FROM watchlist_groups WHERE user_id = $1 ORDER BY sort_order ASC`,
    [userId]
  );
}

export async function createGroup(userId: string, id: string, name: string, sortOrder: number): Promise<void> {
  await query(
    `INSERT INTO watchlist_groups (id, user_id, name, sort_order, is_default)
     VALUES ($1, $2, $3, $4, FALSE)
     ON CONFLICT (user_id, id) DO NOTHING`,
    [id, userId, name, sortOrder]
  );
}

export async function renameGroup(userId: string, id: string, name: string): Promise<void> {
  await query(
    `UPDATE watchlist_groups SET name = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3`,
    [name, id, userId]
  );
}

export async function updateGroupOrder(userId: string, id: string, sortOrder: number): Promise<void> {
  await query(
    `UPDATE watchlist_groups SET sort_order = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3`,
    [sortOrder, id, userId]
  );
}

export async function deleteGroup(userId: string, id: string, mode: 'move_to_default' | 'delete_all'): Promise<void> {
  if (mode === 'delete_all') {
    await query(`DELETE FROM watchlists WHERE group_id = $1 AND user_id = $2`, [id, userId]);
  } else {
    const remaining = await query<{ id: string }>(
      `SELECT id FROM watchlist_groups WHERE user_id = $1 AND id <> $2 ORDER BY sort_order ASC LIMIT 1`,
      [userId, id]
    );
    let targetId = remaining[0]?.id;
    if (!targetId) {
      await query(
        `INSERT INTO watchlist_groups (id, user_id, name, sort_order, is_default)
         VALUES ('default', $1, '기본', 0, TRUE) ON CONFLICT (user_id, id) DO NOTHING`,
        [userId]
      );
      targetId = 'default';
    }
    await query(
      `UPDATE watchlists SET group_id = $1 WHERE group_id = $2 AND user_id = $3`,
      [targetId, id, userId]
    );
  }
  await query(`DELETE FROM watchlist_groups WHERE id = $1 AND user_id = $2`, [id, userId]);
}

// ============================================================
// jp: 종목
// ============================================================
export interface WatchlistItemRow {
  stock_code: string;
  stock_name: string;
  group_id: string;
  sort_order: number;
  memo: string;
  memo_updated_at: string | null;
  price_alert: boolean;
  disclosure_alert: boolean;
  // jp: 자산 종류 - 'stock'(종목) | 'index'(지수). 프론트가 시세 소스 구분에 사용
  asset_type: string;
}

export async function getItems(userId: string): Promise<WatchlistItemRow[]> {
  return query<WatchlistItemRow>(
    `SELECT stock_code, stock_name, group_id, sort_order, memo, memo_updated_at, price_alert, disclosure_alert, asset_type
       FROM watchlists WHERE user_id = $1 ORDER BY sort_order ASC`,
    [userId]
  );
}

// jp: 종목 추가 - assetType 선택적 (기본 'stock'). 지수를 추가할 일이 생기면 'index' 전달
export async function addItem(userId: string, code: string, name: string, groupId: string, assetType: 'stock' | 'index' = 'stock'): Promise<void> {
  await query(
    `INSERT INTO watchlist_groups (id, user_id, name, sort_order, is_default)
     VALUES ($1, $2, '기본', 0, TRUE) ON CONFLICT (user_id, id) DO NOTHING`,
    [groupId, userId]
  );
  const max = await query<{ m: number }>(
    `SELECT COALESCE(MAX(sort_order), -1) AS m FROM watchlists WHERE user_id = $1`,
    [userId]
  );
  await query(
    `INSERT INTO watchlists (user_id, stock_code, stock_name, group_id, sort_order, asset_type)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, stock_code) DO NOTHING`,
    [userId, code, name, groupId, (max[0]?.m ?? -1) + 1, assetType]
  );
}

export async function removeItem(userId: string, code: string): Promise<void> {
  await query(`DELETE FROM watchlists WHERE stock_code = $1 AND user_id = $2`, [code, userId]);
}

export async function moveItemToGroup(userId: string, code: string, groupId: string): Promise<void> {
  await query(
    `UPDATE watchlists SET group_id = $1 WHERE stock_code = $2 AND user_id = $3`,
    [groupId, code, userId]
  );
}

export async function updateItemOrder(userId: string, code: string, sortOrder: number): Promise<void> {
  await query(
    `UPDATE watchlists SET sort_order = $1 WHERE stock_code = $2 AND user_id = $3`,
    [sortOrder, code, userId]
  );
}

export async function setMemo(userId: string, code: string, memo: string): Promise<void> {
  await query(
    `UPDATE watchlists SET memo = $1, memo_updated_at = NOW() WHERE stock_code = $2 AND user_id = $3`,
    [memo, code, userId]
  );
}

export async function deleteMemo(userId: string, code: string): Promise<void> {
  await query(
    `UPDATE watchlists SET memo = '', memo_updated_at = NULL WHERE stock_code = $1 AND user_id = $2`,
    [code, userId]
  );
}

export async function setPriceAlert(userId: string, code: string, on: boolean): Promise<void> {
  await query(`UPDATE watchlists SET price_alert = $1 WHERE stock_code = $2 AND user_id = $3`, [on, code, userId]);
}

export async function setDisclosureAlert(userId: string, code: string, on: boolean): Promise<void> {
  await query(`UPDATE watchlists SET disclosure_alert = $1 WHERE stock_code = $2 AND user_id = $3`, [on, code, userId]);
}
