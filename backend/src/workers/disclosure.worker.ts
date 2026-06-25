// jp: 공시 수집 Worker - BullMQ 큐에서 잡을 꺼내 실제 처리
// jp: 기존 disclosureSync.service + dartCompany.service 재사용

import { Worker, Job } from 'bullmq';
import { redisConnection, QUEUE_NAMES } from '../services/queue/queue.config';
import { DisclosureFetchJobData, DisclosureClassifyJobData } from '../services/queue/disclosureQueue.service';
import { syncLatestDisclosures } from '../services/disclosure/disclosureSync.service';
import { syncDartCompanies, getDartCompanyCount } from '../services/disclosure/dartCompany.service';

// ─────────────────────────────────────────
// jp: 공시 수집 Worker
// ─────────────────────────────────────────
export function createDisclosureFetchWorker() {
  const worker = new Worker<DisclosureFetchJobData>(
    QUEUE_NAMES.DISCLOSURE_FETCH,
    async (job: Job<DisclosureFetchJobData>) => {
      const { triggeredBy } = job.data;
      console.log(`[DisclosureWorker] 수집 시작 (triggeredBy=${triggeredBy})`);

      await job.updateProgress(10);

      // jp: corp_code 없으면 먼저 동기화
      const count = await getDartCompanyCount();
      if (count < 100) {
        console.log(`[DisclosureWorker] dart_companies ${count}개 - corp_code 동기화 먼저`);
        await syncDartCompanies();
      }

      await job.updateProgress(30);

      // jp: 기존 공시 수집 함수 그대로 호출
      const result = await syncLatestDisclosures();

      await job.updateProgress(100);
      console.log(`[DisclosureWorker] 수집 완료 - 신규 ${result.newCount}건`);

      return { newCount: result.newCount };
    },
    {
      connection: redisConnection,
      concurrency: 1,         // jp: 공시 수집은 순차 처리 (DART API 부하 방지)
      limiter: {
        max: 5,
        duration: 60_000,     // jp: 분당 최대 5회
      },
    }
  );

  worker.on('completed', (job, result) => {
    console.log(`[DisclosureWorker] ✅ 완료 - jobId=${job.id}, 신규=${result?.newCount ?? 0}건`);
  });
  worker.on('failed', (job, err) => {
    console.error(`[DisclosureWorker] ❌ 실패 - jobId=${job?.id}:`, err.message);
  });

  return worker;
}

// ─────────────────────────────────────────
// jp: 공시 분류 Worker (reclassify 큐 처리)
// ─────────────────────────────────────────
export function createDisclosureClassifyWorker() {
  const worker = new Worker<DisclosureClassifyJobData>(
    QUEUE_NAMES.DISCLOSURE_CLASSIFY,
    async (job: Job<DisclosureClassifyJobData>) => {
      const { disclosureId, title } = job.data;

      // jp: 분류 로직은 기존 classifyDisclosure 함수 재사용
      // jp: 실제 import 경로는 프로젝트에 맞게 조정
      // const flags = classifyDisclosure(title);
      // await disclosureRepository.updateFlags(disclosureId, flags);

      console.log(`[ClassifyWorker] 분류 - id=${disclosureId}, title=${title.slice(0, 20)}`);
    },
    {
      connection: redisConnection,
      concurrency: 10,
    }
  );

  worker.on('failed', (job, err) => {
    console.error(`[ClassifyWorker] ❌ 실패 - jobId=${job?.id}:`, err.message);
  });

  return worker;
}
