const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();
const client = new Anthropic.default();

// =====================================================================
// 테스트 시나리오 10개 - 공시 분석 출력 형식
// =====================================================================
const scenarios = [
  {
    id: 1, name: '실적 어닝서프라이즈',
    input: `종목: 삼성전자 | 공시: 연결재무제표기준영업(잠정)실적
매출: 1조 2,500억 (+23% YoY) | 영업이익: 1,800억 (+45% YoY, 이익률 14.4%)
시장예상 대비 +15% 상회 | is_good: true`,
    check: { hasKeyNumbers: true, hasSummary: true, hasDetail: true, hasRisks: true, impact: 'positive' }
  },
  {
    id: 2, name: '전환사채 발행',
    input: `종목: 삼미금속 | 공시: 전환사채발행결정 제4회차
발행금액: 300억원 | 전환가액: 2,850원 | 만기: 3년
리픽싱: 최저 70% | 발행목적: 운영자금 | is_capital: true`,
    check: { hasKeyNumbers: true, hasSummary: true, impact: 'negative', hasRiskSignals: true }
  },
  {
    id: 3, name: '자본잠식 반기보고서',
    input: `종목: 테스트기업 | 공시: 반기보고서
자본금: 100억 | 자본총계: 40억 (잠식률 60%)
영업손실: 25억 (3년 연속) | 감사의견: 한정 (계속기업 불확실성)
is_capital: true | is_bad: true`,
    check: { hasKeyNumbers: true, impact: 'negative', hasRiskSignals: true, hasDelistingRisk: true }
  },
  {
    id: 4, name: '대규모 계약 체결',
    input: `종목: 테스트기업 | 공시: 단일판매공급계약체결
계약상대: 삼성전자 | 금액: 500억 (매출대비 35%) | 기간: 1년
is_good: true`,
    check: { hasKeyNumbers: true, impact: 'positive', hasSummary: true }
  },
  {
    id: 5, name: '유상증자 결정',
    input: `종목: 테스트기업 | 공시: 유상증자결정
신주: 1,000만주 (기존대비 20%) | 발행가: 5,000원 | 조달: 500억
목적: 시설투자 70% + 운영자금 30% | is_capital: true | is_bad: true`,
    check: { hasKeyNumbers: true, impact: 'negative', hasRiskSignals: true }
  },
  {
    id: 6, name: '소송 패소',
    input: `종목: 테스트기업 | 공시: 소송판결결과
사건: 특허침해 손해배상 | 결과: 패소
배상금: 850억 (자본금 28%) | is_bad: true`,
    check: { hasKeyNumbers: true, impact: 'negative', hasRiskSignals: true }
  },
  {
    id: 7, name: '임원 소량 증여',
    input: `종목: 삼성전자 | 공시: 임원주요주주특정증권소유상황보고서
부사장 김태훈 → 자녀 증여 300주 | 전체 주식 66억주 대비 0.00%`,
    check: { impact: 'neutral', hasSummary: true }
  },
  {
    id: 8, name: '감사의견 적정 분기보고서',
    input: `종목: 이글벳 | 공시: 분기보고서
자본금: 63억 | 발행주식: 1,264만주 | 감사의견: 적정
교환사채 발행 (자기주식 366,986주 예탁) | 소송진행: 2.2억원`,
    check: { hasKeyNumbers: true, impact: 'neutral', hasRiskSignals: true }
  },
  {
    id: 9, name: '최대주주 변경',
    input: `종목: 테스트기업 | 공시: 최대주주변경수반주식담보제공
변경전: 홍길동 32% → 담보취득: ABC투자조합
사유: 대표이사 개인 채무 | is_bad: true`,
    check: { hasKeyNumbers: false, impact: 'negative', hasSummary: true }
  },
  {
    id: 10, name: '주요계약 + 실적악화 혼재',
    input: `종목: 테스트기업 | 공시: 분기보고서
매출: 800억 (-15% YoY) | 영업손실: 50억 (전기 +30억)
신규계약 체결: 200억 (매출대비 25%) | 부채비율: 280%`,
    check: { hasKeyNumbers: true, impact: 'negative', hasRiskSignals: true }
  },
];

