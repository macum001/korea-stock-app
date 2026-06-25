#!/usr/bin/env node
// jp: 배포 전 실수 방지용 정적 점검. 실제 API 키 값은 읽거나 출력하지 않습니다.
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const fail = [];
const warn = [];
const ok = [];

function exists(p) { return fs.existsSync(path.join(root, p)); }
function read(p) { return fs.readFileSync(path.join(root, p), 'utf8'); }
function walk(dir, acc = []) {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) return acc;
  for (const ent of fs.readdirSync(full, { withFileTypes: true })) {
    const rel = path.join(dir, ent.name);
    if (['node_modules', 'dist', '.git', '.vite', 'coverage'].includes(ent.name)) continue;
    if (ent.isDirectory()) walk(rel, acc);
    else acc.push(rel);
  }
  return acc;
}

for (const p of ['.env', 'backend/.env', 'firebase-service-account.json', 'backend/firebase-service-account.json']) {
  if (exists(p)) fail.push(`민감 파일이 압축 대상에 남아 있음: ${p}`);
  else ok.push(`민감 파일 제외 확인: ${p}`);
}
for (const p of ['.env.example', 'backend/.env.example', '.gitignore', 'backend/src/db/schema.sql']) {
  if (!exists(p)) fail.push(`필수 파일 없음: ${p}`);
  else ok.push(`필수 파일 확인: ${p}`);
}

const allFiles = walk('.');
for (const rel of allFiles) {
  const parts = rel.split(path.sep);
  if (parts.includes('node_modules') || parts.includes('dist') || /\.tsbuildinfo$|\.DS_Store$/.test(rel)) {
    fail.push(`불필요 산출물 포함: ${rel}`);
  }
}

const schema = exists('backend/src/db/schema.sql') ? read('backend/src/db/schema.sql') : '';
for (const term of ['market_snapshots', 'stock_daily_investor_flows', 'stock_daily_candles']) {
  if (!schema.includes(term)) fail.push(`DB schema에 ${term} 없음`);
  else ok.push(`DB schema 확인: ${term}`);
}

const marketRoutes = exists('backend/src/routes/market.routes.ts') ? read('backend/src/routes/market.routes.ts') : '';
if (marketRoutes.includes("post('/snapshot/:code/finalize'") && !marketRoutes.includes('requireAdmin')) {
  fail.push('snapshot 강제 확정 API가 관리자 보호 없이 열려 있음');
}

const dockerCompose = exists('docker-compose.yml') ? read('docker-compose.yml') : '';
if (dockerCompose.includes('context: ./frontend')) {
  fail.push('docker-compose frontend context가 ./frontend로 되어 있음. 루트 Vite 프로젝트라 빌드 실패 가능');
}
if (!dockerCompose.includes('target: production')) warn.push('frontend Docker build target 확인 필요');

if (fail.length) {
  console.error('\n[verify-release] FAIL');
  for (const x of fail) console.error(`- ${x}`);
  if (warn.length) {
    console.error('\nWarnings:');
    for (const x of warn) console.error(`- ${x}`);
  }
  process.exit(1);
}
console.log('\n[verify-release] OK');
for (const x of ok.slice(0, 12)) console.log(`- ${x}`);
if (warn.length) {
  console.log('\nWarnings:');
  for (const x of warn) console.log(`- ${x}`);
}
