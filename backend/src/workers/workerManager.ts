// jp: Worker 매니저 - server.ts에서 호출

import { Worker } from 'bullmq';
import { createDisclosureFetchWorker, createDisclosureClassifyWorker } from './disclosure.worker';
import { createPriceFetchWorker } from './price.worker';

let workers: Worker[] = [];

export function startAllWorkers(): void {
  if (workers.length > 0) return; // jp: 중복 시작 방지

  workers = [
    createDisclosureFetchWorker(),
    createDisclosureClassifyWorker(),
    createPriceFetchWorker(),
  ];

  console.log('[WorkerManager] ✅ BullMQ Worker 3개 시작됨');
  console.log('  - disclosure:fetch (concurrency=1)');
  console.log('  - disclosure:classify (concurrency=10)');
  console.log('  - price:fetch (concurrency=5)');
}

export async function stopAllWorkers(): Promise<void> {
  await Promise.allSettled(workers.map(w => w.close()));
  workers = [];
  console.log('[WorkerManager] ✅ 모든 Worker 종료됨');
}

export function getWorkerStatus() {
  return workers.map(w => ({
    name: w.name,
    isRunning: w.isRunning(),
    isPaused: w.isPaused(),
  }));
}
