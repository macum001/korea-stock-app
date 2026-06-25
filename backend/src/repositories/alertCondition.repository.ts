// jp: 종목 알림 조건 repository - PostgreSQL 저장 (멀티유저: userId 인자)

import { query } from '../config/db';

export interface AlertConditionRow {
  id: string;
  stock_code: string;
  stock_name: string;
  type: string;
  value: number | null;
  keyword: string | null;
  is_enabled: boolean;
  cooldown_minutes: number;
  last_triggered_at: string | null;
}

export async function getConditions(userId: string, stockCode?: string): Promise<AlertConditionRow[]> {
  if (stockCode) {
    return query<AlertConditionRow>(
      `SELECT id, stock_code, stock_name, type, value, keyword, is_enabled, cooldown_minutes, last_triggered_at
         FROM stock_alert_conditions WHERE user_id = $1 AND stock_code = $2 ORDER BY created_at ASC`,
      [userId, stockCode]
    );
  }
  return query<AlertConditionRow>(
    `SELECT id, stock_code, stock_name, type, value, keyword, is_enabled, cooldown_minutes, last_triggered_at
       FROM stock_alert_conditions WHERE user_id = $1 ORDER BY created_at ASC`,
    [userId]
  );
}

export async function createCondition(userId: string, c: {
  id: string; stockCode: string; stockName: string; type: string;
  value?: number; keyword?: string; cooldownMinutes: number;
}): Promise<void> {
  await query(
    `INSERT INTO stock_alert_conditions
       (id, user_id, stock_code, stock_name, type, value, keyword, cooldown_minutes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [c.id, userId, c.stockCode, c.stockName, c.type, c.value ?? null, c.keyword ?? null, c.cooldownMinutes]
  );
}

export async function deleteCondition(userId: string, id: string): Promise<void> {
  await query(`DELETE FROM stock_alert_conditions WHERE id = $1 AND user_id = $2`, [id, userId]);
}

export async function toggleCondition(userId: string, id: string): Promise<void> {
  await query(
    `UPDATE stock_alert_conditions SET is_enabled = NOT is_enabled, updated_at = NOW() WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
}

export async function markTriggered(userId: string, id: string): Promise<void> {
  await query(
    `UPDATE stock_alert_conditions SET last_triggered_at = NOW() WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
}
