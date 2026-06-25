const fs = require("fs");
const path = require("path");
const ROOT = "C:\\Users\\macum\\Desktop\\korea-stock-app";

// 1) 명백한 백업/임시 파일 (안전하게 삭제 후보)
const junkPatterns = [/\.backup\d*\.(ts|tsx)$/, /\.backup\.(ts|tsx)$/, /selftest\.js$/, /feedtest\d*\.js$/, /check_samsung\.js$/, /^fix_.*\.js$/, /^feed_.*\.js$/, /^chip_.*\.js$/];

function walk(dir, list=[]) {
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name === "dist") continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, list);
    else list.push(full);
  }
  return list;
}

const all = walk(ROOT);
console.log("=== 백업/임시 파일 (삭제 후보) ===");
const junk = all.filter(f => junkPatterns.some(p => p.test(path.basename(f))));
junk.forEach(f => console.log("  ", f.replace(ROOT, ".")));
console.log("총", junk.length, "개\n");

// 2) src 안의 .tsx/.ts 중 어디서도 import 안 되는 파일 (고아 파일 후보)
const srcFiles = all.filter(f => f.includes(path.sep+"src"+path.sep) && /\.(ts|tsx)$/.test(f) && !/\.backup/.test(f) && !/\.d\.ts$/.test(f));
const allText = srcFiles.map(f => ({ f, txt: fs.readFileSync(f, "utf8") }));

console.log("=== import 안 되는 고아 파일 후보 (frontend src) ===");
const orphans = [];
for (const { f } of allText) {
  const base = path.basename(f).replace(/\.(ts|tsx)$/, "");
  if (["main","App","index"].includes(base)) continue;
  // 다른 파일에서 이 파일명을 import하는지
  const imported = allText.some(o => o.f !== f && (o.txt.includes("/"+base+"'") || o.txt.includes("/"+base+'"') || o.txt.includes("'"+base+"'")));
  if (!imported) orphans.push(f);
}
orphans.filter(f=>f.includes(path.sep+"src"+path.sep)).forEach(f => console.log("  ", f.replace(ROOT, ".")));
console.log("총", orphans.length, "개 (※ 동적 import나 라우트 등록은 별도 확인 필요)");
