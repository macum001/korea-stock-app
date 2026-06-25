// jp: default-user(비로그인/토큰만료로 잘못 저장된) 히스토리 삭제
const {Pool} = require('pg');
require('dotenv').config();
const p = new Pool({connectionString: process.env.DATABASE_URL});

(async () => {
  // 삭제 전 확인
  const before = await p.query(`SELECT COUNT(*) as cnt FROM ai_analysis_history WHERE user_id='default-user'`);
  console.log('삭제 대상 default-user 히스토리:', before.rows[0].cnt, '건');

  // 삭제
  const del = await p.query(`DELETE FROM ai_analysis_history WHERE user_id='default-user'`);
  console.log('✅ 삭제 완료:', del.rowCount, '건');

  // 삭제 후 전체 확인
  const after = await p.query(`SELECT user_id, COUNT(*) as cnt FROM ai_analysis_history GROUP BY user_id ORDER BY cnt DESC`);
  console.log('\n남은 히스토리 (user_id별):');
  after.rows.forEach(r => console.log(`  ${r.user_id}: ${r.cnt}건`));

  await p.end();
})().catch(e => { console.error(e.message); p.end(); });
