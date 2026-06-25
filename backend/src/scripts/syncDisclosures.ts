// jp: 최신 공시 동기화 스크립트
// jp: 실행: npm run disclosure:sync

import { connectDB } from '../config/db';
import { connectRedis } from '../config/redis';
import { syncLatestDisclosures } from '../services/disclosure/disclosureSync.service';

async function main(): Promise<void> {
  console.log('=== 최신 공시 동기화 시작 ===');
  await connectDB();
  await connectRedis();

  try {
    const result = await syncLatestDisclosures();
    console.log('✅ 동기화 완료:');
    console.log(`   전체: ${result.total}건`);
    console.log(`   신규: ${result.newCount}건`);
    console.log(`   중복: ${result.skipCount}건`);
    console.log(`   중요: ${result.important}건`);
    console.log(`   에러: ${result.errorCount}건`);
  } catch (err) {
    console.error('❌ 동기화 실패:', err instanceof Error ? err.message : err);
    process.exit(1);
  }

  process.exit(0);
}

main();
