// jp: 전체 상장종목(stock_master) 검색 테스트
const {Pool} = require('pg');
require('dotenv').config();
const p = new Pool({connectionString: process.env.DATABASE_URL});

const ALIAS = {
  '네이버':'NAVER','네이바':'NAVER',
  '엘지전자':'LG전자','엘지화학':'LG화학','엘지엔솔':'LG에너지솔루션','엘지에너지솔루션':'LG에너지솔루션',
  '엘지이노텍':'LG이노텍','엘지생활건강':'LG생활건강','엘지유플러스':'LG유플러스','엘지디스플레이':'LG디스플레이',
  '포스코홀딩스':'POSCO홀딩스','포스코':'POSCO홀딩스','포스코퓨처엠':'포스코퓨처엠',
  '에스케이하이닉스':'SK하이닉스','에스케이텔레콤':'SK텔레콤','에스케이이노베이션':'SK이노베이션',
  '에스케이이터닉스':'SK이터닉스','케이비금융':'KB금융','케이티':'KT',
  '삼전':'삼성전자','삼바':'삼성바이오로직스','하이닉스':'SK하이닉스','이터닉':'SK이터닉스',
  'lg엔솔':'LG에너지솔루션','기아차':'기아','현차':'현대차','삼성':'삼성전자',
};
const PHONETIC = [
  ['엘지','LG'],['에스케이','SK'],['케이비','KB'],['케이티','KT'],
  ['지에스','GS'],['엘에스','LS'],['씨제이','CJ'],['디엘','DL'],
  ['에이치엠엠','HMM'],['포스코','POSCO'],
];

async function searchStock(q) {
  let qTrim = q.trim();
  const qLower = qTrim.toLowerCase();

  let pre = await p.query(`SELECT code,name FROM stock_master WHERE name=$1 AND is_etf=false LIMIT 1`, [qTrim]);
  if (pre.rows[0]) return {...pre.rows[0], step:'0정식명'};

  let aliasApplied = false;
  if (ALIAS[qLower]) { qTrim = ALIAS[qLower]; aliasApplied = true; }
  else {
    for (const [a, r] of Object.entries(ALIAS)) {
      const longerMatch = await p.query(`SELECT 1 FROM stock_master WHERE is_etf=false AND char_length(name)>char_length($1) AND strpos(LOWER($2),LOWER(name))>0 LIMIT 1`, [a, qTrim]);
      if (longerMatch.rows[0]) continue;
      if (qLower.includes(a.toLowerCase())) { qTrim = qTrim.toLowerCase().replace(a.toLowerCase(), r); aliasApplied = true; break; }
    }
  }
  if (!aliasApplied) {
    for (const [ko, en] of PHONETIC) {
      if (qTrim.includes(ko)) {
        const origExists = await p.query(`SELECT 1 FROM stock_master WHERE is_etf=false AND char_length(name)>=3 AND strpos(LOWER($1),LOWER(name))>0 LIMIT 1`, [qTrim]);
        if (origExists.rows[0]) break;
        const converted = qTrim.replace(ko, en);
        const check = await p.query(`SELECT 1 FROM stock_master WHERE is_etf=false AND (name=$1 OR strpos(LOWER($1),LOWER(name))>0) LIMIT 1`, [converted]);
        if (check.rows[0]) { qTrim = converted; break; }
      }
    }
  }

  const codeMatch = qTrim.match(/\d{6}/);
  if (codeMatch) {
    const r = await p.query(`SELECT code,name FROM stock_master WHERE code=$1 LIMIT 1`, [codeMatch[0]]);
    if (r.rows[0]) return {...r.rows[0], step:'1코드'};
  }
  let r = await p.query(`SELECT code,name FROM stock_master WHERE name=$1 AND is_etf=false LIMIT 1`, [qTrim]);
  if (r.rows[0]) return {...r.rows[0], step:'2정확'};
  r = await p.query(`SELECT code,name FROM stock_master WHERE LOWER(name)=LOWER($1) AND is_etf=false LIMIT 1`, [qTrim]);
  if (r.rows[0]) return {...r.rows[0], step:'2b대소문자'};
  r = await p.query(`SELECT code,name FROM stock_master WHERE is_etf=false AND char_length(name)>=3 AND strpos(LOWER($1),LOWER(name))>0 ORDER BY char_length(name) DESC LIMIT 1`, [qTrim]);
  if (r.rows[0]) return {...r.rows[0], step:'3포함'};
  r = await p.query(`SELECT code,name FROM stock_master WHERE is_etf=false AND LOWER($1) LIKE '%'||LOWER(name)||'%' AND char_length(name)>=3 ORDER BY char_length(name) DESC LIMIT 1`, [qTrim]);
  if (r.rows[0]) return {...r.rows[0], step:'4LIKE'};
  const fw = qTrim.split(/[\s,?!]/)[0];
  if (fw && fw.length>=2) {
    r = await p.query(`SELECT code,name FROM stock_master WHERE is_etf=false AND name LIKE $1 ORDER BY char_length(name) ASC LIMIT 1`, [`%${fw}%`]);
    if (r.rows[0]) return {...r.rows[0], step:'5첫단어'};
  }
  if (fw && fw.length>=3) {
    r = await p.query(`SELECT code,name,similarity(name,$1) s FROM stock_master WHERE is_etf=false AND char_length(name)>=3 AND similarity(name,$1)>0.4 ORDER BY s DESC LIMIT 1`, [fw]);
    if (r.rows[0]) return {...r.rows[0], step:'6오타'};
  }
  return null;
}

(async () => {
  // jp: 전체 종목 (ETF 제외)
  const stocks = await p.query(`SELECT code, name FROM stock_master WHERE is_etf=false ORDER BY name`);
  console.log(`전체 종목: ${stocks.rows.length}개 — 각 종목 "이름" + "이름 뭔일있어" 2패턴 테스트\n`);

  let pass = 0, fail = 0, total = 0;
  const failSamples = [];
  const suffixes = ['', ' 뭔일있어'];

  for (const stock of stocks.rows) {
    for (const sfx of suffixes) {
      total++;
      const r = await searchStock(stock.name + sfx);
      if (r && r.code === stock.code) pass++;
      else {
        fail++;
        if (failSamples.length < 50) failSamples.push({ q: stock.name+sfx, expected: stock.name, expCode: stock.code, got: r?`${r.name}(${r.code})`:'못찾음', step: r?.step });
      }
    }
    if (total % 1000 === 0) process.stdout.write(`${total}...`);
  }
  console.log('\n');
  console.log(`========== 전체 종목 검색 테스트 ==========`);
  console.log(`✅ 통과: ${pass}/${total} (${(pass/total*100).toFixed(2)}%)`);
  console.log(`❌ 실패: ${fail}`);
  console.log(`\n=== 실패 샘플 (최대 50) ===`);
  failSamples.forEach(f => console.log(`  ❌ "${f.q}" 기대:${f.expected}(${f.expCode}) 실제:${f.got} [${f.step||'-'}]`));
  await p.end();
})().catch(e => { console.error(e.message); p.end(); });
