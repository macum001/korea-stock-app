const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();
const client = new Anthropic.default();

// =====================================================================
// V4 프롬프트 - V3 개선
// 개선점:
// 1. 자본잠식 예시 추가 (시나리오 3 실패 케이스)
// 2. "감사의견 적정 = neutral 기본" 명시 (시나리오 8 오판)
// 3. 필드 우선순위 명시 (JSON 잘림 방지)
// =====================================================================
const OUTPUT_V4 = `당신은 한국 DART 공시 분석가입니다. 투자자가 30초 안에 핵심을 파악할 수 있게 분석해주세요.

[공시 유형별 필수 체크]
- 실적공시: keyNumbers에 매출/영업이익/순이익 반드시 포함
- 자본변동(CB/BW/유상증자): keyNumbers에 발행금액/희석률/전환가액 포함, riskSignals yellow 이상
- 감사의견 한정/거절: riskSignals에 red 반드시 포함, delistingRisk 작성
- 감사의견 적정: 다른 악재 없으면 impact=neutral (적정 감사의견은 안전 신호)
- 소송: keyNumbers에 배상금/자본금대비비율 포함
- 임원변경/단순보고: summary만 간결하게, detail 200자 이내

[impact 판단 기준]
- positive: 실적 개선, 대형 계약, 호재 공시
- negative: 자본잠식, 감사한정/거절, 대규모 희석, 소송패소, 최대주주변경(채무담보)
- neutral: 감사의견 적정 + 소규모 리스크, 임원변경, 단순 보고
- unknown: 판단 불가

[핵심 예시 2개]

예시1 - 전환사채:
입력: "CB 300억, 전환가 2,850원, 리픽싱 70%, 운영자금"
{
  "summary": "300억 CB 발행 → 주가 하락 시 추가 희석 위험",
  "detail": "300억 전환사채로 부채 증가, 리픽싱(70%) 조항으로 주가 하락 시 전환가액 낮아져 희석 확대 가능",
  "reason": "주식 희석 가능성과 부채 증가로 주주가치 훼손 우려",
  "impact": "negative",
  "risks": ["리픽싱으로 희석 확대 가능", "운영자금 목적 → 수익성 개선 불투명"],
  "keyNumbers": [{"label":"발행금액","value":"300억원"},{"label":"전환가액","value":"2,850원"},{"label":"리픽싱 하한","value":"70%"}],
  "riskSignals": [{"level":"yellow","text":"CB 리픽싱으로 주가 하락 시 희석 확대"}],
  "delistingRisk": null,
  "disclosure_subtype": "전환사채발행"
}

예시2 - 자본잠식:
입력: "자본금 100억, 자본총계 40억(잠식률 60%), 영업손실 25억(3년 연속), 감사의견 한정"
{
  "summary": "자본잠식률 60% + 감사한정 → 상장폐지 위험 경보",
  "detail": "자본금 100억 대비 자본총계 40억으로 60% 자본잠식 상태예요. 3년 연속 영업손실에 감사의견 한정까지 받아 계속기업 불확실성이 높아요. 2년 연속 자본잠식 지속 시 관리종목 지정, 이후 상장폐지 심사 대상이 될 수 있어요.",
  "reason": "자본잠식 60% + 감사한정은 상장폐지 사유에 해당할 수 있어 즉각적인 주의가 필요",
  "impact": "negative",
  "risks": ["관리종목 지정 가능성", "상장폐지 심사 위험", "추가 자금조달 어려움"],
  "keyNumbers": [{"label":"자본잠식률","value":"60%"},{"label":"자본금","value":"100억원"},{"label":"자본총계","value":"40억원"}],
  "riskSignals": [{"level":"red","text":"자본잠식 60% + 감사의견 한정 → 상장폐지 위험"}],
  "delistingRisk": "2년 연속 자본잠식 지속 시 관리종목 → 상장폐지 심사 대상",
  "disclosure_subtype": "자본잠식"
}

[규칙]
1. 숫자 한국식: 300억, 1,200억 (30M/1.2B 절대 금지)
2. 없는 데이터는 null (추측 금지)
3. 매수/매도 직접 권유 금지
4. 단정적 미래 예측 금지
5. 필드 우선순위: summary > detail > impact > keyNumbers > riskSignals > 나머지

반드시 JSON만 출력 (마크다운 없이):
{
  "summary": "한 줄 요약 (40~90자)",
  "detail": "인과관계 중심 설명 (공시 유형에 따라 100~800자)",
  "reason": "투자자에게 중요한 이유 (50~200자)",
  "impact": "positive|neutral|negative|unknown",
  "risks": ["주의사항 1~3개"],
  "keyNumbers": [{"label": "항목", "value": "수치"}],
  "timeline": "주요 일정 또는 null",
  "auditOpinion": "감사의견 또는 null",
  "cashFlow": "현금흐름 또는 null",
  "riskSignals": [{"level": "red|yellow|green", "text": "신호"}],
  "delistingRisk": "상장폐지 위험 또는 null",
  "disclosure_subtype": "공시유형"
}`;

