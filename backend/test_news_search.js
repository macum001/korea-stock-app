// jp: 뉴스 검색 품질 테스트 - date vs sim 정렬 비교, 관련성 점수
const axios = require('axios');
require('dotenv').config();

const ID = process.env.NAVER_CLIENT_ID;
const SECRET = process.env.NAVER_CLIENT_SECRET;

function clean(s) {
  return (s||'').replace(/<[^>]*>/g,'').replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;/g,"'").trim();
}

// jp: 검색어가 제목에 얼마나 정확히 들어있는지 점수화
function relevanceScore(query, title, desc) {
  const q = query.toLowerCase();
  const t = title.toLowerCase();
  const d = (desc||'').toLowerCase();
  let score = 0;
  // 제목에 검색어 전체 포함 = 최고점
  if (t.includes(q)) score += 10;
  // 제목 첫 부분에 포함 = 가산점
  if (t.startsWith(q)) score += 5;
  // 검색어 단어별 매칭
  const words = q.split(/\s+/);
  for (const w of words) {
    if (w.length >= 2) {
      if (t.includes(w)) score += 3;
      if (d.includes(w)) score += 1;
    }
  }
  return score;
}

async function search(query, sort) {
  const res = await axios.get('https://openapi.naver.com/v1/search/news.json', {
    params: { query, display: 20, sort },
    headers: { 'X-Naver-Client-Id': ID, 'X-Naver-Client-Secret': SECRET },
    timeout: 10000,
  });
  return (res.data?.items ?? []).map(it => ({
    title: clean(it.title),
    desc: clean(it.description),
    pubDate: it.pubDate,
  }));
}

async function testQuery(query) {
  console.log(`\n========== "${query}" ==========`);

  for (const sort of ['date', 'sim']) {
    const items = await search(query, sort);
    const scores = items.map(it => relevanceScore(query, it.title, it.desc));
    const avgScore = (scores.reduce((a,b)=>a+b,0) / scores.length).toFixed(1);
    const top3Avg = (scores.slice(0,3).reduce((a,b)=>a+b,0) / 3).toFixed(1);
    const irrelevant = scores.filter(s => s < 3).length;

    console.log(`[${sort}] 평균:${avgScore} 상위3평균:${top3Avg} 관련없음:${irrelevant}/20`);
    console.log(`  1위: "${items[0]?.title.slice(0,40)}" (점수${scores[0]})`);
    console.log(`  2위: "${items[1]?.title.slice(0,40)}" (점수${scores[1]})`);
  }
  await new Promise(r => setTimeout(r, 300));
}

(async () => {
  const queries = [
    '삼성전자', 'SK하이닉스', '카카오', '에코프로비엠', '현대차',
    '이차전지', 'HBM 반도체', '코스피', '테슬라', '엔비디아',
  ];
  for (const q of queries) await testQuery(q);
})().catch(e => console.error(e.message));
