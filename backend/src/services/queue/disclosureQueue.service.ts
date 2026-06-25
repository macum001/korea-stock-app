// jp: 공시 큐 서비스
// jp: DART API 수집 → disclosure:fetch 큐 → Worker → disclosure:classify 큐 → Worker
// jp: 기존 스케줄러가 이 큐에 잡을 넣고, Worker가 실제 처리

import { Queue, Job } from 'bullmq';
import { createQueue, QUEUE_NAMES, QUEUE_DEFAULT_OPTIONS } from './queue.config';

// jp: 공시 수집 잡 데이터 타입
export interface DisclosureFetchJobData {
  corpCode?: string;    // jp: 특정 종목 (없으면 전체)
  pageNo?: number;
  syncDays?: number;
  triggeredBy: 'scheduler' | 'manual' | 'backfill';
}

// jp: 공시 분류 잡 데이터 타입
export interface DisclosureClassifyJobData {
  disclosureId: number;
  title: string;
  corpCode: string;
  forceReclassify?: boolean;
}

// jp: 싱글톤 큐 인스턴스
let disclosureFetchQueue: Queue | null = null;
let disclosureClassifyQueue: Queue | null = null;

export function getDisclosureFetchQueue(): Queue {
  if (!disclosureFetchQueue) {
    disclosureFetchQueue = createQueue(QUEUE_NAMES.DISCLOSURE_FETCH);
  }
  return disclosureFetchQueue;
}

export function getDisclosureClassifyQueue(): Queue {
  if (!disclosureClassifyQueue) {
    disclosureClassifyQueue = createQueue(QUEUE_NAMES.DISCLOSURE_CLASSIFY);
  }
  return disclosureClassifyQueue;
}

// ─────────────────────────────────────────
// jp: 공시 수집 잡 추가
// ─────────────────────────────────────────

// jp: 전체 공시 수집 잡 (스케줄러에서 호출)
export async function enqueueDisclosureFetch(
  data: DisclosureFetchJobData,
  options?: { priority?: number; delay?: number }
): Promise<Job> {
  const queue = getDisclosureFetchQueue();
  const jobId = data.corpCode
    ? `fetch:${data.corpCode}:${Date.now()}`
    : `fetch:all:${Date.now()}`;

  return queue.add('fetch', data, {
    ...QUEUE_DEFAULT_OPTIONS[QUEUE_NAMES.DISCLOSURE_FETCH],
    jobId,
    priority: options?.priority ?? 5,
    delay: options?.delay ?? 0,
  });
}

// jp: 개별 공시 분류 잡 추가 (수집 Worker에서 호출)
export async function enqueueDisclosureClassify(
  data: DisclosureClassifyJobData
): Promise<Job> {
  const queue = getDisclosureClassifyQueue();
  const jobId = `classify:${data.disclosureId}`;

  return queue.add('classify', data, {
    ...QUEUE_DEFAULT_OPTIONS[QUEUE_NAMES.DISCLOSURE_CLASSIFY],
    jobId,
    // jp: 동일 공시 중복 방지 (같은 jobId면 이미 있으면 건너뜀)
    skipIfExists: true,
  } as any);
}

// jp: 배치 분류 잡 추가 (reclassify all)
export async function enqueueDisclosureClassifyBatch(
  disclosures: DisclosureClassifyJobData[]
): Promise<void> {
  const queue = getDisclosureClassifyQueue();

  // jp: BullMQ addBulk - 한 번에 여러 잡 추가 (원자적)
  const jobs = disclosures.map((data) => ({
    name: 'classify',
    data,
    opts: {
      ...QUEUE_DEFAULT_OPTIONS[QUEUE_NAMES.DISCLOSURE_CLASSIFY],
      jobId: `classify:${data.disclosureId}`,
    },
  }));

  // jp: 500개씩 나눠서 추가 (Redis 부하 방지)
  const BATCH_SIZE = 500;
  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    await queue.addBulk(jobs.slice(i, i + BATCH_SIZE));
  }
  console.log(`[DisclosureQueue] 분류 잡 ${disclosures.length}개 추가됨`);
}

// jp: 큐 상태 조회 (모니터링용)
export async function getDisclosureQueueStats() {
  const fetchQueue = getDisclosureFetchQueue();
  const classifyQueue = getDisclosureClassifyQueue();

  const [fetchCounts, classifyCounts] = await Promise.all([
    fetchQueue.getJobCounts('waiting', 'active', 'completed', 'failed'),
    classifyQueue.getJobCounts('waiting', 'active', 'completed', 'failed'),
  ]);

  return {
    fetch: fetchCounts,
    classify: classifyCounts,
  };
}

// jp: 큐 정리 (종료 시)
export async function closeDisclosureQueues(): Promise<void> {
  await Promise.allSettled([
    disclosureFetchQueue?.close(),
    disclosureClassifyQueue?.close(),
  ]);
  disclosureFetchQueue = null;
  disclosureClassifyQueue = null;
}
