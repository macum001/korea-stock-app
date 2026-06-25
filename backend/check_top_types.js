// jp: 실제 공시 유형 분포 분석 (주주 필수 정보 우선순위 파악용)
const { Pool } = require('pg');
require('dotenv').config();
const p = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    // 주요 공시 유형별 건수 (주주 영향 큰 것들)
    const types = [
      ['유상증자', '유상증자'],
      ['무상증자', '무상증자'],
      ['전환사채', '전환사채'],
      ['신주인수권', '신주인수권'],
      ['감자', '감자'],
      ['배당', '배당'],
      ['자기주식취득', '자기주식'],
      ['자기주식처분', '자기주식처분'],
      ['단일판매공급계약', '공급계약'],
      ['횡령배임', '횡령'],
      ['영업정지', '영업정지'],
      ['소송', '소송'],
      ['주주명부폐쇄', '주주명부폐쇄'],
      ['최대주주변경', '최대주주변경'],
      ['주식분할', '주식분할'],
      ['주식병합', '주식병합'],
      ['합병', '합병'],
      ['분할', '회사분할'],
      ['상장폐지', '상장폐지'],
      ['관리종목', '관리종목'],
      ['거래정지', '거래정지'],
      ['실적', '영업실적'],
      ['주식소각', '소각'],
      ['전환청구권', '전환청구'],
    ];
    console.log('=== 주주 영향 공시 유형별 건수 ===');
    for (const [label, kw] of types) {
      const r = await p.query('SELECT COUNT(*)::int AS c FROM disclosures WHERE strpos(report_name, $1) > 0', [kw]);
      if (r.rows[0].c > 0) console.log(`  ${label}: ${r.rows[0].c.toLocaleString()}건`);
    }
    p.end();
  } catch (e) { console.error('ERR:', e.message); p.end(); }
})();
