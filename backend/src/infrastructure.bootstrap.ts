// jp: 인프라 부트스트랩 - server.ts에서 호출
// jp: BullMQ Worker + Redis Pub/Sub + WS 브로드캐스트 초기화
//
// jp: 사용법 (server.ts에 추가):
//   import { bootstrapInfrastructure, shutdownInfrastructure } from './infrastructure.bootstrap';
//   import { WebSocketServer } from 'ws';
//
//   const wss = new WebSocketServer({ server: httpServer });
//   await bootstrapInfrastructure(wss);
//
//   process.on('SIGTERM', async () => {
//     await shutdownInfrastructure();
//     process.exit(0);
//   });

import { WebSocketServer } from 'ws';
import { startAllWorkers, stopAllWorkers } from './workers/workerManager';
import { initWsBroadcast } from './services/ws/wsBroadcast.service';
import { closePubSub } from './services/pubsub/redisPubSub.service';
import { closeDisclosureQueues } from './services/queue/disclosureQueue.service';
import { closePriceQueue } from './services/queue/priceQueue.service';

export async function bootstrapInfrastructure(wss: WebSocketServer): Promise<void> {
  console.log('[Bootstrap] 인프라 초기화 시작...');

  // jp: 1. WS 브로드캐스트 서비스 (Redis Pub/Sub 구독 포함)
  await initWsBroadcast(wss);
  console.log('[Bootstrap] ✅ WS 브로드캐스트 초기화됨');

  // jp: 2. BullMQ Worker 시작
  startAllWorkers();
  console.log('[Bootstrap] ✅ BullMQ Worker 시작됨');

  console.log('[Bootstrap] 🚀 인프라 초기화 완료');
}

export async function shutdownInfrastructure(): Promise<void> {
  console.log('[Bootstrap] 인프라 종료 중...');

  await Promise.allSettled([
    stopAllWorkers(),
    closePubSub(),
    closeDisclosureQueues(),
    closePriceQueue(),
  ]);

  console.log('[Bootstrap] ✅ 인프라 정상 종료됨');
}
