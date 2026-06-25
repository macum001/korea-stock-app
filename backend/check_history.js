const {Pool} = require('pg');
require('dotenv').config();
const p = new Pool({connectionString: process.env.DATABASE_URL});

(async () => {
  // 히스토리 테이블 구조
  const cols = await p.query(`SELECT column_name FROM information_schema.columns WHERE table_name='ai_analysis_history' ORDER BY ordinal_position`);
  console.log('컬럼:', cols.rows.map(r=>r.column_name).join(', '));

  // user_id별 히스토리 개수
  const byUser = await p.query(`SELECT user_id, COUNT(*) as cnt FROM ai_analysis_history GROUP BY user_id ORDER BY cnt DESC LIMIT 10`);
  console.log('\nuser_id별 히스토리:');
  byUser.rows.forEach(r => console.log(`  ${r.user_id}: ${r.cnt}건`));

  // default-user 히스토리가 있나? (비로그인 저장된 것)
  const defaultCnt = await p.query(`SELECT COUNT(*) as cnt FROM ai_analysis_history WHERE user_id='default-user'`);
  console.log('\ndefault-user(비로그인) 히스토리:', defaultCnt.rows[0].cnt, '건');

  await p.end();
})().catch(e => { console.error(e.message); p.end(); });
