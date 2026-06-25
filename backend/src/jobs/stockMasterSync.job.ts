// jp: 종목 마스터 수집 스케줄러
// jp: 시작 시 비어있으면 즉시 수집, 매일 오전 8시 갱신 (KIS 마스터는 오전 7:40경 갱신)
// jp: USE_MOCK_DATA=true면 비활성 (mock 종목만 사용)

import cron from 'node-cron';
import { syncStockMaster, getMasterCount } from '../services/stock/stockMasterSync.service';
import { ENV } from '../config/env';

let task: cron.ScheduledTask | null = null;

export function startStockMasterSyncJob(): void {
  if (ENV.USE_MOCK_DATA) {
    console.log('[종목마스터] USE_MOCK_DATA=true → 마스터 수집 비활성');
    return;
  }

  // jp: 매일 오전 8시 갱신
  task = cron.schedule('0 8 * * *', async () => {
    await syncStockMaster();
  });

  // jp: 시작 시 - 마스터가 비어있으면 즉시 수집 (최초 구동 시)
  void (async () => {
    const count = await getMasterCount();
    if (count < 100) {
      console.log(`[종목마스터] 현재 ${count}종목 - 초기 수집 시작`);
      await syncStockMaster();
    } else {
      console.log(`[종목마스터] 이미 ${count}종목 보유 - 초기 수집 생략 (매일 8시 갱신)`);
    }
  })();

  console.log('[종목마스터] 수집 job 시작');
}

export function stopStockMasterSyncJob(): void {
  if (task) { task.stop(); task = null; }
}