// =====================================================================
// 프롬프트 버전들
// =====================================================================

const OUTPUT_V1 = `{
  "summary": "공시 내용 한 줄 요약 (40~90자)",
  "detail": "자세한 설명 (600~1200자)",
  "reason": "왜 중요한지 (100~250자)",
  "impact": "positive|neutral|negative|unknown",
  "risks": ["리스크 1~3개"],
  "keyNumbers": [{"label": "항목명", "value": "수치"}],
  "timeline": "주요 일정",
  "auditOpinion": "감사의견",
  "cashFlow": "현금흐름",
  "riskSignals": [{"level": "red|yellow|green", "text": "신호"}],
  "delistingRisk": "상장폐지 위험",
  "disclosure_subtype": "공시 유형"
}`;

const OUTPUT_V2 = `당신은 한국 DART 공시 분석가입니다. 공시를 투자자 관점에서 분석해서 JSON으로만 답하세요.

규칙:
- 숫자 한국식: 300억, 1,200억 (30M 금지)
- 데이터 없으면 null
- 매수/매도 권유 금지
- 인과관계로 설명 (A → B → C)

출력 형식:
{
  "summary": "한 줄 요약 (40~90자)",
  "detail": "인과관계 중심 설명 (600~1200자)",
  "reason": "이 공시가 중요한 이유 (100~250자)",
  "impact": "positive|neutral|negative|unknown",
  "risks": ["투자자 주의사항 1~3개"],
  "keyNumbers": [{"label": "항목", "value": "수치(단위포함)"}],
  "timeline": "주요 일정 또는 null",
  "auditOpinion": "감사의견 또는 null",
  "cashFlow": "현금흐름 요약 또는 null",
  "riskSignals": [{"level": "red|yellow|green", "text": "위험신호"}],
  "delistingRisk": "상장폐지 위험 또는 null",
  "disclosure_subtype": "공시유형"
}`;

const OUTPUT_V3 = `당신은 한국 DART 공시 분석가입니다. 투자자가 30초 안에 핵심을 파악할 수 있게 분석해주세요.

[공시 유형별 필수 체크]
- 실적공시: keyNumbers에 매출/영업이익/순이익 반드시 포함
- 자본변동(CB/BW/유상증자): keyNumbers에 발행금액/희석률/전환가액 포함, riskSignals yellow 이상
- 감사의견 한정/거절: riskSignals에 red 반드시 포함, delistingRisk 작성
- 소송: keyNumbers에 배상금/자본금대비비율 포함
- 임원변경/단순보고: summary만 간결하게, detail 200자 이내

[핵심 예시]
입력: "전환사채 300억, 전환가 2,850원, 리픽싱 70%, 운영자금"
summary: "300억 CB 발행 → 주가 하락 시 추가 희석 위험"
detail: "300억 전환사채 발행으로 부채가 늘고, 향후 주식 전환 시 기존 주주 지분이 희석돼요. 특히 리픽싱 조항(최저 70%)이 있어 주가 하락 시 전환가액이 낮아져 희석 규모가 더 커질 수 있어요."
riskSignals: [{"level":"yellow","text":"CB 리픽싱으로 주가 하락 시 희석 확대 가능"}]

[규칙]
1. 숫자 한국식: 300억, 1,200억 (30M/1.2B 절대 금지)
2. 없는 데이터는 null (추측 금지)
3. 매수/매도 직접 권유 금지
4. 단정적 예측 금지 ("반드시/확실히")
5. 중요도 낮은 공시(임원 소량 증여 등)는 간결하게

출력 형식 (JSON만, 마크다운 없이):
{
  "summary": "한 줄 요약 (40~90자)",
  "detail": "인과관계 중심 설명 (공시 유형에 따라 100~1200자)",
  "reason": "이 공시가 투자자에게 중요한 이유 (100~250자)",
  "impact": "positive|neutral|negative|unknown",
  "risks": ["투자자 주의사항 1~3개 짧게"],
  "keyNumbers": [{"label": "항목명", "value": "수치(단위포함)"}],
  "timeline": "주요 일정 요약 또는 null",
  "auditOpinion": "감사의견 또는 null",
  "cashFlow": "현금흐름 요약 또는 null",
  "riskSignals": [{"level": "red|yellow|green", "text": "위험/주의/안전 신호"}],
  "delistingRisk": "상장폐지 위험 설명 또는 null",
  "disclosure_subtype": "공시유형 한 단어"
}`;

