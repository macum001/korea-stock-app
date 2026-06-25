// jp: 종목 검색 로직 자체 테스트 v2 (별칭+대소문자 포함)
const {Pool} = require('pg');
require('dotenv').config();
const p = new Pool({connectionString: process.env.DATABASE_URL});

const ALIAS = {
  '네이버': 'NAVER', '네이바': 'NAVER', '삼전': '삼성전자', '삼바': '삼성바이오로직스',
  '하이닉스': 'SK하이닉스', '에스케이하이닉스': 'SK하이닉스',
  'lg엔솔': 'LG에너지솔루션', '엘지엔솔': 'LG에너지솔루션', '기아차': '기아',
};

async function searchStock(q) {
  let qTrim = q.trim();

  // 0. 별칭
  for (const [alias, real] of Object.entries(ALIAS)) {
    if (qTrim.toLowerCase().includes(alias.toLowerCase())) {
      qTrim = qTrim.toLowerCase().replace(alias.toLowerCase(), real);
      break;
    }
  }

  // 1. 코드
  const codeMatch = qTrim.match(/\d{6}/);
  if (codeMatch) {
    const r = await p.query(`SELECT code,name FROM stock_master WHERE code=$1 LIMIT 1`, [codeMatch[0]]);
    if (r.rows[0]) return { ...r.rows[0], step: '1.코드' };
  }
  // 2. 정확
  let r = await p.query(`SELECT code,name FROM stock_master WHERE name=$1 AND is_etf=false LIMIT 1`, [qTrim]);
  if (r.rows[0]) return { ...r.rows[0], step: '2.정확' };
  // 2b. 별칭치환 후 대소문자 무시 정확매칭
  r = await p.query(`SELECT code,name FROM stock_master WHERE LOWER(name)=LOWER($1) AND is_etf=false LIMIT 1`, [qTrim]);
  if (r.rows[0]) return { ...r.rows[0], step: '2b.정확(대소문자)' };
  // 3. 포함 (대소문자 무시)
  r = await p.query(
    `SELECT code,name FROM stock_master WHERE is_etf=false AND char_length(name)>=3 AND strpos(LOWER($1),LOWER(name))>0 ORDER BY char_length(name) DESC LIMIT 1`,
    [qTrim]
  );
  if (r.rows[0]) return { ...r.rows[0], step: '3.포함' };
  // 4. LIKE
  r = await p.query(
    `SELECT code,name FROM stock_master WHERE is_etf=false AND LOWER($1) LIKE '%'||LOWER(name)||'%' AND char_length(name)>=3 ORDER BY char_length(name) DESC LIMIT 1`,
    [qTrim]
  );
  if (r.rows[0]) return { ...r.rows[0], step: '4.LIKE' };
  // 5. 첫단어
  const firstWord = qTrim.split(/[\s,?!]/)[0];
  if (firstWord && firstWord.length >= 2) {
    r = await p.query(
      `SELECT code,name FROM stock_master WHERE is_etf=false AND name LIKE $1 ORDER BY char_length(name) ASC LIMIT 1`,
      [`%${firstWord}%`]
    );
    if (r.rows[0]) return { ...r.rows[0], step: '5.첫단어' };
  }
  // 6. trigram 오타
  if (firstWord && firstWord.length >= 3) {
    r = await p.query(
      `SELECT code,name,similarity(name,$1) as sim FROM stock_master WHERE is_etf=false AND char_length(name)>=3 AND similarity(name,$1)>0.4 ORDER BY sim DESC LIMIT 1`,
      [firstWord]
    );
    if (r.rows[0]) return { ...r.rows[0], step: '6.오타유사' };
  }
  return null;
}

(async () => {
  const tests = [
    'SK하이닉스 뭔일있어', 'SK하이믹스 뭔일있어', '삼성전자', '삼성전자 공시 분석해줘',
    '005930', '카카오 어때', 'sk하이닉스', '네이버 주가', '네이버', '하이닉스 어때', '삼전 분석',
  ];
  for (const t of tests) {
    const r = await searchStock(t);
    console.log(`"${t}" → ${r ? `${r.name}(${r.code}) [${r.step}]` : '❌ 못찾음'}`);
  }
  await p.end();
})().catch(e => { console.error(e.message); p.end(); });
