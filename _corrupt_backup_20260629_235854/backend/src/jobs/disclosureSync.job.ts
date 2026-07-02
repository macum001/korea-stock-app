// jp: 공시 수집 스케줄러 - node-cron + BullMQ 큐 (적응형 주기)
// jp: 30초마다 깨어나 "현재 시간대 주기"에 도달했을 때만 실제 수집 -> 피크 촘촘, 심야 느슨
import cron from 'node-cron';
import { syncLatestDisclosures } from '../services/disclosure/disclosureSync.service';
import { syncDartCompanies, getDartCompanyCount } from '../services/disclosure/dartCompany.service';
import { enqueueDisclosureFetch } from '../services/queue/disclosureQueue.service';

let task: cron.ScheduledTask | null = null;
let lastRunAt = 0;

// jp: KST 벽시계 값 얻기 (서버 타임존 무관 - 한국은 DST 없음)
function kstNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
}

// jp: 현재 시간대별 수집 주기(초). 공시는 장전/장후에 몰리고 심야/주말엔 거의 없음.
function getIntervalSecForNow(): number {
  // jp: 환경변수로 고정값 강제 시 적응형 OFF (하위호환). .env에 있으면 제거해야 적응형 작동.
  const forced = process.env.DISCLOSURE_SYNC_INTERVAL_MINUTES;
  if (forced) return Math.max(1, parseInt(forced, 10)) * 60;

  const d = kstNow();
  const day = d.getDay();                 // jp: 0=일, 6=토
  const t = d.getHours() * 60 + d.getMinutes();
  const inRange = (a: number, b: number) => t >= a && t < b;

  if (day === 0 || day === 6) return 600;            // jp: 주말 10분
  if (inRange(7 * 60, 9 * 60)) return 30;            // jp: 장전 집중 30초
  if (inRange(9 * 60, 15 * 60 + 30)) return 60;      // jp: 장중 1분
  if (inRange(15 * 60 + 30, 18 * 60 + 30)) return 30; // jp: 장후 수시공시 폭주 30초
  if (inRange(18 * 60 + 30, 22 * 60)) return 180;    // jp: 저녁 3분
  return 600;                                         // jp: 심야 10분
}

// jp: 큐에 잡 추가 (Worker가 실제 처리), 실패 시 직접 실행 폴백
async function runSync(): Promise<void> {
  try {
    console.log('[Job] 공시 수집 잡 큐에 추가...');
    await enqueueDisclosureFetch({ triggeredBy: 'scheduler' });
  } catch (err) {
    console.warn('[Job] 큐 추가 실패 - 직접 실행 폴백:', (err as Error).message);
    try {
      console.log('[Job] 공시 수집 시작 (직접)...');
      const result = await syncLatestDisclosures();
      console.log(`[Job] 공시 수집 완료 - 신규 ${result.newCount}건`);
    } catch (e) {
      console.error('[Job] 공시 수집 실패:', e instanceof Error ? e.message : e);
    }
  }
}

// jp: 30초마다 호출되지만, 현재 시간대 주기에 도달했을 때만 실제 수집
async function maybeRun(): Promise<void> {
  const intervalMs = getIntervalSecForNow() * 1000;
  if (Date.now() - lastRunAt < intervalMs) return;   // jp: 아직 때가 아님 - skip
  lastRunAt = Date.now();
  await runSync();
}

export function startDisclosureSyncJob(): void {
  // jp: 6-field cron (초 단위) - 30초마다 깨어남
  task = cron.schedule('*/30 * * * * *', maybeRun);
  console.log('[Job] 공시 수집 스케줄러 시작 (적응형: 피크 30초 ~ 심야 10분)');

  // jp: 시작 시 corp_code 확인 후 즉시 1회 수집
  void (async () => {
    try {
      const count = await getDartCompanyCount();
      if (count < 100) {
        console.log(`[DART] dart_companies ${count}개 - corp_code 동기화 시작 (공시 수집 전제조건)`);
        const r = await syncDartCompanies();
        console.log(`[DART] corp_code 동기화 완료 - 상장사 ${r.saved}개 저장`);
      } else {
        console.log(`[DART] dart_companies 이미 ${count}개 보유 - corp_code 동기화 생략`);
      }
    } catch (err) {
      console.error('[DART] corp_code 동기화 실패:', err instanceof Error ? err.message : err);
    }
    lastRunAt = Date.now();   // jp: 즉시 수집 직전 기록 (직후 maybeRun 중복 방지)
    runSync();
  })();
}

export function stopDisclosureSyncJob(): void {
  if (task) {
    task.stop();
    task = null;
    console.log('[Job] 공시 수집 스케줄러 중지');
  }
}
