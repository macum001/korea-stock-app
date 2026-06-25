// briefing.repository.ts
// market_briefings 테이블 CRUD (slot 기반 - 하루 5건)

import { db } from '../config/db';
import { BriefingRawData } from '../services/kis/globalIndex.service';

export interface MarketBriefing {
  id: number;
  date: string;
  slot: string;          // HHMM: '0600' '0840' '1150' '1540' '2250' (수동='test')
  raw_data: BriefingRawData;
  summary: string | null;
  analysis: Record<string, unknown> | null;
  ai_model: string | null;
  ai_tokens: number | null;
  status: 'collecting' | 'collected' | 'completed' | 'failed';
  error_message: string | null;
  collected_at: string | null;
  analyzed_at: string | null;
  created_at: string;
  updated_at: string;
}

// jp: KST 오늘 날짜 (YYYY-MM-DD)
function getKstDate(d = new Date()): string {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

// jp: 정의된 브리핑 시간들 (분 단위, KST)
const SLOTS = [
  { slot: '0600', minutes: 6 * 60 },        // 360
  { slot: '0840', minutes: 8 * 60 + 40 },   // 520
  { slot: '1150', minutes: 11 * 60 + 50 },  // 710
  { slot: '1540', minutes: 15 * 60 + 40 },  // 940
  { slot: '2250', minutes: 22 * 60 + 50 },  // 1370
];

// jp: 현재 KST 시각 기준, "이미 지난 가장 최근" slot 반환
// jp: 예) 20:17이면 15:40 (22:50은 아직 안 됐으므로 제외)
// jp: 첫 slot(06:00) 이전 새벽이면 전날 마지막 slot(22:50)으로 간주
export function getCurrentSlot(d = new Date()): string {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const nowMin = kst.getUTCHours() * 60 + kst.getUTCMinutes();

  // jp: 현재 시각 이전(<=)인 slot 중 가장 큰(마지막) 것
  let passed = '';
  for (const s of SLOTS) {
    if (nowMin >= s.minutes) {
      passed = s.slot;
    }
  }
  // jp: 06:00 이전 새벽 때 아직 오늘 첫 brief 안 됐으므로 직전(22:50)으로
  if (!passed) passed = SLOTS[SLOTS.length - 1].slot;
  return passed;
}

// jp: 날짜+slot으로 브리핑 조회
export async function getBriefingByDateSlot(date: string, slot: string): Promise<MarketBriefing | null> {
  const { rows } = await db.query<MarketBriefing>(
    `SELECT * FROM market_briefings WHERE date = $1 AND slot = $2 LIMIT 1`,
    [date, slot]
  );
  return rows[0] ?? null;
}

// jp: 최신 완료된 브리핑 (프론트 메인 표시용)
export async function getLatestCompletedBriefing(): Promise<MarketBriefing | null> {
  const { rows } = await db.query<MarketBriefing>(
    `SELECT * FROM market_briefings
     WHERE status = 'completed'
     ORDER BY date DESC, slot DESC
     LIMIT 1`
  );
  return rows[0] ?? null;
}

// jp: 최신 브리핑 (상태 무관)
export async function getLatestBriefing(): Promise<MarketBriefing | null> {
  // jp: 완료된 것 우선, 그 중 가장 최근 생성(id) 순
  const { rows } = await db.query<MarketBriefing>(
    `SELECT * FROM market_briefings
     ORDER BY
       CASE WHEN status = 'completed' THEN 0 ELSE 1 END,
       date DESC,
       id DESC
     LIMIT 1`
  );
  return rows[0] ?? null;
}

// jp: 특정 날짜의 모든 브리핑 (시간순 - 사용자 히스토리용)
export async function getBriefingsByDate(date: string): Promise<MarketBriefing[]> {
  const { rows } = await db.query<MarketBriefing>(
    `SELECT * FROM market_briefings
     WHERE date = $1
     ORDER BY slot ASC`,
    [date]
  );
  return rows;
}

// jp: 최근 N건 (관리자 누적 확인용)
export async function getRecentBriefings(limit = 50): Promise<MarketBriefing[]> {
  const { rows } = await db.query<MarketBriefing>(
    `SELECT * FROM market_briefings
     ORDER BY date DESC, slot DESC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

// jp: 수집 저장 (date+slot 기준 upsert)
export async function upsertBriefingCollected(
  date: string,
  slot: string,
  rawData: BriefingRawData
): Promise<MarketBriefing> {
  const { rows } = await db.query<MarketBriefing>(
    `INSERT INTO market_briefings (date, slot, raw_data, status, collected_at, updated_at)
     VALUES ($1, $2, $3, 'collected', NOW(), NOW())
     ON CONFLICT (date, slot) DO UPDATE SET
       raw_data     = EXCLUDED.raw_data,
       status       = 'collected',
       collected_at = NOW(),
       updated_at   = NOW()
     RETURNING *`,
    [date, slot, JSON.stringify(rawData)]
  );
  return rows[0];
}

// jp: AI 분석 결과 저장 (토큰 입력/출력 분리 저장)
export async function updateBriefingAnalyzed(
  id: number,
  summary: string,
  analysis: Record<string, unknown>,
  aiModel: string,
  aiTokens: number,
  promptTokens = 0,
  completionTokens = 0
): Promise<void> {
  await db.query(
    `UPDATE market_briefings SET
       summary              = $1,
       analysis             = $2,
       ai_model             = $3,
       ai_tokens            = $4,
       ai_prompt_tokens     = $6,
       ai_completion_tokens = $7,
       status               = 'completed',
       analyzed_at          = NOW(),
       updated_at           = NOW()
     WHERE id = $5`,
    [summary, JSON.stringify(analysis), aiModel, aiTokens, id, promptTokens, completionTokens]
  );
}

// jp: 실패 기록 (date+slot)
export async function markBriefingFailed(date: string, slot: string, errorMessage: string): Promise<void> {
  await db.query(
    `INSERT INTO market_briefings (date, slot, raw_data, status, error_message, updated_at)
     VALUES ($1, $2, '{}', 'failed', $3, NOW())
     ON CONFLICT (date, slot) DO UPDATE SET
       status        = 'failed',
       error_message = EXCLUDED.error_message,
       updated_at    = NOW()`,
    [date, slot, errorMessage]
  );
}

// jp: 오늘+현재slot으로 수집 저장
export async function collectTodayBriefing(
  rawData: BriefingRawData,
  slot?: string
): Promise<MarketBriefing> {
  const today = getKstDate();
  const useSlot = slot ?? getCurrentSlot();
  return upsertBriefingCollected(today, useSlot, rawData);
}

export { getKstDate };
