// jp: AI 분석 히스토리 repository - PostgreSQL (멀티유저: userId 인자)
// jp: 저장 / 목록(최근 30, 90일 이내) / 개별삭제 / 전체삭제
import { query } from '../config/db';

export interface AiHistoryRow {
  id: string;
  user_id: string;
  kind: string;
  question: string;
  receipt_no: string | null;
  stock_code: string | null;
  stock_name: string | null;
  answer: unknown;       // jp: JSONB 답 객체
  created_at: string;
}

export interface SaveHistoryInput {
  kind: string;            // jp: 'receipt' | 'stock'
  question: string;
  receiptNo?: string;
  stockCode?: string;
  stockName?: string;
  answer: unknown;         // jp: 분석 결과 객체
  tokens?: number;         // jp: AI 토큰 사용량 (input+output)
  model?: string;          // jp: 사용 모델명
}

// jp: 히스토리 저장 - 저장된 id 반환
export async function saveHistory(userId: string, input: SaveHistoryInput): Promise<string | null> {
  try {
    const rows = await query<{ id: string }>(
      `INSERT INTO ai_analysis_history
         (user_id, kind, question, receipt_no, stock_code, stock_name, answer, ai_tokens, ai_model)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        userId,
        input.kind,
        input.question,
        input.receiptNo ?? null,
        input.stockCode ?? null,
        input.stockName ?? null,
        JSON.stringify(input.answer),
        input.tokens ?? 0,
        input.model ?? null,
      ]
    );
    return rows[0]?.id ?? null;
  } catch (err) {
    console.error('[AI히스토리] 저장 실패:', err instanceof Error ? err.message : err);
    return null;
  }
}

// jp: 히스토리 목록 (최근 30개, 90일 이내)
export async function listHistory(userId: string): Promise<AiHistoryRow[]> {
  try {
    return await query<AiHistoryRow>(
      `SELECT id, user_id, kind, question, receipt_no, stock_code, stock_name, answer, created_at
         FROM ai_analysis_history
        WHERE user_id = $1
          AND created_at > now() - INTERVAL '90 days'
        ORDER BY created_at DESC
        LIMIT 30`,
      [userId]
    );
  } catch (err) {
    console.error('[AI히스토리] 목록 조회 실패:', err instanceof Error ? err.message : err);
    return [];
  }
}

// jp: 개별 삭제 (본인 것만)
export async function deleteHistory(userId: string, id: string): Promise<boolean> {
  try {
    await query(
      `DELETE FROM ai_analysis_history WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    return true;
  } catch (err) {
    console.error('[AI히스토리] 삭제 실패:', err instanceof Error ? err.message : err);
    return false;
  }
}

// jp: 전체 삭제 (본인 것만)
export async function clearHistory(userId: string): Promise<boolean> {
  try {
    await query(`DELETE FROM ai_analysis_history WHERE user_id = $1`, [userId]);
    return true;
  } catch (err) {
    console.error('[AI히스토리] 전체삭제 실패:', err instanceof Error ? err.message : err);
    return false;
  }
}

// jp: 90일 지난 기록 정리 (정리 잡에서 호출)
export async function purgeOldHistory(): Promise<number> {
  try {
    const rows = await query<{ id: string }>(
      `DELETE FROM ai_analysis_history
        WHERE created_at <= now() - INTERVAL '90 days'
        RETURNING id`
    );
    return rows.length;
  } catch (err) {
    console.error('[AI히스토리] 정리 실패:', err instanceof Error ? err.message : err);
    return 0;
  }
}
