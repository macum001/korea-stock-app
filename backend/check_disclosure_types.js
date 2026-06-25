// jp: 공시 제목 종류 분석 (명의개서/기준일 데이터 확인용)
const { Pool } = require('pg');
require('dotenv').config();
const p = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    // 1. 명의개서/기준일/주주명부 직접 검색
    const kw = ['명의개서', '기준일', '주주명부', '폐쇄', '권리주주', '주주확정'];
    console.log('=== 명의개서 관련 키워드별 공시 수 ===');
    for (const k of kw) {
      const r = await p.query('SELECT COUNT(*)::int AS c FROM disclosures WHERE strpos(report_name, $1) > 0', [k]);
      console.log(`  "${k}": ${r.rows[0].c}건`);
    }

    // 2. 가장 많은 공시 제목 TOP 30 (전체 분포 파악)
    console.log('\n=== 공시 제목 TOP 30 ===');
    const top = await p.query("SELECT report_name, COUNT(*)::int AS c FROM disclosures GROUP BY report_name ORDER BY c DESC LIMIT 30");
    top.rows.forEach(d => console.log(`  [${d.c}] ${d.report_name}`));

    p.end();
  } catch (e) { console.error('ERR:', e.message); p.end(); }
})();
