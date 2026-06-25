// jp: 주요 공시 유형 원문 구조 확인 (정확한 추출 라벨 도출용)
const { Pool } = require('pg');
const axios = require('axios');
const AdmZip = require('adm-zip');
require('dotenv').config();
const p = new Pool({ connectionString: process.env.DATABASE_URL });

async function fetchText(rcp) {
  const key = process.env.DART_API_KEY;
  const url = `https://opendart.fss.or.kr/api/document.xml?crtfc_key=${key}&rcept_no=${rcp}`;
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
  const zip = new AdmZip(Buffer.from(res.data));
  let text = '';
  for (const e of zip.getEntries()) {
    if (e.entryName.endsWith('.xml')) {
      text += e.getData().toString('utf-8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    }
  }
  return text;
}

// 확인할 공시 유형 (제목 키워드)
const TARGETS = [
  ['최대주주변경', '최대주주변경'],
  ['매출손익30%변동', '매출액또는손익구조'],
  ['상장폐지', '상장폐지'],
  ['관리종목', '관리종목'],
  ['합병', '합병'],
];

(async () => {
  for (const [label, kw] of TARGETS) {
    try {
      const r = await p.query(
        "SELECT receipt_no, stock_name, report_name FROM disclosures WHERE strpos(report_name, $1) > 0 ORDER BY disclosed_at DESC LIMIT 1",
        [kw]
      );
      if (r.rows.length === 0) { console.log(`\n### ${label}: 공시 없음\n`); continue; }
      const d = r.rows[0];
      const text = await fetchText(d.receipt_no);
      console.log(`\n========== ${label} ==========`);
      console.log(`공시: ${d.report_name} (${d.stock_name})`);
      console.log(`원문 길이: ${text.length}자`);
      // 본문 앞 500자 (구조 파악)
      console.log(`본문 발췌: ${text.slice(0, 600)}`);
    } catch (e) {
      console.log(`\n### ${label}: 오류 - ${e.message}\n`);
    }
  }
  p.end();
})();
