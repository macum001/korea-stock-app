// jp: 소셜 로그인용 users 테이블 마이그레이션
// jp: provider(email/naver/kakao), provider_id 추가 + password_hash nullable
const {Pool} = require('pg');
require('dotenv').config();
const p = new Pool({connectionString: process.env.DATABASE_URL});

(async () => {
  console.log('========== 소셜 로그인 마이그레이션 ==========\n');

  // 1. provider 컬럼 (email/naver/kakao) - 기존 사용자는 email
  await p.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS provider VARCHAR(20) NOT NULL DEFAULT 'email'`);
  console.log('✅ provider 컬럼 추가 (기본값 email)');

  // 2. provider_id 컬럼 (네이버/카카오의 고유 사용자 ID)
  await p.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_id VARCHAR(255)`);
  console.log('✅ provider_id 컬럼 추가');

  // 3. password_hash를 nullable로 (소셜 가입자는 비번 없음)
  await p.query(`ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`);
  console.log('✅ password_hash nullable로 변경');

  // 4. provider + provider_id 복합 유니크 (같은 네이버 계정 중복 가입 방지)
  await p.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_provider ON users(provider, provider_id) WHERE provider_id IS NOT NULL`);
  console.log('✅ provider 복합 유니크 인덱스 생성');

  // 검증
  console.log('\n=== 변경 후 구조 ===');
  const cols = await p.query(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='users' ORDER BY ordinal_position`);
  cols.rows.forEach(c => console.log(`  ${c.column_name} (${c.data_type}, null:${c.is_nullable})`));

  // 기존 사용자 provider 확인
  const check = await p.query(`SELECT provider, COUNT(*) cnt FROM users GROUP BY provider`);
  console.log('\n기존 사용자 provider:');
  check.rows.forEach(r => console.log(`  ${r.provider}: ${r.cnt}명`));

  await p.end();
})().catch(e => { console.error('오류:', e.message); p.end(); });
