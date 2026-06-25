// jp: 프롬프트 자체 테스트 - 10개 시나리오로 최적화
// jp: 실제 DB 데이터 기반 시나리오

const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

const client = new Anthropic.default();

// =====================================================================
// 테스트 시나리오 10개
// =====================================================================
const scenarios = [
  // 1. 일반 임원 증여 (낮은 중요도)
  {
    id: 1,
    name: '임원 주식 증여 (낮은 중요도)',
    disclosureText: `
종목명: 삼성전자
공시명: 임원ㆍ주요주주특정증권등소유상황보고서
내용: 삼성전자 부사장 김태훈이 보유주식 300주를 자녀에게 증여
변동전 보유: 2,285주 → 변동후: 1,985주
전체 발행주식: 약 66억주 대비 0.00%
`,
    expectedImpact: 'neutral',
    expectedKeywords: ['증여', '영향 없음', '소량'],
    forbiddenKeywords: ['악재', '위험', '주의'],
  },

  // 2. 전환사채 발행 (중간 중요도)
  {
    id: 2,
    name: '전환사채 300억 발행',
    disclosureText: `
종목명: 삼미금속
공시명: 증권발행결과(자율공시) 제4회차 CB
내용: 300억원 규모 무이자 사모 전환사채 발행, 2026년 6월 10일 납입완료
전환가액/만기/이자율/투자자: 미공시
is_capital: true
`,
    expectedImpact: 'negative',
    expectedKeywords: ['희석', '전환사채', '부채'],
    forbiddenKeywords: ['호재', '긍정적'],
  },

  // 3. 분기보고서 (정보 제공)
  {
    id: 3,
    name: '분기보고서 - 소송 포함',
    disclosureText: `
종목명: 이글벳
공시명: 분기보고서 (2026.03)
자본금: 63억 2천만원, 발행주식: 1,264만주
교환사채 발행으로 자기주식 366,986주 예탁
소송 진행중: 손해배상 2억 2,100만원
연구개발비/매출: 0.95%
시장점유율: 1.5~2%
감사의견: 적정
`,
    expectedImpact: 'neutral',
    expectedKeywords: ['교환사채', '소송', '감사의견'],
    forbiddenKeywords: ['폭락', '위험'],
  },

  // 4. 주주총회 소집 - 이사 선임
  {
    id: 4,
    name: '임시주주총회 이사 선임',
    disclosureText: `
종목명: 크라우드웍스
공시명: 임시주주총회소집결의
주총일: 2026년 7월 3일
안건: 박항준 사내이사 신규 선임 (임기 3년)
원래 안건이었던 정관 변경은 이유 없이 삭제됨
BW 만기전 취득 2회 실시
`,
    expectedImpact: 'neutral',
    expectedKeywords: ['이사 선임', '주주총회'],
    forbiddenKeywords: ['급등', '폭등'],
  },

  // 5. 자본잠식 공시
  {
    id: 5,
    name: '자본잠식 위험 공시',
    disclosureText: `
종목명: 테스트기업
공시명: 반기보고서
자본금: 100억원
자본총계: 45억원 (자본잠식률 55%)
영업손실: 30억원 (3년 연속)
감사의견: 한정 (계속기업 불확실성)
is_capital: true
`,
    expectedImpact: 'negative',
    expectedKeywords: ['자본잠식', '한정', '위험'],
    forbiddenKeywords: ['안전', '문제없음'],
  },

  // 6. 대규모 계약 체결
  {
    id: 6,
    name: '대규모 계약 체결 호재',
    disclosureText: `
종목명: 테스트기업
공시명: 단일판매공급계약체결
계약상대: 삼성전자
계약금액: 500억원 (매출액 대비 35%)
계약기간: 2026.07~2027.06
is_good: true
`,
    expectedImpact: 'positive',
    expectedKeywords: ['계약', '매출', '호재'],
    forbiddenKeywords: ['위험', '악재'],
  },

  // 7. 유상증자 결정
  {
    id: 7,
    name: '유상증자 결정',
    disclosureText: `
종목명: 테스트기업
공시명: 주요사항보고서(유상증자결정)
증자방식: 주주배정 후 실권주 일반공모
신주 발행수: 1,000만주 (기존 주식의 20%)
발행가: 5,000원
조달목적: 시설투자 및 운영자금
is_capital: true
is_bad: true
`,
    expectedImpact: 'negative',
    expectedKeywords: ['희석', '유상증자', '20%'],
    forbiddenKeywords: ['호재', '매수'],
  },

  // 8. 실적 서프라이즈
  {
    id: 8,
    name: '실적 어닝서프라이즈',
    disclosureText: `
종목명: 테스트기업
공시명: 연결재무제표기준영업(잠정)실적(공정공시)
매출액: 1조 2,500억원 (전년비 +23%)
영업이익: 1,800억원 (전년비 +45%, 영업이익률 14.4%)
당기순이익: 1,200억원 (전년비 +38%)
시장 예상치 대비: 영업이익 +15% 상회
is_good: true
`,
    expectedImpact: 'positive',
    expectedKeywords: ['영업이익', '상회', '성장'],
    forbiddenKeywords: ['위험', '악재'],
  },

  // 9. 소송 패소
  {
    id: 9,
    name: '대규모 소송 패소',
    disclosureText: `
종목명: 테스트기업
공시명: 소송등의판결ㆍ결정
원고: 특허권자
사건: 특허침해 손해배상
판결: 원고 일부 승소 (당사 패소)
배상금액: 850억원
자본금 대비 비율: 28%
is_bad: true
`,
    expectedImpact: 'negative',
    expectedKeywords: ['패소', '배상', '리스크'],
    forbiddenKeywords: ['안전', '호재'],
  },

  // 10. 최대주주 변경
  {
    id: 10,
    name: '최대주주 변경',
    disclosureText: `
종목명: 테스트기업
공시명: 최대주주변경을수반하는주식담보제공계약체결
변경전 최대주주: 홍길동 (지분율 32%)
변경후 최대주주: ABC투자조합 (담보 취득)
담보 제공 주식: 전체 32% 전량
사유: 홍길동 대표 개인 채무 담보
`,
    expectedImpact: 'negative',
    expectedKeywords: ['최대주주', '변경', '불확실'],
    forbiddenKeywords: ['안정적', '호재'],
  },
];

