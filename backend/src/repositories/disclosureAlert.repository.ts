// jp: 공시 알림 설정 저장소
// jp: 5종 플래그(전체/중요/자본조달/호재/악재) 지원. 기존 함수도 유지(하위호환)

import { db, query } from '../config/db';
import { AppError } from '../types/errors';

// jp: 5종 알림 설정 타입
export interface DisclosureAlertPrefs {
  alertAll: boolean;
  alertImportant: boolean;
  alertCapital: boolean;
  alertGood: boolean;
  alertBad: boolean;
}

// jp: 특정 종목에 공시 알림 설정한 사용자 조회 (전체 목록)
export async function getAlertUsersByStockCode(stockCode: string): Promise<string[]> {
  try {
    const rows = await query<{ user_id: string }>(
      `SELECT user_id FROM disclosure_alerts
       WHERE stock_code = $1 AND is_enabled = TRUE`,
      [stockCode]
    );
    return rows.map(r => r.user_id);
  } catch {
    return [];
  }
}

// jp: 특정 종목 + 공시 분류에 맞는 알림 대상자 조회 (발송 로직용)
// jp: 공시 플래그(isImportant/isCapital/isGood/isBad)를 받아서, 해당 유형을 구독한 사용자만 반환
export async function getAlertTargetsForDisclosure(
  stockCode: string,
  flags: { isImportant: boolean; isCapital: boolean; isGood: boolean; isBad: boolean }
): Promise<{ userId: string; matchedType: string }[]> {
  try {
    const rows = await query<{
      user_id: string;
      alert_all: boolean;
      alert_important: boolean;
      alert_capital: boolean;
      alert_good: boolean;
      alert_bad: boolean;
    }>(
      `SELECT user_id, alert_all, alert_important, alert_capital, alert_good, alert_bad
         FROM disclosure_alerts
        WHERE stock_code = $1 AND is_enabled = TRUE`,
      [stockCode]
    );

    const targets: { userId: string; matchedType: string }[] = [];
    for (const r of rows) {
      // jp: 우선순위대로 매칭 (자본조달 > 악재 > 호재 > 중요 > 전체)
      // jp: 하나라도 맞으면 알림 대상. matchedType은 대표 유형
      if (r.alert_all) {
        targets.push({ userId: r.user_id, matchedType: 'all' });
      } else if (flags.isCapital && r.alert_capital) {
        targets.push({ userId: r.user_id, matchedType: 'capital' });
      } else if (flags.isBad && r.alert_bad) {
        targets.push({ userId: r.user_id, matchedType: 'bad' });
      } else if (flags.isGood && r.alert_good) {
        targets.push({ userId: r.user_id, matchedType: 'good' });
      } else if (flags.isImportant && r.alert_important) {
        targets.push({ userId: r.user_id, matchedType: 'important' });
      }
    }
    return targets;
  } catch {
    return [];
  }
}

// jp: 5종 플래그로 공시 알림 설정 (신규 방식)
export async function setDisclosureAlertPrefs(
  userId: string,
  stockCode: string,
  prefs: DisclosureAlertPrefs
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO disclosure_alerts
         (user_id, stock_code, important_only, keywords, is_enabled,
          alert_all, alert_important, alert_capital, alert_good, alert_bad)
       VALUES ($1, $2, $3, '{}', TRUE, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, stock_code) DO UPDATE SET
         is_enabled      = TRUE,
         alert_all       = EXCLUDED.alert_all,
         alert_important = EXCLUDED.alert_important,
         alert_capital   = EXCLUDED.alert_capital,
         alert_good      = EXCLUDED.alert_good,
         alert_bad       = EXCLUDED.alert_bad`,
      [
        userId, stockCode,
        // jp: important_only는 하위호환용 - alert_important 값으로 채움
        prefs.alertImportant,
        prefs.alertAll, prefs.alertImportant, prefs.alertCapital, prefs.alertGood, prefs.alertBad,
      ]
    );
  } catch (err) {
    throw new AppError('DATABASE_ERROR', `공시 알림 설정 실패: ${err}`);
  }
}

// jp: 공시 알림 설정 조회 (특정 사용자+종목)
export async function getDisclosureAlertPrefs(
  userId: string,
  stockCode: string
): Promise<(DisclosureAlertPrefs & { isEnabled: boolean }) | null> {
  try {
    const rows = await query<{
      is_enabled: boolean;
      alert_all: boolean;
      alert_important: boolean;
      alert_capital: boolean;
      alert_good: boolean;
      alert_bad: boolean;
    }>(
      `SELECT is_enabled, alert_all, alert_important, alert_capital, alert_good, alert_bad
         FROM disclosure_alerts
        WHERE user_id = $1 AND stock_code = $2`,
      [userId, stockCode]
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      isEnabled: r.is_enabled,
      alertAll: r.alert_all,
      alertImportant: r.alert_important,
      alertCapital: r.alert_capital,
      alertGood: r.alert_good,
      alertBad: r.alert_bad,
    };
  } catch {
    return null;
  }
}

// ============================================================
// jp: 기존 함수 (하위호환 - 그대로 유지)
// ============================================================

export async function setDisclosureAlert(
  userId: string,
  stockCode: string,
  importantOnly = true,
  keywords: string[] = []
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO disclosure_alerts (user_id, stock_code, important_only, keywords, is_enabled)
       VALUES ($1, $2, $3, $4, TRUE)
       ON CONFLICT (user_id, stock_code) DO UPDATE SET
         important_only = EXCLUDED.important_only,
         keywords       = EXCLUDED.keywords,
         is_enabled     = TRUE`,
      [userId, stockCode, importantOnly, keywords]
    );
  } catch (err) {
    throw new AppError('DATABASE_ERROR', `공시 알림 설정 실패: ${err}`);
  }
}

export async function removeDisclosureAlert(userId: string, stockCode: string): Promise<void> {
  try {
    await db.query(
      'UPDATE disclosure_alerts SET is_enabled = FALSE WHERE user_id = $1 AND stock_code = $2',
      [userId, stockCode]
    );
  } catch (err) {
    throw new AppError('DATABASE_ERROR', `공시 알림 해제 실패: ${err}`);
  }
}
