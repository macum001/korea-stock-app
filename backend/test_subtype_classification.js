const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();
const client = new Anthropic.default();

// =====================================================================
// 새로운 subtype 분류 체계 (세분화)
// 실제 DB 공시명 패턴 기반
// =====================================================================
const NEW_SUBTYPES = [
  // 증자 (세분화)
  '유상증자_주주배정후실권주공모',
  '유상증자_제3자배정',
  '유상증자_일반공모',
  '유상증자_주주우선공모',
  '유상증자_기타',
  '무상증자',

  // 감자 (세분화)
  '유상감자',
  '무상감자',

  // 사채 발행
  '전환사채_CB',
  '신주인수권부사채_BW',
  '교환사채_EB',
  '일반사채',

  // 실적
  '실적공시_잠정',
  '실적공시_확정',
  '실적공시_수정',
  '매출손익변동',

  // 주요사항
  '단일판매공급계약',
  '타인채무보증',
  '자기주식_취득',
  '자기주식_처분',
  '자기주식_소각',

  // 지배구조
  '최대주주변경',
  '임원변경_대표이사',
  '임원변경_기타',
  '주주총회',

  // 감사/재무
  '감사보고서_적정',
  '감사보고서_한정',
  '감사보고서_거절부적정',
  '자본잠식',

  // 기업변화
  '합병',
  '분할',
  '영업양수도',
  '상장폐지관련',
  '관리종목지정',

  // 배당
  '현금배당',
  '주식배당',

  // 소송/분쟁
  '소송판결',
  '공정위제재',

  // 기타
  '대량보유보고',
  '기업설명회IR',
  '기타',
];

// =====================================================================
// 테스트 시나리오 15개 - 실제 공시명 기반
// =====================================================================
const scenarios = [
  { id:1, report:'주요사항보고서(유상증자결정)', detail:'주주배정 후 실권주 일반공모 방식, 신주 500만주', expected:'유상증자_주주배정후실권주공모' },
  { id:2, report:'주요사항보고서(유상증자결정)', detail:'제3자배정 방식, 특수관계인 배정', expected:'유상증자_제3자배정' },
  { id:3, report:'주요사항보고서(무상증자결정)', detail:'기존주주 1주당 0.3주 무상배정', expected:'무상증자' },
  { id:4, report:'주요사항보고서(유상감자결정)', detail:'주주에게 감자대금 지급', expected:'유상감자' },
  { id:5, report:'주요사항보고서(무상감자결정)', detail:'자본잠식 해소 목적 10:1 감자', expected:'무상감자' },
  { id:6, report:'전환사채권발행결정', detail:'CB 300억, 전환가 2,850원, 리픽싱 70%', expected:'전환사채_CB' },
  { id:7, report:'신주인수권부사채권발행결정', detail:'BW 200억, 행사가 5,000원', expected:'신주인수권부사채_BW' },
  { id:8, report:'연결재무제표기준영업(잠정)실적(공정공시)', detail:'1분기 매출 1.2조, 영업이익 1,800억', expected:'실적공시_잠정' },
  { id:9, report:'매출액또는손익구조30%이상변동', detail:'영업손실 전환, 전기대비 -45%', expected:'매출손익변동' },
  { id:10, report:'단일판매ㆍ공급계약체결', detail:'삼성전자와 500억 공급계약', expected:'단일판매공급계약' },
  { id:11, report:'최대주주등소유주식변동신고서', detail:'최대주주 홍길동→ABC투자조합 변경', expected:'최대주주변경' },
  { id:12, report:'감사보고서제출', detail:'감사의견: 한정 (계속기업 불확실성)', expected:'감사보고서_한정' },
  { id:13, report:'현금ㆍ현물배당결정', detail:'주당 500원 현금배당 결정', expected:'현금배당' },
  { id:14, report:'소송등의판결ㆍ결정', detail:'특허침해 패소, 배상금 850억', expected:'소송판결' },
  { id:15, report:'임원ㆍ주요주주특정증권등소유상황보고서', detail:'부사장 자녀에게 300주 증여', expected:'임원변경_기타' },
];

// =====================================================================
// 프롬프트 버전
// =====================================================================
const SUBTYPE_V1 = `다음 공시명과 내용을 보고 아래 목록 중 가장 적합한 disclosure_subtype을 선택해서 JSON으로만 답하세요.

subtypes: ${JSON.stringify(NEW_SUBTYPES)}

JSON 형식: {"subtype": "선택한_subtype"}`;

