// jp: 주주 중요 공시 중 현재 추출 라벨 없는 유형 파악
const { Pool } = require('pg');
require('dotenv').config();
const p = new Pool({ connectionString: process.env.DATABASE_URL });

// 현재 dartDocument.service.ts가 라벨로 커버하는 유형
const COVERED = ['전환사채','신주인수권','유상증자','무상증자','증자','배당','공급계약','단일판매','자기주식','횡령','배임','감자','주주명부폐쇄','명의개서','권리주주'];

(async () => {
  try {
    // 주주 영향 큰데 라벨 없을 가능성 있는 유형들
    const important = [
      '최대주주변경','최대주주등소유주식변동','경영권','주식분할','주식병합','액면분할','액면병합',
      '합병','분할','영업양수도','자산양수도','주식교환','주식이전',
      '상장폐지','관리종목','거래정지','투자주의환기','불성실공시',
      '소송','특허','파산','회생','부도','당좌거래',
      '주식소각','이익소각','전환청구권행사','신주인수권행사',
      '영업실적','잠정실적','매출액또는손익구조','30%이상변동',
      '유형자산','타법인주식및출자증권','풍문또는보도','조회공시',
      '자기주식처분','자기주식소각','채무','담보제공','채무보증',
      '임원변경','대표이사변경','감사변경','회계처리기준위반'
    ];
    console.log('=== 주주 영향 공시 유형별 건수 (전체 102만건 중) ===\n');
    const results = [];
    for (const kw of important) {
      const r = await p.query('SELECT COUNT(*)::int AS c FROM disclosures WHERE strpos(report_name, $1) > 0', [kw]);
      if (r.rows[0].c > 0) results.push([kw, r.rows[0].c]);
    }
    results.sort((a,b)=>b[1]-a[1]);
    results.forEach(([kw,c]) => {
      const covered = COVERED.some(cv => kw.includes(cv) || cv.includes(kw));
      console.log(`  ${covered?'[추출O]':'[추출X]'} ${kw}: ${c.toLocaleString()}건`);
    });
    p.end();
  } catch (e) { console.error('ERR:', e.message); p.end(); }
})();
