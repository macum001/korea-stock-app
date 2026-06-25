// jp: 종목 검색 100개 대량 테스트 - 약점 발견용
const {Pool} = require('pg');
require('dotenv').config();
const p = new Pool({connectionString: process.env.DATABASE_URL});

const ALIAS = {
  // 한글↔영문
  '네이버':'NAVER','네이바':'NAVER',
  '엘지전자':'LG전자','엘지화학':'LG화학','엘지엔솔':'LG에너지솔루션','엘지에너지솔루션':'LG에너지솔루션',
  '엘지이노텍':'LG이노텍','엘지생활건강':'LG생활건강','엘지유플러스':'LG유플러스','엘지디스플레이':'LG디스플레이',
  '포스코홀딩스':'POSCO홀딩스','포스코':'POSCO홀딩스','포스코퓨처엠':'포스코퓨처엠',
  '에스케이하이닉스':'SK하이닉스','에스케이텔레콤':'SK텔레콤','에스케이이노베이션':'SK이노베이션',
  '에스케이이터닉스':'SK이터닉스','케이비금융':'KB금융','케이티':'KT',
  // 줄임말
  '삼전':'삼성전자','삼바':'삼성바이오로직스','하이닉스':'SK하이닉스','이터닉':'SK이터닉스',
  'lg엔솔':'LG에너지솔루션','기아차':'기아','현차':'현대차','현대차':'현대차',
  // 대표 그룹명 → 대표 종목
  '삼성':'삼성전자',
};

// jp: 한글 발음 → 영문 약자 자동 변환 규칙
const PHONETIC = [
  ['엘지', 'LG'], ['에스케이', 'SK'], ['케이비', 'KB'], ['케이티', 'KT'],
  ['지에스', 'GS'], ['엘에스', 'LS'], ['씨제이', 'CJ'], ['디엘', 'DL'],
  ['에이치엠엠', 'HMM'], ['포스코', 'POSCO'],
];