const SUBTYPE_V2 = `다음 공시를 분석해서 disclosure_subtype을 분류해주세요.

[분류 규칙]
- 유상증자: 방식에 따라 세분화 (주주배정후실권주공모/제3자배정/일반공모/주주우선공모/기타)
- 감자: 유상(주주에게 대가 지급) vs 무상(대가 없음) 구분
- 사채: CB(전환사채) vs BW(신주인수권부사채) vs EB(교환사채) vs 일반사채
- 실적: 잠정(잠정실적) vs 확정(보고서) vs 수정(정정)
- 감사의견: 적정 vs 한정 vs 거절/부적정 반드시 구분
- 임원변경: 대표이사/CFO 변경은 임원변경_대표이사, 나머지는 임원변경_기타
- 주식소유보고(임원증여 등): 임원변경_기타

사용 가능한 subtypes: ${JSON.stringify(NEW_SUBTYPES)}

JSON만 출력: {"subtype": "선택한_subtype"}`;

const SUBTYPE_V3 = `공시를 분류해서 JSON으로만 답하세요.

[핵심 분류 규칙]
유상증자:
  - 주주배정 후 실권주 일반공모 → 유상증자_주주배정후실권주공모
  - 제3자배정 → 유상증자_제3자배정
  - 일반공모 → 유상증자_일반공모
  - 주주우선공모 → 유상증자_주주우선공모
  - 기타/불명확 → 유상증자_기타

감자:
  - 주주에게 대가 지급 → 유상감자
  - 대가 없음 (자본잠식 해소 등) → 무상감자

사채:
  - 전환사채/CB → 전환사채_CB
  - 신주인수권부사채/BW → 신주인수권부사채_BW
  - 교환사채/EB → 교환사채_EB
  - 일반 회사채 → 일반사채

실적:
  - 잠정실적/영업실적공정공시 → 실적공시_잠정
  - 분기/반기/연간보고서 → 실적공시_확정
  - 정정/수정 → 실적공시_수정
  - 매출손익 30% 이상 변동 → 매출손익변동

감사:
  - 감사의견 적정 → 감사보고서_적정
  - 감사의견 한정 → 감사보고서_한정
  - 부적정/의견거절 → 감사보고서_거절부적정

임원:
  - 대표이사/CFO 변경 → 임원변경_대표이사
  - 임원증권소유보고/소량증여 → 임원변경_기타
  - 사외이사 선임/해임 → 임원변경_기타

subtypes: ${JSON.stringify(NEW_SUBTYPES)}

JSON만 출력: {"subtype": "선택한_subtype"}`;

// =====================================================================
// 테스트 실행
// =====================================================================
async function testPrompt(vName, prompt, scenario) {
  try {
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      system: prompt,
      messages: [{ role: 'user', content: `공시명: ${scenario.report}\n내용: ${scenario.detail}` }]
    });
    const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const tokens = (res.usage?.input_tokens||0) + (res.usage?.output_tokens||0);
    let parsed;
    try { parsed = JSON.parse(text.replace(/```json|```/g,'').trim()); }
    catch { return { success:false, error:'파싱실패', tokens }; }
    const correct = parsed.subtype === scenario.expected;
    return { success:true, subtype:parsed.subtype, correct, tokens };
  } catch(e) {
    return { success:false, error:e.message, tokens:0 };
  }
}

async function runTests() {
  const versions = [
    { name:'V1 (목록만)', prompt:SUBTYPE_V1 },
    { name:'V2 (규칙추가)', prompt:SUBTYPE_V2 },
    { name:'V3 (상세규칙)', prompt:SUBTYPE_V3 },
  ];
  const results = {};
  for (const v of versions) results[v.name] = { correct:0, total:0, tokens:0, wrong:[] };

  console.log('=== 공시 subtype 분류 테스트 ===\n');

  for (const s of scenarios) {
    console.log(`\n[${s.id}] ${s.report.slice(0,30)} → 예상: ${s.expected}`);
    for (const v of versions) {
      const r = await testPrompt(v.name, v.prompt, s);
      results[v.name].total++;
      results[v.name].tokens += r.tokens || 0;
      if (r.success) {
        if (r.correct) results[v.name].correct++;
        else results[v.name].wrong.push({ id:s.id, expected:s.expected, got:r.subtype });
        const ok = r.correct ? '✅' : '❌';
        console.log(`  ${v.name}: ${r.subtype} ${ok}`);
      } else {
        console.log(`  ${v.name}: 실패 - ${r.error}`);
      }
      await new Promise(r => setTimeout(r, 300));
    }
  }

  console.log('\n\n=== 최종 결과 ===');
  for (const [n, d] of Object.entries(results)) {
    console.log(`${n}: ${d.correct}/${d.total} (${(d.correct/d.total*100).toFixed(0)}%) | 토큰 ${d.tokens}`);
    if (d.wrong.length > 0) {
      for (const w of d.wrong) {
        console.log(`  ❌ [${w.id}] 예상:${w.expected} → 실제:${w.got}`);
      }
    }
  }

  const best = Object.entries(results).sort((a,b) => b[1].correct - a[1].correct)[0];
  console.log(`\n🏆 최적: ${best[0]} (${best[1].correct}/${best[1].total})`);
}

runTests().catch(console.error).finally(() => process.exit(0));
