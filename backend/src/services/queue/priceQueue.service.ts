// jp: 시세 수집 큐 서비스
// jp: KIS API 시세 요청을 큐로 관리
// jp: 배치 단위로 묶어서 처리 → Rate Limit 준수 + 병렬화

import { Queue, Job } from 'bullmq';
import { createQueue, QUEUE_NAMES, QUEUE_DEFAULT_OPTIONS } from './queue.config';

// jp: 시세 수집 잡 데이터 타입
export interface PriceFetchJobData {
  codes: string[];        // jp: 종목코드 배열 (최대 20개/배치)
  batchIndex: number;     // jp: 배치 번호 (로깅용)
  totalBatches: number;
  triggeredBy: 'scheduler' | 'realtime' | 'manual';
}

// jp: 싱글톤 큐
let priceFetchQueue: Queue | null = null;

export function getPriceFetchQueue(): Queue {
  if (!priceFetchQueue) {
    priceFetchQueue = createQueue(QUEUE_NAMES.PRICE_FETCH);
  }
  return priceFetchQueue;
}

// ─────────────────────────────────────────
// jp: 시세 배치 잡 추가
// ─────────────────────────────────────────
export async function enqueuePriceFetchBatch(
  allCodes: string[],
  triggeredBy: PriceFetchJobData['triggeredBy'] = 'scheduler'
): Promise<void> {
  const queue = getPriceFetchQueue();
  const BATCH_SIZE = 20; // jp: KIS API 한 번에 최대 20종목

  // jp: 20개씩 배치로 나눔
  const batches: string[][] = [];
  for (let i = 0; i < allCodes.length; i += BATCH_SIZE) {
    batches.push(allCodes.slice(i, i + BATCH_SIZE));
  }

  // jp: 배치별 잡 생성
  const jobs = batches.map((codes, idx) => ({
    name: 'fetch-batch',
    data: {
      codes,
      batchIndex: idx,
      totalBatches: batches.length,
      triggeredBy,
    } as PriceFetchJobData,
    opts: {
      ...QUEUE_DEFAULT_OPTIONS[QUEUE_NAMES.PRICE_FETCH],
      jobId: `price:batch:${idx}:${Date.now()}`,
      // jp: 배치 간 50ms 딜레이 (API 과부하 방지)
      delay: idx * 50,
    },
  }));

  await queue.addBulk(jobs);
  console.log(`[PriceQueue] 시세 배치 ${batches.length}개 추가 (총 ${allCodes.length}종목)`);
}

// jp: 단일 종목 즉시 시세 조회 잡 (상세 페이지 진입 시)
export async function enqueuePriceFetchSingle(
  code: string,
  priority: number = 1  // jp: 높은 우선순위
): Promise<Job> {
  const queue = getPriceFetchQueue();
  return queue.add(
    'fetch-single',
    { codes: [code], batchIndex: 0, totalBatches: 1, triggeredBy: 'realtime' } as PriceFetchJobData,
    {
      priority,
      attempts: 3,
      removeOnComplete: { count: 20 },
      removeOnFail: { count: 10 },
    }
  );
}

// jp: 큐 상태 조회
export async function getPriceQueueStats() {
  const queue = getPriceFetchQueue();
  return queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
}

export async function closePriceQueue(): Promise<void> {
  await priceFetchQueue?.close();
  priceFetchQueue = null;
}
