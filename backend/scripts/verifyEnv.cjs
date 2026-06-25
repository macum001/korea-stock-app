#!/usr/bin/env node
// jp: backend 환경변수 이름만 점검합니다. 실제 값은 출력하지 않습니다.
require('dotenv').config();
const required = ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET', 'KIS_APP_KEY', 'KIS_APP_SECRET', 'KIS_ACCOUNT_NO'];
const optional = ['ADMIN_API_KEY', 'DART_API_KEY', 'ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'];
const missing = required.filter((key) => !process.env[key]);
console.log('[verify-env] required');
for (const key of required) console.log(`- ${key}: ${process.env[key] ? 'SET' : 'MISSING'}`);
console.log('[verify-env] optional');
for (const key of optional) console.log(`- ${key}: ${process.env[key] ? 'SET' : 'EMPTY'}`);
if (missing.length) {
  console.error(`\n필수 환경변수 누락: ${missing.join(', ')}`);
  process.exit(1);
}
console.log('\n환경변수 이름 점검 OK');
