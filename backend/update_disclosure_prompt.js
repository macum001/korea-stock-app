// jp: disclosure_output_format에 companyInfo 필드 추가
const {Pool} = require('pg');
require('dotenv').config();
const p = new Pool({connectionString: process.env.DATABASE_URL});

(async () => {
  // 현재 프롬프트 가져오기
  const cur = await p.query(`SELECT content FROM ai_prompts WHERE prompt_key='disclosure_output_format'`);
  let content = cur.rows[0].content;

  // 1. [공시 유형별 필수 체크] 위에 기업개요 규칙 추가
  content = content.replace(
    '[공시 유형별 필수 체크]',
    `[필수 규칙 - 기업 개요]
- companyInfo 필드에 이 공시를 낸 기업이 뭐 하는 회사인지 1문장으로 설명하세요.
- 주력 사업/업종을 포함하고, 절대 비워두지 마세요.
- 잘 모르는 기업이면 종목명/업종 기준으로 추정해서라도 채우세요.

[공시 유형별 필수 체크]`
  );

  // 2. JSON 출력 스펙에 companyInfo 추가 (summary 위에)
  content = content.replace(
    '{\n  "summary": "한 줄 요약 (40~90자)",',
    '{\n  "companyInfo": "이 기업이 뭐 하는 회사인지 1문장 (필수, 절대 비우지 말것)",\n  "summary": "한 줄 요약 (40~90자)",'
  );

  await p.query(
    `UPDATE ai_prompts SET content=$1, updated_at=now() WHERE prompt_key='disclosure_output_format'`,
    [content]
  );
  console.log('✅ disclosure_output_format에 companyInfo 추가 완료');

  // 확인
  const check = await p.query(`SELECT content FROM ai_prompts WHERE prompt_key='disclosure_output_format'`);
  const hasCompanyInfo = check.rows[0].content.includes('companyInfo');
  console.log('companyInfo 포함 확인:', hasCompanyInfo ? '✅' : '❌');

  await p.end();
})().catch(e => { console.error(e.message); p.end(); });
