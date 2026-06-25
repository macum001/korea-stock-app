// jp: 띄어쓰기 무시 개선 버전 테스트
const axios = require('axios');
require('dotenv').config();

const ID = process.env.NAVER_CLIENT_ID;
const SECRET = process.env.NAVER_CLIENT_SECRET;

function clean(s) {
  return (s||'').replace(/<[^>]*>/g,'').replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;/g,"'").trim();
}

// jp: v2 - 띄어쓰기 제거 후 비교 추가
function relevanceScore(query, title, desc) {
  const q = query.toLowerCase().trim();
  const t = title.toLowerCase();
  const d = (desc||'').toLowerCase();
  // jp: 띄어쓰기 제거 버전
  const qNoSpace = q.replace(/\s+/g, '');
  const tNoSpace = t.replace(/\s+/g, '');
  const dNoSpace = d.replace(/\s+/g, '');

  let score = 0;
  // jp: 1. 제목에 검색어 전체 포함 (띄어쓰기 유지)
  if (t.includes(q)) score += 10;
  // jp: 2. 띄어쓰기 무시하고 제목에 포함 (자사주매입 → 자사주 매입)
  else if (tNoSpace.includes(qNoSpace)) score += 9;
  // jp: 3. 제목 첫 부분
  if (t.startsWith(q) || tNoSpace.startsWith(qNoSpace)) score += 5;
  // jp: 4. 단어별 매칭
  const words = q.split(/\s+/).filter(w => w.length >= 2);
  for (const w of words) {
    if (t.includes(w)) score += 3;
    else if (tNoSpace.includes(w)) score += 2;
    if (d.includes(w)) score += 1;
  }
  // jp: 5. 본문에 띄어쓰기 무시 전체 포함
  if (dNoSpace.includes(qNoSpace)) score += 2;
  return score;
}

function recencyScore(pubDate) {
  const diff = Date.now() - new Date(pubDate).getTime();
  const days = diff / (1000*60*60*24);
  if (days < 1) return 5;
  if (days < 3) return 4;
  if (days < 7) return 3;
  if (days < 14) return 2;
  if (days < 30) return 1;
  return 0;
}

async function searchOptimized(query) {
  const res = await axios.get('https://openapi.naver.com/v1/search/news.json', {
    params: { query, display: 30, sort: 'sim' },
    headers: { 'X-Naver-Client-Id': ID, 'X-Naver-Client-Secret': SECRET },
    timeout: 10000,
  });
  let items = (res.data?.items ?? []).map(it => {
    const title = clean(it.title);
    const desc = clean(it.description);
    const relScore = relevanceScore(query, title, desc);
    return { title, desc, pubDate: it.pubDate, relScore, totalScore: relScore*2 + recencyScore(it.pubDate) };
  });
  const filtered = items.filter(it => it.relScore >= 3);
  filtered.sort((a,b) => b.totalScore - a.totalScore);
  if (filtered.length < 3) {
    items.sort((a,b)=>b.totalScore-a.totalScore);
    return items.slice(0, 15);
  }
  return filtered.slice(0, 15);
}

const QUERIES = [
  '삼성전자','SK하이닉스','LG에너지솔루션','삼성바이오로직스','현대차','기아','POSCO홀딩스','NAVER','카카오','셀트리온',
  '에코프로비엠','포스코퓨처엠','엘앤에프','SK이노베이션','한화솔루션','두산에너빌리티','HMM','대한항공','CJ제일제당','아모레퍼시픽',
  'KB금융','SK텔레콤','LG화학','LG전자','GS건설','DB하이텍','KT','S-Oil','한온시스템','DL이앤씨',
  '에이비엘바이오','알테오젠','HLB','펄어비스','위메이드','컴투스','네오위즈','카카오게임즈','크래프톤','데브시스터즈',
  '이차전지','반도체','바이오','자율주행','로봇','우주항공','원전','수소','태양광','풍력',
  'HBM 반도체','AI 반도체','전기차 배터리','반도체 장비','2차전지 소재','바이오 신약','게임주','조선주','방산주','은행주',
  '코스피','코스닥','환율','금리','美증시','나스닥','연준','인플레이션','국채','외국인 순매수',
  '테슬라','엔비디아','애플','마이크로소프트','아마존','구글','메타','마이크론','TSMC','인텔',
  '실적발표','유상증자','자사주매입','배당','M&A','상장','감자','액면분할','무상증자','전환사채',
  'STX','OCI','GS','LS','한국타이어','코웨이','오리온','농심','롯데케미칼','SK스퀘어',
];

(async () => {
  const results = [];
  let idx = 0;
  for (const q of QUERIES) {
    idx++;
    try {
      const items = await searchOptimized(q);
      const top5 = items.slice(0, 5);
      const top5AvgRel = top5.length > 0 ? top5.reduce((a,b)=>a+b.relScore,0)/top5.length : 0;
      const quality = top5AvgRel >= 6 ? 'GOOD' : (top5AvgRel >= 3 ? 'OK' : 'BAD');
      results.push({ q, count: items.length, top5AvgRel: top5AvgRel.toFixed(1), quality, top1: items[0]?.title.slice(0,35) });
    } catch (e) {
      results.push({ q, count: 0, top5AvgRel: 0, quality: 'ERROR', top1: e.message });
    }
    if (idx % 20 === 0) process.stdout.write(`${idx}...`);
    await new Promise(r => setTimeout(r, 150));
  }
  console.log('\n');

  const good = results.filter(r => r.quality === 'GOOD').length;
  const ok = results.filter(r => r.quality === 'OK').length;
  const bad = results.filter(r => r.quality === 'BAD').length;

  console.log('========== v2 (띄어쓰기 개선) ==========');
  console.log(`GOOD: ${good}개 (${good}%)  OK: ${ok}개  BAD: ${bad}개`);
  console.log(`\n=== 남은 문제 케이스 ===`);
  results.filter(r => r.quality !== 'GOOD').forEach(r => {
    console.log(`  ${r.quality==='BAD'?'❌':'⚠️'} "${r.q}" → 상위5평균:${r.top5AvgRel}, top1:"${r.top1}"`);
  });
})().catch(e => console.error(e.message));
