// jp: 새 추출 라벨이 실제 작동하는지 테스트
require('dotenv').config();
const { Pool } = require('pg');
const p = new Pool({ connectionString: process.env.DATABASE_URL });

// ts 파일을 직접 못 부르니, 같은 로직 재현
const axios = require('axios');
const AdmZip = require('adm-zip');

async function fetchText(rcp) {
  const key = process.env.DART_API_KEY;
  const url = `https://opendart.fss.or.kr/api/document.xml?crtfc_key=${key}&rcept_no=${rcp}`;
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
  const zip = new AdmZip(Buffer.from(res.data));
  let text = '';
  for (const e of zip.getEntries()) {
    if (e.entryName.endsWith('.xml')) {
      let raw = e.getData().toString('utf-8');
      raw = raw.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
      raw = raw.replace(/\.[a-zA-Z_][\w-]*\s*\{[^}]*\}/g, ' ').replace(/[a-zA-Z-]+\s*:\s*[^;{}]+;/g, ' ');
      raw = raw.replace(/\s+/g, ' ');
      text += raw;
    }
  }
  return text.trim();
}

// 라벨 주변 추출 (dartDocument.service.ts와 동일 로직)
function extractByLabels(text, labels) {
  const found = [];
  for (const label of labels) {
    const idx = text.indexOf(label);
    if (idx >= 0) {
      const snippet = text.slice(idx, idx + 120).replace(/\s+/g, ' ').trim();
      found.push(snippet);
    }
  }
  return found;
}

const TESTS = [
  ['최대주주변경', '최대주주변경', ['명칭', '소유 주식 수', '지분율', '담보권', '채무', '담보설정금액', '계약 체결일']],
  ['매출손익변동', '매출액또는손익구조', ['매출액', '영업이익', '당기순이익', '증감비율', '자본총계', '자본금']],
  ['상장폐지', '상장폐지', ['정리매매', '법원', '결정', '사유']],
  ['관리종목', '관리종목', ['지정', '사유', '시가총액', '미달']],
];

(async () => {
  for (const [label, kw, labels] of TESTS) {
    try {
      const r = await p.query("SELECT receipt_no, stock_name FROM disclosures WHERE strpos(report_name, $1) > 0 ORDER BY disclosed_at DESC LIMIT 1", [kw]);
      if (!r.rows.length) { console.log(`\n### ${label}: 없음`); continue; }
      const text = await fetchText(r.rows[0].receipt_no);
      const found = extractByLabels(text, labels);
      console.log(`\n========== ${label} (${r.rows[0].stock_name}) ==========`);
      console.log(`추출된 항목: ${found.length}/${labels.length}개`);
      found.slice(0, 4).forEach(f => console.log(`  • ${f.slice(0, 70)}`));
    } catch (e) { console.log(`\n### ${label}: ${e.message}`); }
  }
  p.end();
})();
