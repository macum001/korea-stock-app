const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();
const client = new Anthropic.default();

// =====================================================================
// 10개 시나리오 - 실제 투자자 질문 패턴 기반
// =====================================================================
const scenarios = [
  {
    id: 1, name: '종목명만 입력 (기본 분석)',
    input: `종목: 삼성전자 (005930) | 시장: KOSPI | 섹터: 반도체
현재가: 72,400원 (+1.68%, +1,200원)
최근공시: 1.[일반] 임원증권소유보고서 (2026-06-22) 2.[일반] 분기보고서 (2026-05-15) 3.[호재] 수주계약 2,000억 체결 (2026-05-10)
최근뉴스: 1.삼성전자 HBM4 엔비디아 납품 가시화 (한국경제, 2시간전) 2.외국인 3거래일 연속 순매수 (매일경제, 4시간전)`,
    check: { impact: 'positive', hasSummary: true, hasDetail: true, hasRecentMoves: true }
  },
  {
    id: 2, name: '"지금 사도 될까요?" 투자판단 질문',
    input: `질문: "삼성전자 지금 사도 될까요?"
종목: 삼성전자 (005930) | 현재가: 72,400원 (+1.68%)
최근공시: 1.[호재] HBM4 수주계약 2,000억 (2026-05-10) 2.[일반] 분기보고서 (2026-05-15)
최근뉴스: 1.HBM4 납품 가시화 (2시간전) 2.외국인 순매수 지속 (4시간전) 3.목표주가 8만원 상향 (6시간전)`,
    check: { impact: 'positive', hasSummary: true, hasNotes: true }
  },
  {
    id: 3, name: '"왜 올랐어?" 원인 분석 질문',
    input: `질문: "SK하이닉스 오늘 왜 이렇게 올라?"
종목: SK하이닉스 (000660) | 현재가: 219,500원 (+5.61%, +11,700원)
최근공시: 1.[호재] 1분기 영업이익 7조원 (2026-04-25)
최근뉴스: 1.엔비디아 HBM3E 독점공급 확정 보도 (1시간전) 2.AI 서버 수요 폭증으로 목표주가 30만원 상향 (3시간전)`,
    check: { impact: 'positive', hasSummary: true, hasDetail: true }
  },
  {
    id: 4, name: '악재 공시 + 하락 종목',
    input: `질문: "카카오 왜 이렇게 빠져?"
종목: 카카오 (035720) | 현재가: 38,200원 (-4.2%, -1,675원)
최근공시: 1.[악재] 공정위 과징금 3,200억 부과 (2026-06-20) 2.[일반] 분기보고서 (2026-05-14)
최근뉴스: 1.카카오 과징금 3,200억 → 당기순이익 절반 수준 (2시간전) 2.카카오 경영진 리스크 재부각 (4시간전)`,
    check: { impact: 'negative', hasSummary: true, hasNotes: true }
  },
  {
    id: 5, name: '자본잠식 위험 종목',
    input: `질문: "이 종목 괜찮아?"
종목: 테스트기업 (999999) | 현재가: 1,250원 (-8.5%)
최근공시: 1.[자본] 반기보고서 - 자본잠식률 65% (2026-06-15) 2.[악재] 감사의견 한정 (2026-04-10)
최근뉴스: 1.테스트기업 관리종목 지정 우려 (1일전)`,
    check: { impact: 'negative', hasSummary: true, hasNotes: true }
  },
  {
    id: 6, name: '공시+뉴스 방향 상충',
    input: `질문: "현대차 공시랑 뉴스 같이 봐줘"
종목: 현대차 (005380) | 현재가: 245,000원 (-0.8%)
최근공시: 1.[호재] 1분기 영업이익 4.2조 역대최고 (2026-04-25)
최근뉴스: 1.현대차 미국 관세 25% 부과 → 수익성 악화 우려 (3시간전) 2.전기차 판매 부진 장기화 (5시간전)`,
    check: { impact: 'neutral', hasSummary: true, hasDetail: true }
  },
  {
    id: 7, name: '섹터 질문 (종목 없음)',
    input: `질문: "오늘 반도체 관련주 흐름 어때?"
최근뉴스: 1.미국 AI 투자 확대로 HBM 수요 급증 (1시간전) 2.삼성전자/SK하이닉스 외국인 동반 순매수 (2시간전) 3.SOX 지수 +2.3% (6시간전)`,
    check: { impact: 'positive', hasSummary: true }
  },
  {
    id: 8, name: '시황 질문 (종목 없음)',
    input: `질문: "지금 시장 분위기 어때?"
최근뉴스: 1.코스피 2,850선 돌파 (30분전) 2.외국인 코스피 3,500억 순매수 (1시간전) 3.원달러 환율 1,380원 하락 (2시간전)`,
    check: { impact: 'positive', hasSummary: true }
  },
  {
    id: 9, name: '뉴스+공시 크로스체크 명시 요청',
    input: `질문: "삼성바이오로직스 최근 뉴스랑 공시 종합해줘"
종목: 삼성바이오로직스 (207940) | 현재가: 1,050,000원 (+2.1%)
최근공시: 1.[호재] CMO 계약 3,500억 체결 (2026-06-18) 2.[일반] 분기보고서 (2026-05-15)
최근뉴스: 1.삼성바이오 빅파마 위탁생산 추가 수주 기대감 (1시간전) 2.바이오 섹터 글로벌 자금 유입 (3시간전)`,
    check: { impact: 'positive', hasSummary: true, hasDetail: true, hasRecentMoves: true }
  },
  {
    id: 10, name: '복잡한 복합 질문',
    input: `질문: "SK하이닉스 이번 분기 실적 공시 어떻게 나왔어? 주가에 영향 있어?"
종목: SK하이닉스 (000660) | 현재가: 219,500원 (+5.61%)
최근공시: 1.[호재] 1분기 매출 17.6조(+42%), 영업이익 7조(+158%) (2026-04-25) 2.[일반] 임원 변동 (2026-03-10)
최근뉴스: 1.SK하이닉스 1Q 어닝서프라이즈 → 목표주가 상향 러시 (2시간전) 2.HBM 2분기도 완판 전망 (4시간전)`,
    check: { impact: 'positive', hasSummary: true, hasDetail: true, hasNotes: true }
  },
];

