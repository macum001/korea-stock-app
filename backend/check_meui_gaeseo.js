// jp: 주주명부폐쇄/명의개서 공시 원문 확인 (정확한 추출 라벨 찾기용)
const { Pool } = require('pg');
require('dotenv').config();
const p = new Pool({ connectionString: process.env.DATABASE_URL });

async function fetchDartText(receiptNo) {
  // dartDocument.service.ts와 동일 방식으로 원문 가져오기
  const axios = require('axios');
  const AdmZip = require('adm-zip');
  const key = process.env.DART_API_KEY;
  const url = `https://opendart.fss.or.kr/api/document.xml?crtfc_key=${key}&rcept_no=${receiptNo}`;
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
  const zip = new AdmZip(Buffer.from(res.data));
  const entries = zip.getEntries();
  let text = '';
  for (const e of entries) {
    if (e.entryName.endsWith('.xml')) {
      const raw = e.getData().toString('utf-8');
      text += raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    }
  }
  return text;
}

(async () => {
  try {
    // 주주명부폐쇄 공시 1건 가져오기
    const r = await p.query("SELECT receipt_no, stock_name, report_name FROM disclosures WHERE strpos(report_name, '주주명부폐쇄') > 0 ORDER BY disclosed_at DESC LIMIT 1");
    if (r.rows.length === 0) { console.log('공시 없음'); p.end(); return; }
    const d = r.rows[0];
    console.log(`공시: ${d.report_name} (${d.stock_name}) rcp=${d.receipt_no}\n`);

    const text = await fetchDartText(d.receipt_no);
    console.log('원문 길이:', text.length, '자\n');

    // 명의개서/정지/기간 주변 텍스트 발췌
    const keywords = ['명의개서', '정지', '폐쇄', '기준일', '기간', '권리주주'];
    for (const k of keywords) {
      const idx = text.indexOf(k);
      if (idx >= 0) {
        console.log(`[${k}] ...${text.slice(Math.max(0, idx - 30), idx + 80)}...`);
      }
    }
    p.end();
  } catch (e) { console.error('ERR:', e.message); p.end(); }
})();
