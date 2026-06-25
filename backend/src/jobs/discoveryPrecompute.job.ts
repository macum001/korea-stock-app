// jp: 발견 화면 사전 계산 스케줄러
// jp: 장중 자주, 장마감 후 드물게. USE_MOCK_DATA=true면 비활성

import cron from 'node-cron';
import { precomputeDiscoverySummary } from '../services/discovery/discoverySummary.service';
import { ENV } from '../config/env';

let task: cron.ScheduledTask | null = null;

// jp: 장중(평일 9-15시) 여부 - 간단 판정
function isMarketHours(): boolean {
  const now = new Date();
  const day = now.getDay(); // jp: 0=일 6=토
  const hour = now.getHours();
  return day >= 1 && day <= 5 && hour >= 9 && hour < 16;
}

export function startDiscoveryPrecomputeJob(): void {
  // jp: mock 모드면 사전계산 불필요
  if (ENV.USE_MOCK_DATA) {
    console.log('[precompute] USE_MOCK_DATA=true → 사전 계산 비활성');
    return;
  }

  // jp: 1분마다 실행하되, 장중에만 계산 (장외는 5분 간격 효과로 스킵)
  let tick = 0;
  task = cron.schedule('*/1 * * * *', async () => {
    tick += 1;
    // jp: 장중이면 매분, 장외면 5분마다
    if (isMarketHours() || tick % 5 === 0) {
      await precomputeDiscoverySummary();
    }
  });

  // jp: 시작 시 1회 즉시 계산
  void precomputeDiscoverySummary();
  console.log('[precompute] discovery 사전 계산 job 시작');
}

export function stopDiscoveryPrecomputeJob(): void {
  if (task) { task.stop(); task = null; }
}