// =====================================================================
// 프롬프트 버전
// =====================================================================
const STOCK_V3 = `당신은 한국 주식시장 전문 애널리스트입니다. 투자자가 묻는 종목 관련 질문에 답해주세요.

제공되는 데이터:
- 종목 기본정보: 종목명, 코드, 시장, 섹터
- 현재가: 현재 주가와 전일 대비 변동
- 최근 공시: 최근 8개 공시 목록
- 최근 뉴스: 네이버 뉴스 5개

[핵심 예시]
입력: "삼성전자 유상증자 300억, 뉴스에서 목표주가 하향 보도"
{
  "summary": "유상증자 + 목표주가 하향 → 단기 하락 압력",
  "detail": "300억 유상증자로 주식 희석 우려에 목표주가 하향 보도까지 겹쳐 단기 주가 하락 압력이 있어요.",
  "recentMoves": "유상증자 결정(악재) + 목표주가 하향(악재) 겹침",
  "impact": "negative",
  "notes": ["전환가액 확인 필요", "자금 사용 목적 체크"]
}

[작성 원칙]
1. 공시와 뉴스를 연결해서 설명
2. 뉴스+공시 같은 방향 → 모멘텀 강조
3. 뉴스+공시 상충 → 불확실성 언급
4. 숫자 한국식만 (300억, 1,200억) — 30M 금지
5. 매수/매도 직접 권유 금지

반드시 JSON만 출력:
{
  "summary": "한 줄 요약 (40~90자)",
  "detail": "인과관계 중심 설명 (150~400자)",
  "recentMoves": "최근 흐름 요약 (80~200자)",
  "impact": "positive|neutral|negative|unknown",
  "notes": ["참고사항 1~3개"]
}`;

