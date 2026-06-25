// jp: Redis 실시간 캐시 벤치마크 스크립트
// jp: 사용법: npm run benchmark:realtime-cache -- 005930 10000

import 'dotenv/config';
import { connectRedis } from '../config/redis';
import { appendTradeFast, writeOrderbookFast, getRecentTradesFast, getRealtimeCacheStats } from '../services/cache/marketRealtimeCache.service';

async function main() {
  const code = process.argv[2] || '005930';
  const ticks = Math.min(Math.max(parseInt(process.argv[3] || '10000', 10) || 10000, 100), 200000);
  await connectRedis();

  const started = Date.now();
  for (let i = 0; i < ticks; i++) {
    const price = 70000 + (i % 100);
    await appendTradeFast(code, {
      code,
      time: new Date().toISOString(),
      price,
      volume: 1 + (i % 50),
      change: i % 10,
      side: i % 2 === 0 ? 'buy' : 'sell',
      providerTimestamp: Date.now(),
      backendReceivedAt: Date.now(),
    });
    if (i % 10 === 0) {
      await writeOrderbookFast(code, {
        code,
        ask: Array.from({ length: 10 }, (_, idx) => ({ price: price + idx + 1, volume: 1000 - idx })),
        bid: Array.from({ length: 10 }, (_, idx) => ({ price: price - idx - 1, volume: 1000 + idx })),
        totalAskVolume: 10000,
        totalBidVolume: 10000,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  const totalMs = Date.now() - started;
  const recent = await getRecentTradesFast(code, 5000);
  const stats = await getRealtimeCacheStats();
  console.log(JSON.stringify({
    code,
    ticks,
    totalMs,
    ticksPerSecond: Math.round((ticks / Math.max(totalMs, 1)) * 1000),
    recentTradesKept: recent.length,
    stats,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