// =====================================================================
// 프롬프트 버전들 (테스트할 버전)
// =====================================================================
const PROMPT_V1 = `당신은 한국 DART 공시 전문 분석가입니다. 투자자가 이해하기 쉽게 공시를 해석해주세요.

주요 규칙:
- 데이터에 있는 내용만 분석하세요
- 매수/매도 직접 권유 금지
- 영어식 숫자 금지 (30M → 300억)

반드시 JSON만 출력하세요:
{
  "summary": "한 줄 요약 (40~90자)",
  "detail": "자세한 설명 (150~400자)",
  "impact": "positive|neutral|negative|unknown",
  "notes": ["참고사항 1~3개"]
}`;

const PROMPT_V2 = `당신은 한국 DART 공시 전문 분석가입니다. 투자자가 이해하기 쉽게 공시를 해석해주세요.

공시 종류별 분석 포커스:
- 실적공시: 매출/영업이익/순이익 전년 대비, 어닝서프라이즈 여부
- 자본변동(유상증자/CB/BW): 규모, 주식 희석 효과, 자금 사용 계획
- 임원변경: 핵심 임원 여부, 경영진 변화 의미
- 주요계약: 계약 규모, 매출 대비 비중
- 소송/분쟁: 금액 규모, 패소 시 영향
- 감사의견: 한정/거절 여부, 계속기업 불확실성

작성 원칙:
1. 인과관계로 설명: "유상증자 → 주식 20% 증가 → 희석 효과 → 단기 주가 하락 압력"
2. 숫자는 맥락과 함께: "영업이익 300억 (전년比 +45%)"
3. 호재/악재 명확히 구분
4. 데이터에 없으면 추측 금지
5. 영어식 숫자 절대 금지 (30M → 300억)
6. 매수/매도 직접 권유 금지

반드시 JSON만 출력하세요:
{
  "summary": "한 줄 요약 (40~90자)",
  "detail": "인과관계 중심 설명 (150~400자)",
  "impact": "positive|neutral|negative|unknown",
  "notes": ["투자자 참고사항 1~3개"]
}`;

const PROMPT_V3 = `당신은 한국 DART 공시 전문 분석가입니다. 투자자 관점에서 공시를 해석해주세요.

[공시 종류별 핵심 포인트]
- 실적공시: 매출/영업이익 전년비 증감, 시장예상 대비 서프라이즈 여부
- 자본변동(유상증자/CB/BW): 희석 규모(%), 조달 목적, 주가 영향
- 임원변경: 핵심 임원 여부 (대표이사/CFO > 일반 임원)
- 주요계약: 규모(매출대비%), 상대방 신뢰도, 수익 실현 시점
- 소송: 배상금(자본금대비%), 패소 확률, 재무 영향
- 감사의견 한정/거절: 즉시 강조, 계속기업 불확실성 명시

[좋은 예시]
입력: "300억 유상증자 결정, 기존주식 2,000만주 대비 신주 400만주(20%) 발행"
출력 summary: "300억 유상증자로 주식 20% 희석 → 단기 주가 하락 압력"
출력 detail: "기존 주주 지분이 20% 희석되는 유상증자를 결정했어요. 발행가 5,000원으로 시가 대비 할인 발행 시 주가 조정 가능성이 있어요. 조달 자금의 사용 계획(시설투자/운영자금 비중)에 따라 중장기 영향은 달라질 수 있어요."

[나쁜 예시 - 절대 하지 마세요]
- "좋은 투자 기회입니다" (투자 권유)
- "주가가 30M 상승했습니다" (영어식 숫자)
- "앞으로 반드시 오를 것입니다" (단정적 예측)
- 데이터에 없는 전환가액을 임의로 작성

[규칙]
1. 인과관계 체인으로 설명 (A → B → C)
2. 숫자는 한국식: 300억, 1,200억, 2조 5,000억
3. 중요도 낮은 공시(임원 소량 증여 등)는 간결하게
4. 데이터 없으면 "원문에 없음"으로 명시
5. 호재/악재/중립 명확히 판단

반드시 JSON만 출력 (마크다운 없이):
{
  "summary": "한 줄 요약 (40~90자)",
  "detail": "인과관계 중심 설명 (150~400자)",
  "impact": "positive|neutral|negative|unknown",
  "notes": ["투자자 참고사항 1~3개 (짧은 줄로)"]
}`;

