// jp: 일봉 10년치 백필 스크립트
// jp: 수정: Redis 연결 추가 → 토큰 캐시 활용 (1분당 1회 제한 해소)
// jp: 실행: npx ts-node src/scripts/backfillDailyCandles.ts [종목코드]

import { connectDB, isDbReady } from '../config/db';
import { connectRedis } from '../config/redis';
import { getKisToken } from '../services/kis/kisAuth.service';
import { getChartCandles } from '../services/kis/kisRest.service';
import { saveDailyCandles } from '../repositories/dailyCandle.repository';
import { MAJOR_STOCK_CODES_UNIQUE } from '../data/majorStocks';

const TARGET_CODES = process.argv[2]
  ? [process.argv[2]]
  : MAJOR_STOCK_CODES_UNIQUE.slice(0, 20);

async function backfillOne(code: string): Promise<void> {
  console.log(`\n[백필] ${code} 시작...`);
  try {
    const candles = await getChartCandles(code, 'D', true);
    if (candles.length === 0) {
      console.log(`[백필] ${code} 데이터 없음 — 스킵`);
      return;
    }
    const saved = await saveDailyCandles(code, candles, 'D');
    const oldest = new Date(candles[0].time * 1000).toISOString().slice(0, 10);
    const newest = new Date(candles[candles.length - 1].time * 1000).toISOString().slice(0, 10);
    console.log(`[백필] ${code} 완료 — ${saved}개 저장 (${oldest} ~ ${newest})`);
  } catch (err) {
    console.error(`[백필] ${code} 실패:`, err instanceof Error ? err.message : err);
  }
}

async function main(): Promise<void> {
  console.log('=== 일봉 백필 시작 ===');
  console.log(`대상 종목: ${TARGET_CODES.join(', ')}`);

  // jp: 1. DB + Redis 연결 (Redis 필수 — 토큰 캐시용)
  await connectDB();
  await connectRedis();

  if (!isDbReady()) {
    console.error('DB 연결 실패 — 종료');
    process.exit(1);
  }

  // jp: 2. 토큰 선발급 (Redis에 캐시 저장)
  console.log('\n[토큰] KIS 토큰 선발급 중...');
  try {
    await getKisToken();
    console.log('[토큰] 발급 완료 — Redis에 캐시됨');
  } catch (err) {
    console.error('[토큰] 발급 실패:', err instanceof Error ? err.message : err);
    process.exit(1);
  }

  // jp: 3. 토큰 발급 후 65초 대기 (KIS 1분당 1회 제한)
  console.log('[대기] KIS rate limit 준수를 위해 65초 대기...');
  await new Promise(r => setTimeout(r, 65000));

  // jp: 4. 종목별 백필 (이후 요청은 캐시된 토큰 사용)
  for (let i = 0; i < TARGET_CODES.length; i++) {
    const code = TARGET_CODES[i];
    await backfillOne(code);
    // jp: 종목 사이 3초 대기 (KIS rate limit 준수)
    if (i < TARGET_CODES.length - 1) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  console.log('\n=== 백필 완료 ===');
  process.exit(0);
}

main().catch(err => {
  console.error('백필 실패:', err);
  process.exit(1);
});
