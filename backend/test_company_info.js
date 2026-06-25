const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();
const client = new Anthropic.default();

// jp: 기업설명 추가한 새 프롬프트 (v5)
const STOCK_SYSTEM_V5 = `당신은 한국 주식시장 전문 애널리스트입니다. 투자자 질문에 공시+뉴스 데이터를 연결해서 답해주세요.

[필수 규칙 - 기업 개요]
- companyInfo 필드에 해당 기업이 뭐 하는 회사인지 반드시 1~2문장으로 설명하세요.
- 주력 사업, 업종, 대표 제품/서비스를 포함하세요.
- 데이터가 부족해도 종목명과 알려진 정보로 기업 개요는 반드시 제공하세요.
- 모르는 기업이면 "종목명 기준 추정"이라고 명시하되 빈칸으로 두지 마세요.

[질문 유형별 답변 포커스]
- 종목명만/뭐하는 기업: companyInfo 중심 + 최근 공시 흐름
- "지금 사도 될까?": 모멘텀과 리스크 균형, 직접 권유 금지
- "왜 올랐어/빠져?": 공시+뉴스에서 원인 찾아 인과관계로 설명

[impact 판단 기준]
- positive: 호재 공시 + 긍정 뉴스 같은 방향
- negative: 악재 공시 OR 부정 뉴스 OR 자본잠식/감사한정
- neutral: 공시+뉴스 상충, 또는 중립적 정보
- unknown: 판단 불가

[규칙]
1. 숫자 한국식: 300억, 1,200억
2. 매수/매도 직접 권유 금지
3. 단정적 미래 예측 금지

반드시 JSON만 출력:
{
  "companyInfo": "기업이 뭐 하는 회사인지 1~2문장 (필수, 절대 비우지 말것)",
  "summary": "한 줄 요약 (40~90자)",
  "detail": "인과관계 중심 설명 (150~400자)",
  "recentMoves": "최근 공시+뉴스 흐름 (80~200자)",
  "impact": "positive|neutral|negative|unknown",
  "notes": ["투자자 참고사항 1~3개"]
}`;

const scenarios = [
  { q: '이터닉이 뭔 기업이야', name: 'SK이터닉스', code: '475150', market: 'KOSPI', discs: '최근공시 없음', news: '뉴스 없음' },
  { q: '삼성전자 어때', name: '삼성전자', code: '005930', market: 'KOSPI', discs: '1.HBM4 공급계약', news: '1.엔비디아 납품 기대' },
  { q: '이 회사 뭐하는데', name: '에코프로비엠', code: '247540', market: 'KOSDAQ', discs: '최근공시 없음', news: '뉴스 없음' },
];

async function test(s) {
  const userMsg = `종목: ${s.name} (${s.code}) | 시장: ${s.market}
최근공시: ${s.discs}
최근뉴스: ${s.news}
질문: ${s.q}`;

  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    system: STOCK_SYSTEM_V5,
    messages: [{ role: 'user', content: userMsg }],
  });
  const text = res.content.filter(b=>b.type==='text').map(b=>b.text).join('');
  try {
    const parsed = JSON.parse(text.replace(/```json|```/g,'').trim());
    return parsed;
  } catch {
    return { error: '파싱실패', raw: text.slice(0,100) };
  }
}

(async () => {
  for (const s of scenarios) {
    console.log(`\n=== "${s.q}" (${s.name}) ===`);
    const r = await test(s);
    if (r.error) {
      console.log('❌', r.error, r.raw);
    } else {
      console.log('🏢 기업정보:', r.companyInfo || '❌ 없음');
      console.log('📊 요약:', r.summary);
      console.log('🎯 impact:', r.impact);
    }
    await new Promise(r => setTimeout(r, 500));
  }
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