const STOCK_V4 = `당신은 한국 주식시장 전문 애널리스트입니다. 투자자 질문에 공시+뉴스 데이터를 연결해서 답해주세요.

[질문 유형별 답변 포커스]
- 종목명만: 최근 공시+뉴스 흐름 종합 요약
- "지금 사도 될까?": 모멘텀(호재)과 리스크(악재) 균형 제시, 직접 권유 금지
- "왜 올랐어/빠져?": 공시+뉴스에서 원인 찾아 인과관계로 설명
- "공시+뉴스 종합해줘": 방향 일치 시 모멘텀, 상충 시 불확실성 명시
- 섹터/시황 질문: 뉴스 기반으로 트렌드 설명

[impact 판단 기준]
- positive: 호재 공시 + 긍정 뉴스 같은 방향
- negative: 악재 공시 OR 부정 뉴스 OR 자본잠식/감사한정
- neutral: 공시+뉴스 상충, 또는 중립적 정보
- unknown: 판단 불가

[핵심 예시 2개]

예시1 - 투자판단 질문:
입력: "삼성전자 지금 사도 될까요? HBM 수주, 외국인 순매수"
{
  "summary": "HBM 수주+외국인 순매수 → 단기 모멘텀 긍정적",
  "detail": "HBM4 엔비디아 납품 가시화와 외국인 3거래일 연속 순매수가 겹치며 단기 모멘텀은 긍정적이에요. 다만 반도체 업황 불확실성과 환율 리스크는 중장기 변수로 남아있어요. 공시상 별다른 악재는 없어요.",
  "recentMoves": "HBM4 수주공시(호재) + 외국인 순매수(긍정) 흐름 지속",
  "impact": "positive",
  "notes": ["직접 투자 판단은 본인 책임", "환율/글로벌 매크로 변수 확인 필요"]
}

예시2 - 공시+뉴스 상충:
입력: "현대차 1분기 역대최고 실적인데 뉴스에서 관세 악재"
{
  "summary": "역대 최고 실적 vs 미국 관세 악재 → 방향성 불확실",
  "detail": "1분기 영업이익 4.2조로 역대 최고를 기록했지만, 미국 25% 관세 부과 뉴스가 향후 수익성 악화 우려를 키우고 있어요. 공시(호재)와 뉴스(악재)가 상충해 단기 주가 방향성이 불확실해요.",
  "recentMoves": "1분기 실적 호조(공시 호재) + 관세 악재(뉴스) 상충",
  "impact": "neutral",
  "notes": ["관세 영향 실적 반영 시점 확인 필요", "2분기 실적 가이던스 주목"]
}

[규칙]
1. 숫자 한국식: 300억, 1,200억 (30M/1.2B 절대 금지)
2. 데이터 없으면 "확인하기 어렵습니다" 명시
3. 매수/매도 직접 권유 금지
4. 단정적 미래 예측 금지 ("반드시/확실히")
5. 자본잠식/감사한정 발견 시 반드시 notes에 위험 경고

반드시 JSON만 출력 (마크다운 없이):
{
  "summary": "한 줄 요약 (40~90자)",
  "detail": "인과관계 중심 설명 (150~400자)",
  "recentMoves": "최근 공시+뉴스 흐름 (80~200자)",
  "impact": "positive|neutral|negative|unknown",
  "notes": ["투자자 참고사항 1~3개"]
}`;

// =====================================================================
// 테스트 실행
// =====================================================================
async function testPrompt(vName, systemPrompt, scenario) {
  try {
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: 'user', content: scenario.input }]
    });

    const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const tokens = (res.usage?.input_tokens||0) + (res.usage?.output_tokens||0);

    let parsed;
    try { parsed = JSON.parse(text.replace(/```json|```/g,'').trim()); }
    catch { return { success: false, error: 'JSON파싱실패', tokens }; }

    const c = scenario.check;
    let score = 0;
    score += parsed.impact === c.impact ? 35 : 0;
    score += (!c.hasSummary || parsed.summary?.length >= 15) ? 15 : 0;
    score += (!c.hasDetail || parsed.detail?.length >= 80) ? 15 : 0;
    score += (!c.hasRecentMoves || parsed.recentMoves?.length >= 20) ? 15 : 0;
    score += (!c.hasNotes || (Array.isArray(parsed.notes) && parsed.notes.length > 0)) ? 15 : 0;
    score += !/\d+[MB]|\$\d+/.test(JSON.stringify(parsed)) ? 5 : 0;

    return { success: true, parsed, score, tokens, correct: parsed.impact === c.impact };
  } catch(e) {
    return { success: false, error: e.message, tokens: 0 };
  }
}

async function runTests() {
  const versions = [
    { name: 'V3 (현재)', prompt: STOCK_V3 },
    { name: 'V4 (개선)', prompt: STOCK_V4 },
  ];

  const results = {};
  for (const v of versions) results[v.name] = { totalScore: 0, totalTokens: 0, correct: 0 };

  console.log('=== AI종목분석 stock_system 테스트 ===\n');

  for (const s of scenarios) {
    console.log(`\n[${s.id}] ${s.name} (예상: ${s.check.impact})`);
    for (const v of versions) {
      const r = await testPrompt(v.name, v.prompt, s);
      if (r.success) {
        results[v.name].totalScore += r.score;
        results[v.name].totalTokens += r.tokens;
        if (r.correct) results[v.name].correct++;
        const ok = r.correct ? '✅' : '❌';
        console.log(`  ${v.name}: ${r.score}점 | impact=${r.parsed.impact}${ok} | 토큰=${r.tokens}`);
        console.log(`    summary: ${r.parsed.summary?.slice(0,60)}`);
      } else {
        console.log(`  ${v.name}: 실패 - ${r.error}`);
      }
      await new Promise(r => setTimeout(r, 400));
    }
  }

  console.log('\n\n=== 최종 결과 ===');
  for (const [n, d] of Object.entries(results)) {
    console.log(`${n}: ${d.totalScore}점 | 정확도 ${d.correct}/10 | 토큰합계 ${d.totalTokens}`);
  }
  const best = Object.entries(results).sort((a,b) => b[1].totalScore - a[1].totalScore)[0];
  console.log(`\n🏆 최적: ${best[0]} (${best[1].totalScore}점)`);
}

runTests().catch(console.error).finally(() => process.exit(0));
