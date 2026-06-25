// jp: default-user 고아 알림 정리 (보안 수정 후 죽은 데이터)
const {Pool} = require('pg');
require('dotenv').config();
const p = new Pool({connectionString: process.env.DATABASE_URL});

(async () => {
  console.log('========== 고아 알림 데이터 정리 ==========\n');

  // 1. 공시 알림
  const d1 = await p.query(`SELECT COUNT(*) cnt FROM disclosure_alerts WHERE user_id IS NULL OR user_id='default-user' OR user_id=''`);
  console.log(`disclosure_alerts 고아: ${d1.rows[0].cnt}건`);
  const del1 = await p.query(`DELETE FROM disclosure_alerts WHERE user_id IS NULL OR user_id='default-user' OR user_id=''`);
  console.log(`  ✅ 삭제: ${del1.rowCount}건`);

  // 2. 가격 알림
  const d2 = await p.query(`SELECT COUNT(*) cnt FROM stock_alert_conditions WHERE user_id IS NULL OR user_id='default-user' OR user_id=''`);
  console.log(`stock_alert_conditions 고아: ${d2.rows[0].cnt}건`);
  const del2 = await p.query(`DELETE FROM stock_alert_conditions WHERE user_id IS NULL OR user_id='default-user' OR user_id=''`);
  console.log(`  ✅ 삭제: ${del2.rowCount}건`);

  // 3. 정리 후 검증
  console.log('\n=== 정리 후 검증 ===');
  for (const t of ['disclosure_alerts', 'stock_alert_conditions']) {
    const r = await p.query(`SELECT user_id, COUNT(*) cnt FROM ${t} GROUP BY user_id ORDER BY cnt DESC`);
    console.log(`[${t}]`);
    if (r.rows.length === 0) console.log('  (비어있음)');
    r.rows.forEach(x => console.log(`  ${x.user_id?.slice(0,12)}...: ${x.cnt}건`));
    const orphan = await p.query(`SELECT COUNT(*) cnt FROM ${t} WHERE user_id IS NULL OR user_id='default-user' OR user_id=''`);
    console.log(`  고아 잔여: ${orphan.rows[0].cnt}건 ${orphan.rows[0].cnt === 0 ? '✅' : '❌'}`);
  }

  await p.end();
})().catch(e => { console.error(e.message); p.end(); });
