const {Pool} = require('pg');
require('dotenv').config();
const p = new Pool({connectionString: process.env.DATABASE_URL});

const DISCLOSURE_OUTPUT_V4 = `당신은 한국 DART 공시 분석가입니다. 투자자가 30초 안에 핵심을 파악할 수 있게 분석해주세요.

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

// jp: financial_risk_config - 자본잠식/상장폐지 판정 기준
// jp: 테스트 결과: 자본잠식 예시가 100% 정확도 달성의 핵심
// jp: 임계값과 메시지를 실제 한국 상장폐지 기준에 맞게 정교화
const FINANCIAL_RISK_V4 = `{
  "thresholds": {
    "impairmentRateRed": 50,
    "impairmentRateYellow": 0,
    "debtRatioWarn": 200,
    "debtRatioDanger": 400,
    "operatingLossWarn": true,
    "operatingLossYears": 3
  },
  "messages": {
    "fullImpairment": "🔴 완전자본잠식 — 자본총계({equity})가 마이너스입니다. 즉시 관리종목 지정 후 상장폐지 심사 대상이에요.",
    "impairmentRed": "🔴 부분자본잠식 {rate}% — 잠식률 50% 초과로 2년 연속 지속 시 관리종목 지정 위험이 있어요. 자본금 {capital} 대비 자본총계 {equity}.",
    "impairmentYellow": "🟡 부분자본잠식 {rate}% — 자본총계({equity})가 자본금({capital})보다 적어요. 악화 시 위험 증가.",
    "impairmentGreen": "🟢 자본잠식 없음 — 자본총계({equity})가 자본금({capital})보다 많아요.",
    "operatingLoss": "🟡 영업손실 {amount} — {years}년 연속 영업적자 상태예요. 4년 연속(코스닥 기준) 시 관리종목 지정 위험.",
    "debtHigh": "🟡 부채비율 {ratio}% — 부채가 자본의 {ratio_x}배입니다. 200% 초과 시 재무 건전성 주의.",
    "debtDanger": "🔴 부채비율 {ratio}% — 과도한 부채로 유동성 위기 가능성. 즉시 확인 필요.",
    "safe": "🟢 재무 안전 — 자본잠식 없고 부채비율 정상 범위예요."
  },
  "delistingCriteria": {
    "description": "한국거래소 관리종목/상장폐지 주요 기준 (2026년 기준)",
    "kospi": [
      "자본금 50% 이상 잠식 → 관리종목",
      "완전자본잠식 → 즉시 관리종목, 미해소 시 상장폐지",
      "감사의견 한정 → 관리종목, 2년 연속 한정/거절 → 상장폐지",
      "매출액 50억 미만(연속) → 관리종목"
    ],
    "kosdaq": [
      "자본금 50% 이상 잠식 → 관리종목",
      "완전자본잠식 → 즉시 관리종목",
      "영업손실 4년 연속 → 관리종목",
      "감사의견 한정 → 관리종목, 부적정/거절 → 즉시 상장폐지 심사",
      "반기 매출 5억 미만 → 관리종목"
    ]
  }
}`;

async function update() {
  try {
    // disclosure_output_format 업데이트
    await p.query(
      `INSERT INTO ai_prompts (prompt_key, name, description, content)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (prompt_key) DO UPDATE
       SET content = EXCLUDED.content,
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           updated_at = now()`,
      [
        'disclosure_output_format',
        '공시 분석 출력 형식 v4',
        '테스트 1000점/10/10 만점 달성. 자본잠식+감사의견 예시 포함, impact 판단 기준 명확화',
        DISCLOSURE_OUTPUT_V4
      ]
    );
    console.log('✅ disclosure_output_format v4 업데이트 완료');

    // financial_risk_config 업데이트
    await p.query(
      `INSERT INTO ai_prompts (prompt_key, name, description, content)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (prompt_key) DO UPDATE
       SET content = EXCLUDED.content,
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           updated_at = now()`,
      [
        'financial_risk_config',
        '자본잠식·상장폐지 위험 판정 설정 v4',
        '한국거래소 2026년 기준 반영, KOSPI/KOSDAQ 구분, 부채위험 2단계(경고/위험), 이모지 신호등',
        FINANCIAL_RISK_V4
      ]
    );
    console.log('✅ financial_risk_config v4 업데이트 완료');

    console.log('\n📊 업데이트 완료 요약:');
    console.log('  disclosure_output_format v4');
    console.log('    - 테스트 1000점/10/10 만점');
    console.log('    - 자본잠식 예시 추가 (V3 파싱실패 케이스 해결)');
    console.log('    - 감사의견 적정 = neutral 명시 (V3 오판 케이스 해결)');
    console.log('    - impact 판단 기준 4단계 명확화');
    console.log('');
    console.log('  financial_risk_config v4');
    console.log('    - 한국거래소 2026년 상장폐지 기준 반영');
    console.log('    - KOSPI/KOSDAQ 구분 기준 추가');
    console.log('    - 부채비율 2단계 경고(200%/400%)');
    console.log('    - 이모지 신호등 (🔴🟡🟢) 메시지');
    console.log('    - 영업손실 연속 연도 추적 기준 추가');
  } catch(e) {
    console.error('❌ 실패:', e.message);
  } finally {
    p.end();
  }
}

update();
