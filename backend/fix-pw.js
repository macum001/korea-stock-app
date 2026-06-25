// jp: 비번 리셋 - bcryptjs로 해시 만들고 DB까지 한 번에 (PowerShell $ 문제 회피)
// jp: backend 폴더에서 실행: node fix-pw.js
const bcrypt = require('bcryptjs');

// jp: DB 연결 - pg 사용. 백엔드가 이미 pg를 쓰니 설치돼 있음
let Pool;
try {
  Pool = require('pg').Pool;
} catch {
  console.error('pg 모듈이 없어요. backend 폴더에서 실행하세요.');
  process.exit(1);
}

const EMAIL = 'macum001@naver.com';
const NEW_PW = '12345678';

async function main() {
  const hash = bcrypt.hashSync(NEW_PW, 10);
  console.log('새 해시:', hash);
  console.log('검증:', bcrypt.compareSync(NEW_PW, hash) ? 'OK' : '실패');

  // jp: 백엔드 env에서 DB 정보 읽기 시도, 없으면 기본값
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'gongsi_user',
    password: process.env.DB_PASSWORD || 'gongsi_pass',
    database: process.env.DB_NAME || 'gongsi_db',
  });

  try {
    const r = await pool.query(
      'UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING email',
      [hash, EMAIL]
    );
    if (r.rowCount > 0) {
      console.log(`\n✅ ${EMAIL} 비번이 "${NEW_PW}"로 리셋됨. 이걸로 로그인하세요.`);
      // jp: 바로 검증 - DB에서 다시 읽어서 compare
      const check = await pool.query('SELECT password_hash FROM users WHERE email=$1', [EMAIL]);
      const dbHash = check.rows[0].password_hash;
      console.log('DB 저장 확인:', bcrypt.compareSync(NEW_PW, dbHash) ? '✅ 12345678과 일치!' : '❌ 불일치');
    } else {
      console.log('❌ 계정 못 찾음');
    }
  } catch (e) {
    console.error('DB 에러:', e.message);
    console.error('\n혹시 DB 비번이 달라요? backend/.env 의 DB_PASSWORD 확인 필요.');
  } finally {
    await pool.end();
  }
}

main();
