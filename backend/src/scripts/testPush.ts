// jp: FCM 푸시 발송 테스트 스크립트
// jp: 실행: npm run test:push
// jp: DB의 모든 FCM 토큰으로 직접 푸시를 쏴서 "실제 도착하는지" 확인
// jp: 서버(server.ts)를 안 거치므로 initFcm()을 직접 호출해야 함

import { initFcm, isFcmEnabled, sendPushToToken } from '../services/fcm/firebase.service';
import { getAllFcmTokens, deleteFcmTokens } from '../repositories/fcmToken.repository';
import { db } from '../config/db';

async function main(): Promise<void> {
  console.log('=== FCM 푸시 발송 테스트 ===\n');

  // jp: 1. FCM 초기화 (서비스 계정 키 읽기)
  console.log('1. FCM 초기화:');
  initFcm();
  if (!isFcmEnabled()) {
    console.log('   ❌ FCM 비활성 - backend/firebase-service-account.json 확인 필요');
    process.exit(1);
  }
  console.log('   ✅ FCM 활성화됨 (서비스 계정 키 정상)');

  // jp: 2. 등록된 토큰 조회
  console.log('\n2. 등록된 FCM 토큰:');
  const tokens = await getAllFcmTokens();
  console.log(`   총 ${tokens.length}개`);
  if (tokens.length === 0) {
    console.log('   ❌ 토큰 없음 - 앱에서 알림 권한을 먼저 허용하세요');
    process.exit(1);
  }
  tokens.forEach((t, i) => console.log(`   ${i + 1}. ${t.slice(0, 24)}...`));

  // jp: 3. 각 토큰으로 테스트 푸시 발송
  console.log('\n3. 테스트 푸시 발송:');
  const title = '공시탐정 AI 테스트';
  const body = '푸시 알림이 정상 작동해요! 🎉';
  const expired: string[] = [];
  let success = 0;

  for (const token of tokens) {
    const ok = await sendPushToToken(token, title, body, { type: 'test' });
    if (ok) {
      success++;
      console.log(`   ✅ 성공: ${token.slice(0, 24)}...`);
    } else {
      expired.push(token);
      console.log(`   ❌ 실패(만료 추정): ${token.slice(0, 24)}...`);
    }
  }

  // jp: 4. 결과 요약
  console.log('\n4. 결과:');
  console.log(`   성공 ${success}개 / 실패 ${expired.length}개 (총 ${tokens.length}개)`);

  // jp: 5. 만료 토큰 정리 여부 (자동 삭제하지 않고 안내만)
  if (expired.length > 0) {
    console.log('\n   ⚠ 실패한 토큰은 만료됐을 가능성이 높아요.');
    console.log('   → 앱에서 알림을 껐다 다시 켜면 새 토큰이 등록됩니다.');
    console.log('   (만료 토큰 자동 삭제를 원하면 이 스크립트 하단 주석 해제)');
    // jp: 자동 삭제를 원하면 아래 주석 해제
    // await deleteFcmTokens(expired);
    // console.log(`   ${expired.length}개 만료 토큰 삭제 완료`);
  }

  if (success > 0) {
    console.log('\n🎉 푸시 발송 성공! 기기/브라우저에서 알림이 떴는지 확인하세요.');
    console.log('   (앱을 백그라운드로 두거나 다른 탭에 있을 때 알림이 와야 정상)');
  } else {
    console.log('\n❌ 모든 토큰 발송 실패. 토큰이 모두 만료됐거나 설정 문제입니다.');
    console.log('   → 앱에서 알림 권한을 다시 허용해 새 토큰을 만든 뒤 재시도하세요.');
  }

  // jp: DB 연결 정리
  await db.end?.().catch(() => { /* ignore */ });
  process.exit(success > 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('❌ 테스트 실패:', err instanceof Error ? err.message : err);
  process.exit(1);
});
