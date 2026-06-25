// marketBriefing.job.ts
// 시황 브리핑 자동 생성 + 알림 (하루 5번, slot별)
// 06:00 / 08:40 / 11:50 / 15:40 / 22:50 KST
// 알림은 notifyBriefing 내부에서 08:40/11:50/15:40만 발송

import cron from 'node-cron';
import { runBriefingCollection } from '../services/briefing/briefingCollector.service';
import { runBriefingAI } from '../services/briefing/briefingAI.service';
import { notifyBriefing } from '../services/briefing/briefingNotify.service';
import { getBriefingByDateSlot, getKstDate } from '../repositories/briefing.repository';
import { ENV } from '../config/env';

const BRIEFING_TIMES = [
  { cron: '0 6 * * *',   slot: '0600', label: '06:00' },
  { cron: '40 8 * * *',  slot: '0840', label: '08:40' },
  { cron: '50 11 * * *', slot: '1150', label: '11:50' },
  { cron: '40 15 * * *', slot: '1540', label: '15:40' },
  { cron: '50 22 * * *', slot: '2250', label: '22:50' },
];

let tasks: cron.ScheduledTask[] = [];

async function runBriefingCycle(slot: string, label: string): Promise<void> {
  console.log(`[브리핑잡] ${label}(${slot}) 브리핑 생성 시작`);
  try {
    const collectResult = await runBriefingCollection(slot);
    if (!collectResult.success || !collectResult.briefing) {
      console.error(`[브리핑잡] ${label} 수집 실패: ${collectResult.message}`);
      return;
    }
    if (collectResult.briefing.status === 'completed') {
      console.log(`[브리핑잡] ${label} 이미 완료, AI 스킵`);
      // jp: 이미 완료된 거라도 알림은 한 번 시도 (중복 방지는 추후)
      await notifyBriefing(collectResult.briefing);
      return;
    }

    const aiResult = await runBriefingAI(collectResult.briefing);
    if (!aiResult.success) {
      console.error(`[브리핑잡] ${label} AI 분석 실패: ${aiResult.message}`);
      return;
    }
    console.log(`[브리핑잡] ${label} 완료 (status=${aiResult.analysis?.status}, 중요=${aiResult.analysis?.is_important})`);

    // jp: AI 분석 완료된 최신 brief를 다시 읽어서 알림 발송
    const today = getKstDate();
    const finalBriefing = await getBriefingByDateSlot(today, slot);
    if (finalBriefing) {
      await notifyBriefing(finalBriefing);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[브리핑잡] ${label} 사이클 오류:`, msg);
  }
}

export function startMarketBriefingJob(): void {
  if (ENV.USE_MOCK_DATA) {
    console.log('[브리핑잡] USE_MOCK_DATA=true → 비활성');
    return;
  }
  for (const t of BRIEFING_TIMES) {
    const task = cron.schedule(
      t.cron,
      () => { void runBriefingCycle(t.slot, t.label); },
      { timezone: 'Asia/Seoul' }
    );
    tasks.push(task);
  }
  const times = BRIEFING_TIMES.map(t => t.label).join(' / ');
  console.log(`[브리핑잡] 시황 브리핑 스케줄러 시작 (${times}, 알림: 08:40/11:50/15:40)`);
}

export function stopMarketBriefingJob(): void {
  for (const task of tasks) task.stop();
  tasks = [];
}
