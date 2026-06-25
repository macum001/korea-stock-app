const { Client } = require('pg');
require('dotenv').config();
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const r = await c.query("SELECT MIN(disclosed_at) AS oldest, MAX(disclosed_at) AS newest, COUNT(*) AS total FROM disclosures");
  console.log('가장 오래된:', r.rows[0].oldest);
  console.log('가장 최근:', r.rows[0].newest);
  console.log('전체 건수:', r.rows[0].total);
  // 삼성공조 가장 오래된 공시
  const r2 = await c.query("SELECT MIN(disclosed_at) AS oldest, MAX(disclosed_at) AS newest, COUNT(*) AS cnt FROM disclosures WHERE stock_code='006660'");
  console.log('삼성공조 — 오래된:', r2.rows[0].oldest, '최근:', r2.rows[0].newest, '건수:', r2.rows[0].cnt);
  await c.end();
})().catch(e => console.error(e.message));
