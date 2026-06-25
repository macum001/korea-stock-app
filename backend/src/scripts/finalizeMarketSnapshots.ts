// jp: 운영자가 장마감 snapshot을 수동 확정할 때 사용하는 스크립트
// jp: 실행: npm run snapshot:finalize -- CLOSED

import { connectDB } from '../config/db';
import { connectRedis } from '../config/redis';
import { finalizeAllMarketSnapshots } from '../services/market/marketSnapshot.service';

async function main(): Promise<void> {
  const status = String(process.argv[2] || 'CLOSED');
  await connectDB();
  await connectRedis();
  const result = await finalizeAllMarketSnapshots(status);
  console.log(`[snapshot:finalize] status=${status}, finalized=${result.finalized}`);
  if (result.codes.length > 0) {
    console.log(`[snapshot:finalize] codes=${result.codes.join(',')}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[snapshot:finalize] failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
