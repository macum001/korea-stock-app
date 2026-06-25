// jp: 공시 원문에서 CSS 제거 후 실제 데이터 발췌 (라벨 도출용)
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
      let raw = e.getData().toString('utf-8');
      // jp: style/script 블록 제거
      raw = raw.replace(/<style[\s\S]*?<\/style>/gi, ' ');
      raw = raw.replace(/<script[\s\S]*?<\/script>/gi, ' ');
      // jp: 태그 제거
      raw = raw.replace(/<[^>]+>/g, ' ');
      // jp: CSS 잔재 제거 (.xforms {...} 패턴)
      raw = raw.replace(/\.[a-zA-Z_][\w-]*\s*\{[^}]*\}/g, ' ');
      raw = raw.replace(/[a-zA-Z-]+\s*:\s*[^;{}]+;/g, ' ');
      raw = raw.replace(/\s+/g, ' ');
      text += raw;
    }
  }
  return text.trim();
}

const TARGETS = [
  ['최대주주변경', '최대주주변경'],
  ['매출손익30%변동', '매출액또는손익구조'],
  ['상장폐지', '상장폐지'],
  ['관리종목', '관리종목'],
];

(async () => {
  for (const [label, kw] of TARGETS) {
    try {
      const r = await p.query(
        "SELECT receipt_no, stock_name, report_name FROM disclosures WHERE strpos(report_name, $1) > 0 ORDER BY disclosed_at DESC LIMIT 1",
        [kw]
      );
      if (r.rows.length === 0) { console.log(`\n### ${label}: 없음\n`); continue; }
      const d = r.rows[0];
      let text = await fetchText(d.receipt_no);
      // jp: 제목 이후의 실제 본문 찾기 (회사명/제목 반복 건너뛰기)
      console.log(`\n========== ${label} (${d.stock_name}) ==========`);
      console.log(text.slice(0, 700));
    } catch (e) {
      console.log(`\n### ${label}: ${e.message}\n`);
    }
  }
  p.end();
})();
