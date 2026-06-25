// jp: 사용자별 데이터 격리 종합 감사
// jp: 히스토리(종목/공시분석), 공시알림이 user_id로 제대로 분리되는지 검증
const {Pool} = require('pg');
require('dotenv').config();
const p = new Pool({connectionString: process.env.DATABASE_URL});

(async () => {
  console.log('========== 사용자별 데이터 격리 감사 ==========\n');

  // ===== 1. AI 분석 히스토리 =====
  console.log('【1. AI 분석 히스토리 (ai_analysis_history)】');
  const histCols = await p.query(`SELECT column_name FROM information_schema.columns WHERE table_name='ai_analysis_history'`);
  const hasUserId = histCols.rows.some(r => r.column_name === 'user_id');
  console.log(`  user_id 컬럼 존재: ${hasUserId ? '✅' : '❌ 위험!'}`);

  const histByUser = await p.query(`SELECT user_id, kind, COUNT(*) cnt FROM ai_analysis_history GROUP BY user_id, kind ORDER BY user_id`);
  console.log('  user_id별 분포:');
  histByUser.rows.forEach(r => console.log(`    ${r.user_id?.slice(0,12)}... [${r.kind}]: ${r.cnt}건`));

  // jp: default-user나 null user_id 있는지 (격리 위반 위험)
  const orphan = await p.query(`SELECT COUNT(*) cnt FROM ai_analysis_history WHERE user_id IS NULL OR user_id='default-user' OR user_id=''`);
  console.log(`  ⚠️  고아 레코드(null/default/빈값): ${orphan.rows[0].cnt}건 ${orphan.rows[0].cnt > 0 ? '❌ 정리 필요!' : '✅'}`);

  // ===== 2. 공시 알림 =====
  console.log('\n【2. 공시 알림】');
  const alertTables = await p.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name LIKE '%alert%' OR table_name LIKE '%disclosure_alert%')`);
  console.log('  알림 관련 테이블:', alertTables.rows.map(r=>r.table_name).join(', '));

  for (const t of alertTables.rows) {
    const cols = await p.query(`SELECT column_name FROM information_schema.columns WHERE table_name=$1`, [t.table_name]);
    const colNames = cols.rows.map(r=>r.column_name);
    const hasUid = colNames.includes('user_id');
    console.log(`    [${t.table_name}] user_id: ${hasUid ? '✅' : '❌'} | 컬럼: ${colNames.join(', ')}`);
    if (hasUid) {
      const byUser = await p.query(`SELECT user_id, COUNT(*) cnt FROM ${t.table_name} GROUP BY user_id`);
      byUser.rows.forEach(r => console.log(`      ${r.user_id?.slice(0,12)}...: ${r.cnt}건`));
      const orphanA = await p.query(`SELECT COUNT(*) cnt FROM ${t.table_name} WHERE user_id IS NULL OR user_id='default-user' OR user_id=''`);
      console.log(`      ⚠️  고아: ${orphanA.rows[0].cnt}건 ${orphanA.rows[0].cnt>0?'❌':'✅'}`);
    }
  }

  // ===== 3. 관심종목(watchlist) =====
  console.log('\n【3. 관심종목 (watchlists)】');
  const wlCols = await p.query(`SELECT column_name FROM information_schema.columns WHERE table_name='watchlists'`);
  if (wlCols.rows.length > 0) {
    const hasUid = wlCols.rows.some(r=>r.column_name==='user_id');
    console.log(`  user_id: ${hasUid ? '✅' : '❌'} | 컬럼: ${wlCols.rows.map(r=>r.column_name).join(', ')}`);
    if (hasUid) {
      const byUser = await p.query(`SELECT user_id, COUNT(*) cnt FROM watchlists GROUP BY user_id`);
      byUser.rows.forEach(r => console.log(`    ${r.user_id?.slice(0,12)}...: ${r.cnt}건`));
    }
  }

  await p.end();
})().catch(e => { console.error('오류:', e.message); p.end(); });
