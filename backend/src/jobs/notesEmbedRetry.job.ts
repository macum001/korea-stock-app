// ============================================================
// jp: 주석 임베딩 실패/부분/ghost-done 자동 재처리 잡
// jp: 위치: backend/src/jobs/notesEmbedRetry.job.ts
// jp: 등록: server.ts 또는 jobs 초기화에서 startNotesEmbedRetryJob() 호출
// jp: 동작: 10분마다 failed/partial/pending/ghost-done 상태 임베딩을 자동 재시도
// jp: ghost-done = status=done인데 실제 임베딩이 없는 공시 (pre-split 삭제 후 발생)
// ============================================================
import cron from 'node-cron';
import { retryFailedEmbeddings } from '../services/ai/notesEmbedding.service';

let task: ReturnType<typeof cron.schedule> | null = null;
// jp: 중복 실행 방지 플래그 (cron 겹침 방어 - 임베딩은 오래 걸릴 수 있음)
let isRunning = false;

export function startNotesEmbedRetryJob(): void {
  if (task) return; // jp: 중복 시작 방지

  // jp: 10분마다 실행 (한 번에 최대 5건씩 재처리)
  // jp: ghost-done 포함 — status=done인데 실제 임베딩 없는 공시도 재처리
  task = cron.schedule('*/10 * * * *', async () => {
    // jp: 이전 실행이 아직 끝나지 않으면 스킵 (Voyage API 호출이 길어질 수 있음)
    if (isRunning) {
      console.warn('[NotesEmbedRetry] 이전 실행 중 - 이번 회차 스킵');
      return;
    }
    isRunning = true;
    try {
      const r = await retryFailedEmbeddings(5);
      if (r.processed > 0) {
        console.log(`[NotesEmbedRetry] 재처리 ${r.processed}건 시도, ${r.recovered}건 복구`);
      }
    } catch (err) {
      // jp: 잡 자체가 터져도 isRunning 해제 보장 (finally) + 서버 전체에 영향 없음
      console.warn('[NotesEmbedRetry] 실행 오류:', err instanceof Error ? err.message : err);
    } finally {
      isRunning = false;
    }
  }, { timezone: 'Asia/Seoul' });

  console.log('[NotesEmbedRetry] 주석 임베딩 재처리 스케줄러 시작 (10분 간격, ghost-done 포함)');
}

export function stopNotesEmbedRetryJob(): void {
  if (task) {
    task.stop();
    task = null;
  }
}
