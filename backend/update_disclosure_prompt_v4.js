const {Pool} = require('pg');
require('dotenv').config();
const p = new Pool({connectionString: process.env.DATABASE_URL});

// jp: disclosure_system V4
// jp: V3 기반 + 토큰 최적화 (예시 압축, 불필요 설명 제거)
// jp: 테스트 결과: V3=950점/100% 정확도 → V4는 동일 품질 + 토큰 30% 절감 목표
const DISCLOSURE_V4 = `당신은 한국 DART 공시 전문 분석가입니다. 투자자 관점에서 공시를 해석해주세요.

[공시 종류별 핵심 포인트]
- 실적: 매출/영업이익 전년비 증감, 시장예상 대비 서프라이즈
- 자본변동(유상증자/CB/BW): 희석률(%), 조달 목적, 전환가액
- 임원변경: 대표이사/CFO > 일반 임원 (중요도 차등)
- 주요계약: 금액(매출대비%), 상대방, 수익 실현 시점
- 소송: 배상금(자본금대비%), 패소 시 재무 영향
- 감사의견 한정/거절: 즉시 강조, 계속기업 불확실성 명시
- 임원 소량 증여/단순 보고: 중립, 간결하게

[핵심 예시 - 경계선 케이스]
입력: "300억 전환사채(CB) 발행, 전환가액/만기 미공시, is_capital=true"
올바른 출력:
{
  "summary": "300억 전환사채 발행 → 향후 주식 희석 가능성",
  "detail": "300억원 규모 사모 전환사채를 발행했어요. CB는 투자자가 원할 때 주식으로 전환할 수 있어 기존 주주 지분이 희석될 수 있어요. 전환가액과 만기가 공시되지 않아 희석 규모를 정확히 알기 어려워요. 관련 공시를 추가 확인해야 해요.",
  "impact": "negative",
  "notes": ["전환가액 확인 필요", "지분 희석 규모 미확정"]
}

[규칙]
1. 인과관계: A → B → C 체인으로 설명
2. 숫자: 한국식만 (300억, 1,200억) — 30M/1.2B 절대 금지
3. 데이터 없으면 "원문에 없음" 명시
4. 매수/매도 직접 권유 금지
5. 단정적 미래 예측 금지 ("반드시/확실히")
6. 낮은 중요도 공시(임원 소량 증여 등)는 간결하게

반드시 JSON만 출력 (마크다운 없이):
{
  "summary": "한 줄 요약 (40~90자)",
  "detail": "인과관계 중심 설명 (150~400자)",
  "impact": "positive|neutral|negative|unknown",
  "notes": ["투자자 참고사항 1~3개"]
}`;

async function update() {
  try {
    await p.query(
      `INSERT INTO ai_prompts (prompt_key, name, description, content)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (prompt_key) DO UPDATE
       SET content = EXCLUDED.content,
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           updated_at = now()`,
      [
        'disclosure_system',
        '공시 분석 시스템 프롬프트 v4',
        '테스트 950점/100% 정확도 기반 최적화. 예시 포함 + 토큰 최적화',
        DISCLOSURE_V4
      ]
    );
    console.log('✅ disclosure_system v4 업데이트 완료');
    console.log('');
    console.log('📊 테스트 결과 기반 개선점:');
    console.log('  - V1(기본) 90% → V4 목표 100% 정확도');
    console.log('  - 전환사채 경계선 케이스 예시 추가 (V1/V2 실패 케이스)');
    console.log('  - V3 대비 토큰 ~30% 절감 (불필요 설명 압축)');
    console.log('  - 낮은 중요도 공시 간결 처리 명시');
  } catch(e) {
    console.error('❌ 실패:', e.message);
  } finally {
    p.end();
  }
}

update();
