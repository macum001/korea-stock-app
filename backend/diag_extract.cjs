// diag_extract.cjs — 원문 추출 진단
// 실행 방법: backend 폴더에 이 파일을 놓고
//   cd C:\Users\macum\Desktop\korea-stock-app\backend
//   npx ts-node diag_extract.cjs
require('ts-node/register');
const { extractDisclosureCore } = require('./src/services/ai/dartDocument.service.ts');

const CASES = [
  { rcp: '20260626000347', name: '주요사항보고서(유상증자결정)', who: '오에스피', find: ['1,632', '발행가액', '7,283,547', '할인'] },
  { rcp: '20260625900295', name: '현금ㆍ현물배당결정',           who: '메타바이오메드', find: ['55', '시가배당률', '1.5'] },
];

(async () => {
  for (const c of CASES) {
    console.log('\n========================================');
    console.log('[' + c.who + '] ' + c.name + '  (' + c.rcp + ')');
    console.log('========================================');
    let r;
    try {
      r = await extractDisclosureCore(c.rcp, c.name);
    } catch (e) {
      console.log('추출 중 예외:', e.message);
      continue;
    }
    console.log('ok        :', r.ok);
    console.log('mode      :', r.mode, ' (section=라벨추출 / fallback=앞부분 / none=원문실패)');
    console.log('rawLength :', r.rawLength, '(원문 전체 길이)');
    console.log('textLength:', r.text ? r.text.length : 0, '(AI에 전달되는 길이)');
    console.log('\n--- 추출 텍스트 앞 1200자 ---');
    console.log(r.text ? r.text.slice(0, 1200) : '(없음)');
    console.log('\n--- 핵심값 포함 여부 ---');
    for (const v of c.find) {
      const has = r.text && r.text.includes(v);
      console.log('  "' + v + '" : ' + (has ? 'O 있음' : 'X 없음'));
    }
  }
  console.log('\n진단 끝. mode와 핵심값 포함여부로 원인 확정.');
  process.exit(0);
})();
