// jp: corp_code 동기화 스크립트
// jp: 실행: npm run dart:sync-companies

import { connectDB } from '../config/db';
import { connectRedis } from '../config/redis';
import { syncDartCompanies } from '../services/disclosure/dartCompany.service';

async function main(): Promise<void> {
  console.log('=== DART 기업 코드 동기화 시작 ===');
  await connectDB();
  await connectRedis();

  try {
    const result = await syncDartCompanies();
    console.log('✅ 동기화 완료:');
    console.log(`   전체: ${result.total}개`);
    console.log(`   저장: ${result.saved}개`);
    console.log(`   건너뜀: ${result.skipped}개`);
  } catch (err) {
    console.error('❌ 동기화 실패:', err instanceof Error ? err.message : err);
    process.exit(1);
  }

  process.exit(0);
}

main();
