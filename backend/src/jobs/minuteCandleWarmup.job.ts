// jp: 분봉 워밍 스케줄러
// jp: 주요 종목 분봉을 미리 DB에 채워서 사용자 첫 진입 시 빠르게
// jp: 장중: 5분마다 주요 종목 갱신 / 장 마감 후(15:40): 1회 전체 백필

import cron from 'node-cron';
import { getMinuteCandles } from '../services/kis/kisRest.service';
import { saveMinuteCandles, cleanupOldMinuteCandles } from '../repositories/minuteCandle.repository';
import { MAJOR_STOCK_CODES_UNIQUE } from '../data/majorStocks';
import { ENV } from '../config/env';
import { isDbReady } from '../config/db';

let intradayTask: cron.ScheduledTask | null = null;
let closeTask: cron.ScheduledTask | null = null;

// jp: 장중 여부 (평일 9~15:30)
function isMarketHours(): boolean {
  const now = new Date();
  const day = now.getDay();
  if (day === 0 || day === 6) return false;
  const time = now.getHours() * 100 + now.getMinutes();
  return time >= 900 && time <= 1530;
}

// jp: 주요 종목 분봉 수집 → DB 저장 (rate limit 고려 순차)
async function warmupMajorStocks(): Promise<void> {
  if (!isDbReady()) return;
  if (ENV.USE_MOCK_DATA) return;

  // jp: 너무 많으면 부담 → 주요 종목 상위 일부만 (예: 20개)
  const codes = MAJOR_STOCK_CODES_UNIQUE.slice(0, 20);
  let saved = 0;

  for (const code of codes) {
    try {
      const candles = await getMinuteCandles(code);
      if (candles.length > 0) {
        await saveMinuteCandles(code, candles);
        saved++;
      }
      // jp: 종목 간 간격 (KIS rate limit) - getMinuteCandles 내부에도 limiter 있음
      await new Promise(r => setTimeout(r, 500));
    } catch { /* 개별 실패 무시 */ }
  }

  console.log(`[분봉워밍] 주요 종목 ${saved}개 DB 갱신 완료`);
}

export function startMinuteCandleWarmupJob(): void {
  if (ENV.USE_MOCK_DATA) {
    console.log('[분봉워밍] USE_MOCK_DATA=true → 비활성');
    return;
  }

  // jp: 장중 5분마다 주요 종목 갱신
  intradayTask = cron.schedule('*/5 * * * *', async () => {
    if (isMarketHours()) {
      await warmupMajorStocks();
    }
  });

  // jp: 장 마감 후 15:40 - 당일 최종 분봉 백필 + 오래된 데이터 정리
  closeTask = cron.schedule('40 15 * * 1-5', async () => {
    console.log('[분봉워밍] 장 마감 후 백필 시작');
    await warmupMajorStocks();
    await cleanupOldMinuteCandles(7); // jp: 7일 이전 분봉 삭제
    console.log('[분봉워밍] 장 마감 후 백필 완료');
  });

  console.log('[분봉워밍] 스케줄러 시작 (장중 5분 / 마감후 15:40)');
}

export function stopMinuteCandleWarmupJob(): void {
  if (intradayTask) { intradayTask.stop(); intradayTask = null; }
  if (closeTask) { closeTask.stop(); closeTask = null; }
}