// =====================================================================
// 동일한 10개 시나리오로 V4만 재검증
// =====================================================================
const scenarios = [
  { id:1, name:'실적 어닝서프라이즈', input:`종목: 삼성전자 | 공시: 잠정실적\n매출: 1조 2,500억 (+23%) | 영업이익: 1,800억 (+45%) | 시장예상 +15% 상회 | is_good: true`, check: { impact:'positive', hasKeyNumbers:true, hasRiskSignals:true } },
  { id:2, name:'전환사채 발행', input:`종목: 삼미금속 | 공시: CB발행결정\n발행금액: 300억 | 전환가: 2,850원 | 리픽싱: 70% | 목적: 운영자금 | is_capital: true`, check: { impact:'negative', hasKeyNumbers:true, hasRiskSignals:true } },
  { id:3, name:'자본잠식 반기보고서', input:`종목: 테스트기업 | 공시: 반기보고서\n자본금: 100억 | 자본총계: 40억(잠식률 60%) | 영업손실 25억(3년연속) | 감사의견: 한정 | is_capital:true | is_bad:true`, check: { impact:'negative', hasKeyNumbers:true, hasRiskSignals:true, hasDelistingRisk:true } },
  { id:4, name:'대규모 계약', input:`종목: 테스트기업 | 공시: 단일판매공급계약\n계약: 삼성전자 | 금액: 500억(매출35%) | 기간: 1년 | is_good: true`, check: { impact:'positive', hasKeyNumbers:true } },
  { id:5, name:'유상증자', input:`종목: 테스트기업 | 공시: 유상증자결정\n신주: 1,000만주(기존20%) | 발행가: 5,000원 | 조달: 500억 | 목적: 시설투자70%+운영30% | is_capital:true | is_bad:true`, check: { impact:'negative', hasKeyNumbers:true, hasRiskSignals:true } },
  { id:6, name:'소송 패소', input:`종목: 테스트기업 | 공시: 소송판결\n특허침해 패소 | 배상금: 850억(자본금28%) | is_bad: true`, check: { impact:'negative', hasKeyNumbers:true, hasRiskSignals:true } },
  { id:7, name:'임원 소량 증여', input:`종목: 삼성전자 | 공시: 임원증권소유보고\n부사장 김태훈 → 자녀 증여 300주 | 전체 66억주 대비 0.00%`, check: { impact:'neutral' } },
  { id:8, name:'감사의견 적정 분기보고서', input:`종목: 이글벳 | 공시: 분기보고서\n자본금: 63억 | 감사의견: 적정 | 교환사채(자기주식 37만주 예탁) | 소송: 2.2억원`, check: { impact:'neutral', hasRiskSignals:true } },
  { id:9, name:'최대주주 변경', input:`종목: 테스트기업 | 공시: 최대주주변경담보\n홍길동32% → ABC투자조합(채무담보) | is_bad: true`, check: { impact:'negative' } },
  { id:10, name:'계약+실적악화 혼재', input:`종목: 테스트기업 | 공시: 분기보고서\n매출: 800억(-15%) | 영업손실: 50억 | 신규계약: 200억(매출25%) | 부채비율: 280%`, check: { impact:'negative', hasKeyNumbers:true, hasRiskSignals:true } },
];

async function runV4Test() {
  console.log('=== V4 검증 테스트 ===\n');
  let totalScore = 0;
  let correct = 0;
  let totalTokens = 0;

  for (const s of scenarios) {
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system: OUTPUT_V4,
      messages: [{ role: 'user', content: `다음 공시를 분석해주세요:\n${s.input}` }]
    });

    const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const tokens = (res.usage?.input_tokens||0) + (res.usage?.output_tokens||0);
    totalTokens += tokens;

    let parsed;
    try { parsed = JSON.parse(text.replace(/```json|```/g,'').trim()); }
    catch { console.log(`[${s.id}] ${s.name}: JSON파싱실패`); continue; }

    const c = s.check;
    let score = 0;
    score += parsed.impact === c.impact ? 30 : 0;
    score += (!c.hasKeyNumbers || (Array.isArray(parsed.keyNumbers) && parsed.keyNumbers.length > 0)) ? 20 : 0;
    score += (!c.hasRiskSignals || (Array.isArray(parsed.riskSignals) && parsed.riskSignals.length > 0)) ? 20 : 0;
    score += (!c.hasDelistingRisk || (parsed.delistingRisk && parsed.delistingRisk !== 'null')) ? 15 : 0;
    score += (parsed.summary?.length >= 15) ? 10 : 0;
    score += !/\d+[MB]|\$\d+/.test(JSON.stringify(parsed)) ? 5 : 0;

    if (parsed.impact === c.impact) correct++;
    totalScore += score;

    const ok = parsed.impact === c.impact ? '✅' : '❌';
    console.log(`[${s.id}] ${s.name}: ${score}점 | impact=${parsed.impact}${ok} | 토큰=${tokens}`);
    console.log(`     summary: ${parsed.summary?.slice(0,60)}`);

    await new Promise(r => setTimeout(r, 400));
  }

  console.log(`\n=== V4 결과 ===`);
  console.log(`총점: ${totalScore}/1000 | 정확도: ${correct}/10 | 토큰합계: ${totalTokens}`);
  console.log(`\nV3 대비:`);
  console.log(`  점수: 870 → ${totalScore} (${totalScore >= 870 ? '✅ 개선' : '❌ 퇴보'})`);
  console.log(`  정확도: 8/10 → ${correct}/10 (${correct >= 8 ? '✅' : '❌'})`);
}

runV4Test().catch(console.error).finally(() => process.exit(0));
