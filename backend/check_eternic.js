const {Pool} = require('pg');
require('dotenv').config();
const p = new Pool({connectionString: process.env.DATABASE_URL});

(async () => {
  // 이터닉 검색
  const e1 = await p.query(`SELECT code, name, market, sector FROM stock_master WHERE name LIKE '%이터닉%'`);
  console.log('이터닉류:', JSON.stringify(e1.rows));

  // 비슷한 이름 (트라이그램)
  const e2 = await p.query(`SELECT code, name, similarity(name,$1) as sim FROM stock_master WHERE similarity(name,$1)>0.3 ORDER BY sim DESC LIMIT 5`, ['이터닉']);
  console.log('이터닉 유사:', JSON.stringify(e2.rows));

  // stock_master에 어떤 컬럼 있는지 (기업정보 관련)
  const cols = await p.query(`SELECT column_name FROM information_schema.columns WHERE table_name='stock_master'`);
  console.log('stock_master 컬럼:', cols.rows.map(r=>r.column_name).join(', '));

  // 기업 개요/설명 테이블 있는지
  const tables = await p.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name LIKE '%company%' OR table_name LIKE '%corp%' OR table_name LIKE '%profile%' OR table_name LIKE '%info%')`);
  console.log('기업정보 관련 테이블:', tables.rows.map(r=>r.table_name).join(', ') || '없음');

  await p.end();
})().catch(e => { console.error(e.message); p.end(); });
