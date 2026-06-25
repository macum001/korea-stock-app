// jp: 공시 10년치 backfill 서비스
// jp: 전 종목을 순회하며 syncDisclosuresByStockCode(10년치)를 호출
// jp: rate limit(종목당 간격) + 진행상태 DB 저장 + 중단 후 재개 가능
// jp: 화면에서 직접 호출 금지 - 관리자 API로만 트리거

import { query, isDbReady } from '../../config/db';
import { getAllStockCodes } from '../../repositories/stockMaster.repository';
import { MAJOR_STOCK_CODES_UNIQUE } from '../../data/majorStocks';
import { syncDisclosuresByStockCode } from './disclosureSync.service';

// jp: 종목당 간격 (DART rate limit 대응 - 분당 1000건 제한 고려)
const DELAY_MS = 1200;

let running = false; // jp: 중복 실행 방지 (단일 프로세스 기준)

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface BackfillStatus {
  id: number;
  status: string;
  total_companies: number;
  processed_companies: number;
  inserted_count: number;
  duplicated_count: number;
  failed_count: number;
  last_stock_code: string | null;
  started_at: string | null;
  finished_at: string | null;
}

// jp: 현재(가장 최근) backfill 작업 상태 조회
export async function getBackfillStatus(): Promise<BackfillStatus | null> {
  if (!isDbReady()) return null;
  try {
    const rows = await query<BackfillStatus>(
      `SELECT id, status, total_companies, processed_companies,
              inserted_count, duplicated_count, failed_count,
              last_stock_code, started_at, finished_at
         FROM disclosure_backfill_jobs ORDER BY id DESC LIMIT 1`
    );
    return rows[0] || null;
  } catch {
    return null;
  }
}

// jp: backfill 시작 (백그라운드 실행). resume=true면 마지막 작업 이어서
export async function startBackfill(resume = false): Promise<{ started: boolean; reason?: string; jobId?: number }> {
  if (!isDbReady()) return { started: false, reason: 'DB 미연결' };
  if (running)      return { started: false, reason: '이미 실행 중' };

  const allCodes = await getAllStockCodes(true);
  if (allCodes.length === 0) return { started: false, reason: '종목 마스터가 비어있음 (먼저 종목 동기화 필요)' };

  // jp: 주요 종목(시총 상위) 먼저 → 나머지 순서로 정렬
  // jp: 사람들이 많이 보는 종목부터 10년치가 채워지게 (가나다순 비효율 방지)
  const majorSet = new Set(MAJOR_STOCK_CODES_UNIQUE);
  const majorFirst = MAJOR_STOCK_CODES_UNIQUE.filter(c => allCodes.includes(c));
  const rest = allCodes.filter(c => !majorSet.has(c));
  const codes = [...majorFirst, ...rest];

  // jp: 재개 지점 결정
  let startIndex = 0;
  let jobId: number;
  if (resume) {
    const prev = await getBackfillStatus();
    if (prev && (prev.status === 'paused' || prev.status === 'running' || prev.status === 'failed')) {
      jobId = prev.id;
      if (prev.last_stock_code) {
        const idx = codes.indexOf(prev.last_stock_code);
        if (idx >= 0) startIndex = idx + 1;
      }
      await query(`UPDATE disclosure_backfill_jobs SET status='running', updated_at=NOW() WHERE id=$1`, [jobId]);
    } else {
      jobId = await createJob(codes.length);
    }
  } else {
    jobId = await createJob(codes.length);
  }

  // jp: 백그라운드로 실행 (응답 막지 않음)
  void runBackfill(jobId, codes, startIndex);
  return { started: true, jobId };
}

async function createJob(total: number): Promise<number> {
  const rows = await query<{ id: number }>(
    `INSERT INTO disclosure_backfill_jobs (status, total_companies, started_at)
     VALUES ('running', $1, NOW()) RETURNING id`,
    [total]
  );
  return rows[0].id;
}

// jp: 실제 backfill 루프
async function runBackfill(jobId: number, codes: string[], startIndex: number): Promise<void> {
  running = true;
  let inserted = 0, duplicated = 0, failed = 0, processed = startIndex;
  console.log(`[backfill] 시작 job=${jobId} 전체 ${codes.length}종목 (${startIndex}번부터)`);

  try {
    for (let i = startIndex; i < codes.length; i++) {
      const code = codes[i];
      try {
        const r = await syncDisclosuresByStockCode(code);
        inserted   += r.newCount;
        duplicated += r.skipCount;
        if (r.errorCount > 0) failed += 1;
      } catch {
        failed += 1;
      }
      processed = i + 1;

      // jp: 10종목마다 진행상태 저장 (재개 지점 기록)
      if (processed % 10 === 0 || i === codes.length - 1) {
        await query(
          `UPDATE disclosure_backfill_jobs
              SET processed_companies=$1, inserted_count=$2, duplicated_count=$3,
                  failed_count=$4, last_stock_code=$5, updated_at=NOW()
            WHERE id=$6`,
          [processed, inserted, duplicated, failed, code, jobId]
        );
        console.log(`[backfill] 진행 ${processed}/${codes.length} (신규 ${inserted}, 중복 ${duplicated}, 실패 ${failed})`);
      }

      await sleep(DELAY_MS);
    }

    await query(
      `UPDATE disclosure_backfill_jobs
          SET status='done', processed_companies=$1, inserted_count=$2,
              duplicated_count=$3, failed_count=$4, finished_at=NOW(), updated_at=NOW()
        WHERE id=$5`,
      [processed, inserted, duplicated, failed, jobId]
    );
    console.log(`[backfill] 완료 job=${jobId} 신규 ${inserted}건`);
  } catch (err) {
    await query(
      `UPDATE disclosure_backfill_jobs SET status='failed', error_log=$1, updated_at=NOW() WHERE id=$2`,
      [err instanceof Error ? err.message : '알 수 없는 오류', jobId]
    );
    console.error(`[backfill] 실패 job=${jobId}:`, err);
  } finally {
    running = false;
  }
}

// jp: 단일 종목 10년치 backfill (관리자가 특정 종목만)
export async function backfillSingleStock(stockCode: string): Promise<{ inserted: number; duplicated: number }> {
  const r = await syncDisclosuresByStockCode(stockCode);
  return { inserted: r.newCount, duplicated: r.skipCount };
}
