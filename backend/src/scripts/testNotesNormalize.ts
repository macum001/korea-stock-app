// ============================================================
// jp: 주석 검색 표준 계약 — normalize/타입가드 테스트
// jp: 위치: backend/src/scripts/testNotesNormalize.ts
// jp: 실행: npx ts-node src/scripts/testNotesNormalize.ts
// jp: 6가지 케이스가 안전하게 처리되는지(앱이 안 죽는지) 검증.
// ============================================================
import { normalizeV2Chunk, isValidNotesResult, type RawV2Chunk } from '../types/notesSearch';

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}`); }
}

// jp: 기본 raw chunk 팩토리
function raw(over: Partial<RawV2Chunk>): RawV2Chunk {
  return {
    kind: 'prose', stockCode: '355390', stockName: '테스트',
    receiptNo: '20260323001402', reportName: '사업보고서 (2025.12)',
    reportPeriod: '2025FY', chunkIndex: 0, text: '본문 텍스트입니다.',
    sectionTitle: '금융상품', vectorScore: 0.5, keywordScore: 0.5,
    titleScore: 0.5, tableScore: 0, finalScore: 0.5, ...over,
  };
}

console.log('═══ 주석 검색 표준 계약 테스트 ═══\n');

// ── 케이스 1: V2 prose 정상 ──
console.log('[1] V2 prose 정상');
{
  const r = normalizeV2Chunk(raw({ kind: 'prose' }), 'https://dart.fss.or.kr/x');
  check('normalize 성공', r !== null);
  check('타입가드 통과', isValidNotesResult(r));
  check('chunkText 존재', !!r && r.chunkText.length > 0);
  check('id 생성됨', !!r && r.id === '20260323001402|prose|0');
  check('sourceYear 추출', !!r && r.sourceYear === 2025);
  check('confidence 계산', !!r && r.scores?.confidence === 0.5);
}

// ── 케이스 2: V2 table 정상 (마크다운 있음) ──
console.log('\n[2] V2 table 정상');
{
  const md = '| 구분 | 당기 | 전기 |\n| --- | --- | --- |\n| 금액 | 100 | 90 |';
  const r = normalizeV2Chunk(raw({ kind: 'table', text: md }), null);
  check('normalize 성공', r !== null);
  check('타입가드 통과', isValidNotesResult(r));
  check('tableMarkdown 채워짐', !!r && r.tableMarkdown === md);
  check('chunkText도 채워짐(fallback)', !!r && r.chunkText === md);
  check('kind=table', !!r && r.kind === 'table');
}

// ── 케이스 3: table인데 tableMarkdown(text) 없음 + DART 없음 → 제외 ──
console.log('\n[3] table 본문 없음 + DART 없음 → null(제외)');
{
  const r = normalizeV2Chunk(raw({ kind: 'table', text: '' }), null);
  check('null 반환(제외됨)', r === null);
}

// ── 케이스 4: table 본문 없음 + DART 있음 → slim 카드로 살림 ──
console.log('\n[4] table 본문 없음 + DART 있음 → 살림(slim)');
{
  const r = normalizeV2Chunk(raw({ kind: 'table', text: '' }), 'https://dart.fss.or.kr/y');
  check('normalize 성공(살림)', r !== null);
  check('dartUrl 존재', !!r && !!r.dartUrl);
  // jp: chunkText/tableMarkdown 비었지만 dartUrl 있음 → 타입가드는 통과 못함(본문없음)
  //     → 라우트 filter(isValidNotesResult)에서 빠짐. 단 normalize는 객체 반환.
  check('타입가드는 실패(본문없어 최종 제외)', !isValidNotesResult(r));
}

// ── 케이스 5: prose 본문 없음 → 제외 ──
console.log('\n[5] prose 본문 없음 → null(제외)');
{
  const r = normalizeV2Chunk(raw({ kind: 'prose', text: '   ' }), 'https://x');
  check('null 반환(제외됨)', r === null);
}

// ── 케이스 6: 잘못된 item들 타입가드로 걸러짐 ──
console.log('\n[6] 잘못된 item 타입가드 필터');
{
  const badItems: unknown[] = [
    null,
    undefined,
    {},
    { id: '', kind: 'prose', title: 'x', score: 1, chunkText: 'a' },      // id 빈값
    { id: '1', kind: 'invalid', title: 'x', score: 1, chunkText: 'a' },    // kind 잘못
    { id: '1', kind: 'prose', title: 'x', score: NaN, chunkText: 'a' },    // score NaN
    { id: '1', kind: 'prose', title: 'x', score: 1 },                      // 본문 없음
    { id: '1', kind: 'prose', title: 'x', score: 1, chunkText: '' },       // 본문 빈값
    { id: '1', kind: 'table', title: 'x', score: 1, tableMarkdown: '| a |' }, // 정상(table)
    { id: '2', kind: 'prose', title: 'y', score: 0.5, chunkText: '정상' },    // 정상(prose)
  ];
  const valid = badItems.filter(isValidNotesResult);
  check('10개 중 정상 2개만 통과', valid.length === 2);
  check('통과한 것 모두 유효', valid.every((v) => isValidNotesResult(v)));

  // jp: V1 형태(옛 필드 tableMd/chunkIndex)도 표준이 아니면 걸러지는지
  const v1Style = { receiptNo: '123', tableMd: '| a |', chunkIndex: 0 }; // id/kind/title/score 없음
  check('V1 옛 구조는 타입가드 실패', !isValidNotesResult(v1Style));
}

console.log(`\n═══ 결과: ${pass} 통과 / ${fail} 실패 ═══`);
process.exit(fail > 0 ? 1 : 0);
