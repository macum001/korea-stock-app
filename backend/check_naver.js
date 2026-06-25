const {Pool} = require('pg');
require('dotenv').config();
const p = new Pool({connectionString: process.env.DATABASE_URL});

(async () => {
  // 네이버 관련 종목
  const naver = await p.query(`SELECT code, name FROM stock_master WHERE name ILIKE '%naver%' OR name LIKE '%네이버%'`);
  console.log('네이버류:', JSON.stringify(naver.rows));

  // 이닉스
  const inix = await p.query(`SELECT code, name FROM stock_master WHERE name LIKE '%이닉스%'`);
  console.log('이닉스류:', JSON.stringify(inix.rows));

  await p.end();
})().catch(e => { console.error(e.message); p.end(); });