// =====================================================================
// 테스트 실행
// =====================================================================
async function testPrompt(vName, systemPrompt, scenario) {
  try {
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      system: systemPrompt,
      messages: [{ role: 'user', content: `다음 공시를 분석해주세요:\n${scenario.input}` }]
    });

    const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const tokens = (res.usage?.input_tokens || 0) + (res.usage?.output_tokens || 0);

    let parsed;
    try { parsed = JSON.parse(text.replace(/```json|```/g, '').trim()); }
    catch { return { success: false, error: 'JSON파싱실패', tokens }; }

    const c = scenario.check;
    const scores = {
      impactCorrect:     (parsed.impact === c.impact) ? 30 : 0,
      hasSummary:        (!c.hasSummary || (parsed.summary?.length >= 15)) ? 10 : 0,
      hasDetail:         (!c.hasDetail || (parsed.detail?.length >= 80)) ? 10 : 0,
      hasKeyNumbers:     (!c.hasKeyNumbers || (Array.isArray(parsed.keyNumbers) && parsed.keyNumbers.length > 0)) ? 15 : 0,
      hasRiskSignals:    (!c.hasRiskSignals || (Array.isArray(parsed.riskSignals) && parsed.riskSignals.length > 0)) ? 15 : 0,
      hasDelistingRisk:  (!c.hasDelistingRisk || (parsed.delistingRisk && parsed.delistingRisk !== 'null')) ? 10 : 0,
      noEnglishNumbers:  !/\d+[MB]|\$\d+/.test(JSON.stringify(parsed)) ? 5 : 0,
      hasRisks:          (!c.hasRisks || (Array.isArray(parsed.risks) && parsed.risks.length > 0)) ? 5 : 0,
    };

    const score = Object.values(scores).reduce((a, b) => a + b, 0);
    return { success: true, parsed, scores, score, tokens };
  } catch(e) {
    return { success: false, error: e.message, tokens: 0 };
  }
}

async function runTests() {
  const versions = [
    { name: 'V1 (형식만)', prompt: OUTPUT_V1 },
    { name: 'V2 (규칙추가)', prompt: OUTPUT_V2 },
    { name: 'V3 (예시+유형별)', prompt: OUTPUT_V3 },
  ];

  const results = {};
  for (const v of versions) results[v.name] = { totalScore: 0, totalTokens: 0, details: [] };

  console.log('=== 공시 출력형식 프롬프트 테스트 ===\n');

  for (const s of scenarios) {
    console.log(`\n[시나리오 ${s.id}] ${s.name} (예상: ${s.check.impact})`);
    for (const v of versions) {
      const r = await testPrompt(v.name, v.prompt, s);
      if (r.success) {
        results[v.name].totalScore += r.score;
        results[v.name].totalTokens += r.tokens;
        results[v.name].details.push({ id: s.id, score: r.score, impact: r.parsed.impact, correct: r.parsed.impact === s.check.impact });
        const correct = r.parsed.impact === s.check.impact ? '✅' : '❌';
        console.log(`  ${v.name}: ${r.score}점 | impact=${r.parsed.impact}${correct} | 토큰=${r.tokens}`);
      } else {
        console.log(`  ${v.name}: 실패 - ${r.error}`);
      }
      await new Promise(r => setTimeout(r, 400));
    }
  }

  console.log('\n\n=== 최종 결과 ===');
  for (const [n, d] of Object.entries(results)) {
    const correct = d.details.filter(x => x.correct).length;
    console.log(`${n}: ${d.totalScore}점 | 정확도 ${correct}/10 | 토큰합계 ${d.totalTokens}`);
  }

  const best = Object.entries(results).sort((a,b) => b[1].totalScore - a[1].totalScore)[0];
  console.log(`\n🏆 최적: ${best[0]} (${best[1].totalScore}점)`);
}

runTests().catch(console.error).finally(() => process.exit(0));
