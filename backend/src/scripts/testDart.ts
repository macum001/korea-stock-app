// jp: DART API 연결 테스트 스크립트
// jp: 실행: npm run test:dart

import { checkDartApiHealth, fetchLatestDisclosures, createDartOriginalUrl } from '../services/disclosure/dartApi.service';
import { ENV } from '../config/env';

async function main(): Promise<void> {
  console.log('=== DART API 연결 테스트 ===\n');

  // jp: 1. API 키 설정 확인 (키 자체는 출력 안 함)
  console.log('1. API 키 설정:', ENV.DART.API_KEY ? '✅ 설정됨' : '❌ 미설정');
  console.log('   USE_MOCK_DISCLOSURE:', process.env.USE_MOCK_DISCLOSURE || 'false');

  // jp: 2. 헬스체크
  console.log('\n2. DART API 연결 상태:');
  const health = await checkDartApiHealth();
  console.log(`   ${health.ok ? '✅' : '❌'} ${health.message}`);

  // jp: 3. 원문 URL 생성 테스트
  console.log('\n3. 원문 URL 생성:');
  const url = createDartOriginalUrl('20240615000101');
  console.log(`   ${url}`);

  // jp: 4. 실제 공시 조회 (API 키 있을 때만)
  if (ENV.DART.API_KEY && health.ok) {
    console.log('\n4. 최신 공시 조회 (오늘):');
    const list = await fetchLatestDisclosures();
    console.log(`   조회된 공시: ${list.length}건`);
    list.slice(0, 5).forEach((item, i) => {
      console.log(`   ${i + 1}. [${item.corp_name}] ${item.report_nm}`);
    });
  } else {
    console.log('\n4. 공시 조회 건너뜀 (API 키 미설정 또는 연결 실패)');
  }

  process.exit(0);
}

main().catch(err => {
  console.error('❌ 테스트 실패:', err instanceof Error ? err.message : err);
  process.exit(1);
});
