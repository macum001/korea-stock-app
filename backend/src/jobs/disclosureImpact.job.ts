// disclosureImpact.job.ts
// 공시 가격영향 자동 재계산 cron + 실행 기록
// 평일 09:00 / 16:30 / 21:00 KST 하루 3회 실행
// 실행 결과를 impact_job_log에 기록 (관리자 모니터링용)

import cron from 'node-cron';
import { computePendingImpacts } from '../services/disclosure/disclosureImpact.service';
import { query } from '../config/db';
import { ENV } from '../config/env';

let tasks: cron.ScheduledTask[] = [];

const BATCH_LIMIT = 100;
const MAX_BATCHES = 20;        // 1회 최대 2000개
const FROM_DATE = '2026-01-01';

async function getStats(): Promise<{ totalSamples: number; pendingLeft: number }> {
  try {
    const totalRow = await query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM disclosure_price_impact WHERE status = 'complete'`
    );
    const pendingRow = await query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt
         FROM disclosures d
         LEFT JOIN disclosure_price_impact p ON p.receipt_no = d.receipt_no
        WHERE d.stock_code IS NOT NULL AND d.stock_code != ''
          AND (d.disclosed_at AT TIME ZONE 'Asia/Seoul')::date >= $1
          AND (p.receipt_no IS NULL OR p.status != 'complete')`,
      [FROM_DATE]
    );
    return {
      totalSamples: parseInt(totalRow[0]?.cnt || '0'),
      pendingLeft: parseInt(pendingRow[0]?.cnt || '0'),
    };
  } catch {
    return { totalSamples: 0, pendingLeft: 0 };
  }
}

async function logRun(
  triggerType: string,
  processed: number, completed: number, failed: number,
  success: boolean, errorMessage: string | null, durationMs: number
): Promise<void> {
  try {
    const { totalSamples, pendingLeft } = await getStats();
    await query(
      `INSERT INTO impact_job_log
         (trigger_type, processed, completed, failed, total_samples, pending_left, success, error_message, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [triggerType, processed, completed, failed, totalSamples, pendingLeft, success, errorMessage, durationMs]
    );
  } catch (err) {
    console.error('[공시영향잡] 로그 저장 실패:', err instanceof Error ? err.message : err);
  }
}

export async function runImpactRecompute(triggerType: 'cron' | 'manual' = 'cron'): Promise<{
  processed: number; completed: number; failed: number; success: boolean; message: string;
}> {
  const startedAt = Date.now();
  console.log(`[공시영향잡] 가격영향 재계산 시작 (${triggerType})`);
  let totalProcessed = 0;
  let totalCompleted = 0;
  let totalFailed = 0;
  let success = true;
  let errorMessage: string | null = null;

  try {
    for (let i = 0; i < MAX_BATCHES; i++) {
      const r = await computePendingImpacts(BATCH_LIMIT, FROM_DATE);
      totalProcessed += r.processed;
      totalCompleted += r.completed;
      totalFailed += r.failed;
      if (r.processed === 0) break;
      await new Promise(res => setTimeout(res, 1500));
    }
  } catch (err) {
    success = false;
    errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[공시영향잡] 실행 실패:', errorMessage);
  }

  const durationMs = Date.now() - startedAt;
  await logRun(triggerType, totalProcessed, totalCompleted, totalFailed, success, errorMessage, durationMs);

  const message = success
    ? `처리 ${totalProcessed}개, 완료 ${totalCompleted}개`
    : `실패: ${errorMessage}`;
  console.log(`[공시영향잡] 완료 - ${message} (${durationMs}ms)`);

  return { processed: totalProcessed, completed: totalCompleted, failed: totalFailed, success, message };
}

// jp: cron 시작 - 평일 3회 (09:00 / 16:30 / 21:00 KST)
// jp: 기존 16:30 1회 → 3회로 강화 (백엔드 꺼짐으로 인한 누락 최소화)
export function startDisclosureImpactJob(): void {
  if (ENV.USE_MOCK_DATA) {
    console.log('[공시영향잡] MOCK 모드 - 재계산 스케줄러 생략');
    return;
  }

  const schedules = [
    { cron: '0 9 * * 1-5',  label: '09:00' },
    { cron: '30 16 * * 1-5', label: '16:30' },
    { cron: '0 21 * * 1-5',  label: '21:00' },
  ];

  for (const s of schedules) {
    const t = cron.schedule(
      s.cron,
      () => { void runImpactRecompute('cron'); },
      { timezone: 'Asia/Seoul' }
    );
    tasks.push(t);
  }

  console.log('[공시영향잡] 가격영향 재계산 스케줄러 시작 (평일 09:00 / 16:30 / 21:00)');
}

export function stopDisclosureImpactJob(): void {
  for (const t of tasks) t.stop();
  tasks = [];
}
