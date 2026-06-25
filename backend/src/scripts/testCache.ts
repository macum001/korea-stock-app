// jp: 공시 캐시 테스트 스크립트
// jp: 실행: npm run test:disclosure-cache

import { connectRedis, redis } from '../config/redis';
import {
  cacheLatestDisclosures,
  getLatestDisclosuresFromCache,
  cacheStockDisclosures,
  getStockDisclosuresFromCache,
  invalidateDisclosureCaches,
} from '../services/disclosure/disclosureCache.service';
import { MOCK_DISCLOSURES } from '../mocks/mockDisclosures';

async function main(): Promise<void> {
  console.log('=== 공시 캐시 테스트 ===\n');

  await connectRedis();

  // jp: 1. Redis 연결 확인
  const isReady = redis.isReady;
  console.log('1. Redis 연결:', isReady ? '✅ 연결됨' : '⚠️  미연결 (캐시 동작 안 함)');

  if (!isReady) {
    console.log('   Redis가 없어도 앱은 동작하지만, 캐시 테스트는 건너뜁니다.');
    process.exit(0);
  }

  // jp: 2. 최신 공시 캐시 저장/조회
  console.log('\n2. 최신 공시 캐시:');
  await cacheLatestDisclosures(MOCK_DISCLOSURES);
  const cached = await getLatestDisclosuresFromCache();
  console.log(`   저장: ${MOCK_DISCLOSURES.length}건`);
  console.log(`   조회: ${cached?.length ?? 0}건`);
  console.log(`   ${cached?.length === MOCK_DISCLOSURES.length ? '✅ 일치' : '❌ 불일치'}`);

  // jp: 3. 종목별 캐시
  console.log('\n3. 종목별 캐시 (000660):');
  const skStocks = MOCK_DISCLOSURES.filter(d => d.stockCode === '000660');
  await cacheStockDisclosures('000660', skStocks);
  const cachedStock = await getStockDisclosuresFromCache('000660');
  console.log(`   저장: ${skStocks.length}건`);
  console.log(`   조회: ${cachedStock?.length ?? 0}건`);
  console.log(`   ${cachedStock?.length === skStocks.length ? '✅ 일치' : '❌ 불일치'}`);

  // jp: 4. 캐시 무효화
  console.log('\n4. 캐시 무효화:');
  await invalidateDisclosureCaches('000660');
  const afterInvalidate = await getLatestDisclosuresFromCache();
  console.log(`   무효화 후 조회: ${afterInvalidate?.length ?? 0}건`);
  console.log(`   ${!afterInvalidate || afterInvalidate.length === 0 ? '✅ 무효화됨' : '⚠️  아직 남음'}`);

  await redis.quit();
  process.exit(0);
}

main().catch(err => {
  console.error('❌ 테스트 실패:', err instanceof Error ? err.message : err);
  process.exit(1);
});
