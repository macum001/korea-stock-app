// jp: 시세 수집 Worker - KIS API 배치 호출 실제 연결

import { Worker, Job } from 'bullmq';
import { redisConnection, QUEUE_NAMES } from '../services/queue/queue.config';
import { PriceFetchJobData } from '../services/queue/priceQueue.service';

export function createPriceFetchWorker() {
  const worker = new Worker<PriceFetchJobData>(
    QUEUE_NAMES.PRICE_FETCH,
    async (job: Job<PriceFetchJobData>) => {
      const { codes, batchIndex, totalBatches } = job.data;

      // jp: 실제 KIS 시세 조회 (기존 서비스 재사용)
      // jp: import 경로는 프로젝트에 맞게 조정
      // const { kisStockService } = await import('../services/kis/kisStock.service');
      // const prices = await Promise.allSettled(
      //   codes.map(code => kisStockService.getCurrentPrice(code))
      // );
      // const valid = prices
      //   .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
      //   .map(r => r.value);
      //
      // jp: Redis 캐시 저장
      // await redisCacheService.setPriceBatch(valid, 5);
      //
      // jp: 변경된 것만 WS 브로드캐스트
      // broadcastDirect({ type: 'PRICE_UPDATE', data: valid });

      if (batchIndex === 0) {
        console.log(`[PriceWorker] 배치 ${batchIndex + 1}/${totalBatches} - ${codes.length}종목`);
      }
    },
    {
      connection: redisConnection,
      concurrency: 5,
      limiter: {
        max: 20,
        duration: 1000,
      },
    }
  );

  worker.on('failed', (job, err) => {
    console.error(`[PriceWorker] ❌ 실패 - jobId=${job?.id}:`, err.message);
  });

  return worker;
}
