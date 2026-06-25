// jp: DB의 현재 프롬프트 6개를 추출해서 JSON 파일로 저장
const {Pool} = require('pg');
const fs = require('fs');
require('dotenv').config();
const p = new Pool({connectionString: process.env.DATABASE_URL});

(async () => {
  const r = await p.query(`SELECT prompt_key, name, description, content FROM ai_prompts ORDER BY prompt_key`);
  console.log(`추출된 프롬프트: ${r.rows.length}개`);
  r.rows.forEach(row => console.log(`  ${row.prompt_key}: ${row.content.length}자`));

  // jp: JSON 파일로 저장 (백엔드 폴더에)
  const out = {};
  r.rows.forEach(row => {
    out[row.prompt_key] = {
      name: row.name || row.prompt_key,
      description: row.description || '',
      content: row.content,
    };
  });
  fs.writeFileSync('prompts_export.json', JSON.stringify(out, null, 2), 'utf8');
  console.log('\n✅ prompts_export.json 저장 완료');
  await p.end();
})().catch(e => { console.error(e.message); p.end(); });