// =====================================================================
// 테스트 실행
// =====================================================================
async function testPrompt(promptVersion, promptText, scenario) {
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001', // 테스트는 Haiku로 (비용 절감)
      max_tokens: 800,
      system: promptText,
      messages: [{
        role: 'user',
        content: `다음 공시를 분석해주세요:\n${scenario.disclosureText}`
      }]
    });

    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const tokens = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

    let parsed;
    try {
      parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch {
      return { success: false, error: 'JSON 파싱 실패', text, tokens };
    }

    // 평가
    const scores = {
      impactCorrect: parsed.impact === scenario.expectedImpact,
      hasKeywords: scenario.expectedKeywords.filter(k => 
        JSON.stringify(parsed).includes(k)
      ).length,
      noForbidden: scenario.forbiddenKeywords.filter(k => 
        JSON.stringify(parsed).includes(k)
      ).length === 0,
      summaryLength: (parsed.summary || '').length,
      detailLength: (parsed.detail || '').length,
      hasNotes: Array.isArray(parsed.notes) && parsed.notes.length > 0,
      noEnglishNumbers: !/\d+[MB]|\$\d+/.test(JSON.stringify(parsed)),
    };

    const score = (
      (scores.impactCorrect ? 30 : 0) +
      (scores.hasKeywords / scenario.expectedKeywords.length * 25) +
      (scores.noForbidden ? 20 : 0) +
      (scores.summaryLength >= 20 && scores.summaryLength <= 90 ? 10 : 0) +
      (scores.detailLength >= 100 && scores.detailLength <= 500 ? 10 : 0) +
      (scores.noEnglishNumbers ? 5 : 0)
    );

    return { success: true, parsed, scores, score, tokens };
  } catch(e) {
    return { success: false, error: e.message, tokens: 0 };
  }
}

async function runAllTests() {
  const versions = [
    { name: 'V1 (기본)', prompt: PROMPT_V1 },
    { name: 'V2 (인과관계)', prompt: PROMPT_V2 },
    { name: 'V3 (예시포함)', prompt: PROMPT_V3 },
  ];

  const results = {};
  for (const v of versions) results[v.name] = { totalScore: 0, totalTokens: 0, details: [] };

  console.log('=== 프롬프트 최적화 테스트 시작 ===\n');

  for (const scenario of scenarios) {
    console.log(`\n[시나리오 ${scenario.id}] ${scenario.name}`);
    console.log('예상 impact:', scenario.expectedImpact);

    for (const v of versions) {
      const result = await testPrompt(v.name, v.prompt, scenario);
      if (result.success) {
        results[v.name].totalScore += result.score;
        results[v.name].totalTokens += result.tokens;
        results[v.name].details.push({
          scenario: scenario.id,
          score: result.score,
          impactCorrect: result.scores.impactCorrect,
          actual: result.parsed.impact,
          summary: result.parsed.summary?.slice(0, 50),
        });
        console.log(`  ${v.name}: ${result.score.toFixed(0)}점 | impact=${result.parsed.impact}(${result.scores.impactCorrect?'✅':'❌'}) | 토큰=${result.tokens}`);
      } else {
        console.log(`  ${v.name}: 실패 - ${result.error}`);
      }
      // API 레이트 리밋 방지
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log('\n\n=== 최종 결과 ===');
  console.log('버전별 총점 (만점: 1000점):');
  for (const [name, data] of Object.entries(results)) {
    console.log(`  ${name}: ${data.totalScore.toFixed(0)}점 / 토큰 합계: ${data.totalTokens}`);
  }

  // 가장 높은 점수 버전 찾기
  const best = Object.entries(results).sort((a,b) => b[1].totalScore - a[1].totalScore)[0];
  console.log(`\n🏆 최적 버전: ${best[0]} (${best[1].totalScore.toFixed(0)}점)`);

  // 개선점 분석
  console.log('\n=== impact 정확도 분석 ===');
  for (const [name, data] of Object.entries(results)) {
    const correct = data.details.filter(d => d.impactCorrect).length;
    console.log(`  ${name}: ${correct}/${scenarios.length} 정확 (${(correct/scenarios.length*100).toFixed(0)}%)`);
  }
}

runAllTests().catch(console.error).finally(() => process.exit(0));