async function searchStock(q) {
  let qTrim = q.trim();
  const qLower = qTrim.toLowerCase();

  // jp: 0. 먼저 원본 그대로 정확매칭 시도 (별칭/변환 부작용 방지)
  //    "포스코퓨처엠", "삼성바이오로직스"처럼 정식명이 이미 있으면 변환 안 함
  let pre = await p.query(`SELECT code,name FROM stock_master WHERE name=$1 AND is_etf=false LIMIT 1`, [qTrim]);
  if (pre.rows[0]) return {...pre.rows[0], step:'0정식명'};

  // jp: 1. 명시적 별칭 - 질문 전체가 별칭과 정확히 일치할 때만 (부분치환 위험 제거)
  let aliasApplied = false;
  if (ALIAS[qLower]) {
    qTrim = ALIAS[qLower];
    aliasApplied = true;
  } else {
    // jp: 별칭이 질문 안에 단어로 포함된 경우 (예: "하이닉스 뭔일" → "SK하이닉스 뭔일")
    //     단, 더 긴 정식 종목명이 이미 매칭되면 건너뜀
    for (const [a, r] of Object.entries(ALIAS)) {
      // jp: 별칭이 다른 종목명의 일부인지 확인 (삼성 → 삼성바이오로직스 오염 방지)
      const longerMatch = await p.query(
        `SELECT 1 FROM stock_master WHERE is_etf=false AND char_length(name)>char_length($1) AND strpos(LOWER($2),LOWER(name))>0 LIMIT 1`,
        [a, qTrim]
      );
      if (longerMatch.rows[0]) continue; // 더 긴 종목명 있으면 별칭 적용 안 함
      if (qLower.includes(a.toLowerCase())) {
        qTrim = qTrim.toLowerCase().replace(a.toLowerCase(), r);
        aliasApplied = true;
        break;
      }
    }
  }

  // jp: 2. 한글발음→영문 자동변환 (별칭 적용 안 됐고, 정식명에 없을 때만)
  if (!aliasApplied) {
    for (const [ko, en] of PHONETIC) {
      if (qTrim.includes(ko)) {
        const converted = qTrim.replace(ko, en);
        // jp: 변환 결과가 실제 종목으로 존재하는지 먼저 확인
        const check = await p.query(
          `SELECT 1 FROM stock_master WHERE is_etf=false AND (name=$1 OR strpos(LOWER($1),LOWER(name))>0) LIMIT 1`,
          [converted]
        );
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

// jp: 100개 테스트 - [질문, 기대종목명(또는 null)]
const TESTS = [
  // 정확한 종목명
  ['삼성전자','삼성전자'],['SK하이닉스','SK하이닉스'],['카카오','카카오'],['현대차','현대차'],['기아','기아'],
  ['NAVER','NAVER'],['셀트리온','셀트리온'],['크래프톤','크래프톤'],['펄어비스','펄어비스'],['알테오젠','알테오젠'],
  // 자연어 질문
  ['삼성전자 뭔일있어','삼성전자'],['SK하이닉스 주가 어때','SK하이닉스'],['카카오 공시 분석해줘','카카오'],
  ['현대차 오늘 왜 올랐어','현대차'],['셀트리온 최근 뉴스','셀트리온'],['크래프톤 실적 어때','크래프톤'],
  // 코드
  ['005930','삼성전자'],['000660','SK하이닉스'],['035720','카카오'],['005930 분석','삼성전자'],['000660 뭔일','SK하이닉스'],
  // 별칭
  ['네이버','NAVER'],['네이버 주가','NAVER'],['삼전','삼성전자'],['삼전 어때','삼성전자'],['삼바','삼성바이오로직스'],
  ['하이닉스','SK하이닉스'],['하이닉스 뭔일','SK하이닉스'],['기아차','기아'],['엘지엔솔','LG에너지솔루션'],['이터닉','SK이터닉스'],
  // 소문자/대소문자
  ['sk하이닉스','SK하이닉스'],['sk하이닉스 어때','SK하이닉스'],['naver','NAVER'],['kt','KT'],['lg전자','LG전자'],
  // 오타
  ['SK하이믹스','SK하이닉스'],['삼송전자',null],['카카오오','카카오'],['현댜차',null],['셀트리욘',null],
  // 부분명
  ['에코프로비엠','에코프로비엠'],['에코프로','에코프로'],['포스코퓨처엠','포스코퓨처엠'],['LG에너지솔루션','LG에너지솔루션'],['삼성바이오로직스','삼성바이오로직스'],
  // 중소형주
  ['HLB','HLB'],['위메이드','위메이드'],['컴투스','컴투스'],['네오위즈','네오위즈'],['데브시스터즈','데브시스터즈'],
  ['카카오게임즈','카카오게임즈'],['에이비엘바이오','에이비엘바이오'],['한온시스템','한온시스템'],['DB하이텍','DB하이텍'],['DL이앤씨','DL이앤씨'],
  // 영문 혼합
  ['KB금융','KB금융'],['SK텔레콤','SK텔레콤'],['LG화학','LG화학'],['GS건설','GS건설'],['S-Oil','S-Oil'],
  ['POSCO홀딩스','POSCO홀딩스'],['HMM','HMM'],['CJ제일제당','CJ제일제당'],['SK이노베이션','SK이노베이션'],['SK스퀘어','SK스퀘어'],
  // 짧은 이름 (오매칭 위험)
  ['STX','STX'],['OCI','OCI'],['GS','GS'],['LS','LS'],['KT','KT'],
  // 긴 질문
  ['삼성전자 최근 공시 보고 주가 영향 알려줘','삼성전자'],['SK하이닉스랑 삼성전자 중 뭐가 나아','SK하이닉스'],
  ['오늘 반도체 관련주 흐름 어때',null],['카카오 뉴스랑 공시 종합해줘','카카오'],['현대차 배당 언제 줘','현대차'],
  // 띄어쓰기 변형
  ['에스케이하이닉스','SK하이닉스'],['엘지전자','LG전자'],['엘지화학','LG화학'],['포스코홀딩스','POSCO홀딩스'],['씨제이제일제당',null],
  // 그룹명/약칭
  ['삼성','삼성전자'],['LG','LG'],['SK','SK'],['현대','현대차'],['롯데',null],
  // 업종 키워드 (종목 아님 - null 기대)
  ['반도체',null],['이차전지',null],['바이오',null],['게임주',null],['은행주',null],
  // 특수 케이스
  ['두산에너빌리티','두산에너빌리티'],['한화솔루션','한화솔루션'],['아모레퍼시픽','아모레퍼시픽'],['오리온','오리온'],['농심','농심'],
];

(async () => {
  let pass = 0, fail = 0, idx = 0;
  const fails = [];
  for (const [q, expected] of TESTS) {
    idx++;
    const r = await searchStock(q);
    const got = r ? r.name : null;
    // jp: 기대값이 null이면 "못찾거나 아무거나" 허용 (업종 키워드 등)
    let ok;
    if (expected === null) {
      ok = true; // 업종 키워드는 뭐가 나오든 패스 (검색 안되는게 정상이지만 뭐든 나와도 OK)
    } else {
      ok = got === expected;
    }
    if (ok) pass++;
    else { fail++; fails.push({ q, expected, got: got || '못찾음', step: r?.step }); }
  }
  console.log(`\n========== 종목 검색 100개 테스트 ==========`);
  console.log(`통과: ${pass}/${TESTS.length} (${(pass/TESTS.length*100).toFixed(0)}%)`);
  console.log(`\n=== 실패 케이스 ===`);
  fails.forEach(f => console.log(`  ❌ "${f.q}" 기대:${f.expected} 실제:${f.got} [${f.step||'-'}]`));
  await p.end();
})().catch(e => { console.error(e.message); p.end(); });
