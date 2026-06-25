// jp: 최적화된 뉴스 검색 - sim 정렬 + 관련성 재정렬 + 최신성 가중
const axios = require('axios');
require('dotenv').config();

const ID = process.env.NAVER_CLIENT_ID;
const SECRET = process.env.NAVER_CLIENT_SECRET;

function clean(s) {
  return (s||'').replace(/<[^>]*>/g,'').replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;/g,"'").trim();
}

// jp: 관련성 점수 (제목 위주)
function relevanceScore(query, title, desc) {
  const q = query.toLowerCase().trim();
  const t = title.toLowerCase();
  const d = (desc||'').toLowerCase();
  let score = 0;
  if (t.includes(q)) score += 10;
  if (t.startsWith(q)) score += 5;
  const words = q.split(/\s+/).filter(w => w.length >= 2);
  for (const w of words) {
    if (t.includes(w)) score += 3;
    if (d.includes(w)) score += 1;
  }
  return score;
}

// jp: 최신성 점수 (최근일수록 높음, 최대 5점)
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
  // jp: sim 정렬로 가져오기 (정확도 우선)
  const res = await axios.get('https://openapi.naver.com/v1/search/news.json', {
    params: { query, display: 30, sort: 'sim' },
    headers: { 'X-Naver-Client-Id': ID, 'X-Naver-Client-Secret': SECRET },
    timeout: 10000,
  });

  let items = (res.data?.items ?? []).map(it => {
    const title = clean(it.title);
    const desc = clean(it.description);
    const relScore = relevanceScore(query, title, desc);
    const recScore = recencyScore(it.pubDate);
    return {
      title, desc, pubDate: it.pubDate,
      relScore, recScore,
      // jp: 종합점수 = 관련성*2 + 최신성 (관련성 우선, 최신성 보조)
      totalScore: relScore * 2 + recScore,
    };
  });

  // jp: 관련성 너무 낮은 건 제거 (점수 3 미만)
  items = items.filter(it => it.relScore >= 3);

  // jp: 종합점수로 재정렬
  items.sort((a, b) => b.totalScore - a.totalScore);

  return items.slice(0, 15);
}

async function test(query) {
  const items = await searchOptimized(query);
  const top3 = items.slice(0, 3);
  const avgRel = items.length > 0 ? (items.reduce((a,b)=>a+b.relScore,0)/items.length).toFixed(1) : 0;
  console.log(`\n"${query}" → ${items.length}건 (평균관련성 ${avgRel})`);
  top3.forEach((it, i) => {
    console.log(`  ${i+1}. "${it.title.slice(0,45)}" [관련${it.relScore}/최신${it.recScore}]`);
  });
  await new Promise(r => setTimeout(r, 300));
}

(async () => {
  console.log('=== 최적화 검색 결과 (sim + 재정렬 + 필터) ===');
  const queries = ['삼성전자','SK하이닉스','카카오','에코프로비엠','현대차','이차전지','HBM 반도체','코스피','테슬라','엔비디아'];
  for (const q of queries) await test(q);
})().catch(e => console.error(e.message));
