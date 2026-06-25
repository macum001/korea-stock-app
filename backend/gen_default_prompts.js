// jp: DB 프롬프트로 DEFAULT_PROMPTS 코드 블록을 자동 생성
// jp: 생성된 코드를 promptStore.service.ts의 DEFAULT_PROMPTS에 붙여넣으면 됨
const {Pool} = require('pg');
const fs = require('fs');
require('dotenv').config();
const p = new Pool({connectionString: process.env.DATABASE_URL});

(async () => {
  const r = await p.query(`SELECT prompt_key, name, description, content FROM ai_prompts ORDER BY prompt_key`);

  // jp: 백틱/달러 이스케이프 (템플릿 리터럴 안전)
  function esc(s) {
    return (s || '').replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
  }

  let code = 'export const DEFAULT_PROMPTS: Record<string, { name: string; description: string; content: string }> = {\n';
  r.rows.forEach(row => {
    code += `  ${row.prompt_key}: {\n`;
    code += `    name: ${JSON.stringify(row.name || row.prompt_key)},\n`;
    code += `    description: ${JSON.stringify(row.description || '')},\n`;
    code += `    content: \`${esc(row.content)}\`,\n`;
    code += `  },\n`;
  });
  code += '};\n';

  fs.writeFileSync('DEFAULT_PROMPTS_generated.ts', code, 'utf8');
  console.log('✅ DEFAULT_PROMPTS_generated.ts 생성 완료');
  console.log(`   총 ${r.rows.length}개 프롬프트, ${code.length}자`);
  await p.end();
})().catch(e => { console.error(e.message); p.end(); });
