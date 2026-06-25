// jp: 장마감 snapshot 확정 스케줄러
// jp: CLOSED/AFTER_HOURS를 NO_DATA로 보지 않도록 Redis live 값을 DB market_snapshots에 주기적으로 고정한다.

import cron from 'node-cron';
import { getMarketStatus } from '../utils/marketTime';
import { finalizeAllMarketSnapshots } from '../services/market/marketSnapshot.service';

let task: cron.ScheduledTask | null = null;
let running = false;

async function runFinalize(status = getMarketStatus()): Promise<void> {
  if (running) return;
  if (status !== 'AFTER_HOURS' && status !== 'CLOSED') return;
  running = true;
  try {
    const result = await finalizeAllMarketSnapshots(status);
    if (result.finalized > 0) {
      console.log(`[MarketSnapshotFinalize] ${status} snapshot 확정: ${result.finalized}종목`);
    }
  } catch (err) {
    console.error('[MarketSnapshotFinalize] 실패:', err instanceof Error ? err.message : err);
  } finally {
    running = false;
  }
}

export function startMarketSnapshotFinalizeJob(): void {
  if (task) return;
  // jp: KST 기준 15:31~18:10 사이 5분마다 snapshot 확정. 서버 timezone과 무관하게 내부에서 KST status 판단.
  task = cron.schedule('*/5 15-18 * * 1-5', () => { void runFinalize(); }, { timezone: 'Asia/Seoul' });
  console.log('[MarketSnapshotFinalize] job started');
}

export function stopMarketSnapshotFinalizeJob(): void {
  if (!task) return;
  task.stop();
  task = null;
}

export async function runMarketSnapshotFinalizeOnce(): Promise<void> {
  await runFinalize('CLOSED');
}
