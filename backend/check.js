// jp: 비번 변경 버그 진단 - 현재 DB 해시가 어떤 값으로 만들어졌는지 역추적
const bcrypt = require('bcryptjs');

const hash = '$2b$10$IbjzM3OUrFvsiIjiZO0w8.FP7TkflY.Tl3o9xz2nmq1iKq0T10Ine';

// jp: 후보값들 - 정상값 + 흔한 버그값들
const candidates = [
  '12345678',        // 변경 전 비번
  '123456789',       // 변경 후 비번
  '',                // 빈 문자열 (newPassword 미전달 시)
  'undefined',       // undefined가 문자열로
  'null',            // null이 문자열로
  ' 123456789',      // 앞 공백
  '123456789 ',      // 뒤 공백
  '12345678 ',       // 옛날비번+공백
  ' 12345678',
  '1234567',         // 한자리 빠짐
  '1234567890',      // 한자리 더
  'newPassword',     // 자리표시자 그대로
  '새비밀번호',       // 한글 자리표시자
];

console.log('현재 해시:', hash);
console.log('어떤 값과 매칭되는지 테스트:\n');

let found = false;
for (const c of candidates) {
  const ok = bcrypt.compareSync(c, hash);
  console.log(`  ${ok ? '✅ 일치!' : '❌'}  "${c}"  (길이 ${c.length})`);
  if (ok) found = true;
}

if (!found) {
  console.log('\n⚠️ 후보 중 일치하는 게 없음. 완전히 다른 값으로 저장됨.');
}
