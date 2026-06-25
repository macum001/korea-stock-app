// jp: 빌드 후 schema.sql을 dist로 복사
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../src/db/schema.sql');
const destDir = path.join(__dirname, '../dist/db');
const dest = path.join(destDir, 'schema.sql');

try {
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(src, dest);
  console.log('[build] schema.sql → dist/db 복사 완료');
} catch (err) {
  console.error('[build] schema.sql 복사 실패:', err.message);
  process.exit(1);
}
