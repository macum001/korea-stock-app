const { Client } = require('pg');
require('dotenv').config();
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const r = await c.query("SELECT report_name, disclosed_at FROM disclosures WHERE stock_code='006660' ORDER BY disclosed_at DESC LIMIT 5");
  r.rows.forEach(x => console.log(x.disclosed_at, '|', x.report_name));
  await c.end();
})().catch(e => console.error(e.message));
