// ============================================================
// jp: 주석 검색 V1 vs V2 품질 비교 테스트
// jp: 위치: backend/src/scripts/testNotesSearch.ts
// jp: 실행: npx ts-node src/scripts/testNotesSearch.ts
// jp:       (특정 종목) npx ts-node src/scripts/testNotesSearch.ts 009150
// jp:
// jp: 동작: 임베딩된 종목 중 청크 많은 종목 자동 선택 → 10개 질문 →
// jp:        V1(searchNotes) vs V2(searchNotesV2) 결과를 점수 분해와 함께 비교 출력
// ============================================================
import { query } from '../config/db';
import { searchNotes } from '../services/ai/notesEmbedding.service';
import { searchNotesV2, classifyQuestion } from '../services/ai/notesSearchV2.service';

// jp: 유형을 골고루 커버하는 10개 질문 (회계정책/금액/리스크/특수관계자/전기대비)
const TEST_QUESTIONS = [
  '퇴직급여 충당부채는 얼마인가요',            // financial_amount + related_party
  '수익은 어떻게 인식하나요',                  // accounting_policy
  '특수관계자와의 거래 내역 알려줘',           // related_party
  '우발부채나 소송 같은 위험이 있나요',        // risk
  '전기 대비 매출이 어떻게 변했나요',          // period_change
  '리스 회계처리는 어떻게 하나요',             // accounting_policy
  '재고자산 평가 방법이 뭔가요',               // accounting_policy
  '금융상품 공정가치는 얼마인가요',            // financial_amount
  '주식기준보상(스톡옵션) 내용이 있나요',      // related_party
  '담보로 제공된 자산이 있나요',               // risk
];

async function pickStock(argStock?: string): Promise<{ stockCode: string; stockName: string } | null> {
  if (argStock) {
    const rows = await query<{ stock_code: string; stock_name: string }>(
      `SELECT stock_code, stock_name FROM disclosure_notes_vec
       WHERE stock_code = $1 LIMIT 1`, [argStock]
    );
    if (rows[0]) return { stockCode: rows[0].stock_code, stockName: rows[0].stock_name };
    console.log(`[테스트] ${argStock} 임베딩 데이터 없음. 자동 선택으로 진행.`);
  }
  // jp: 청크 많은 종목 top1 자동 선택
  const rows = await query<{ stock_code: string; stock_name: string; cnt: string }>(
    `SELECT stock_code, stock_name, COUNT(*) AS cnt
     FROM disclosure_notes_vec
     WHERE stock_code IS NOT NULL
     GROUP BY stock_code, stock_name
     ORDER BY cnt DESC LIMIT 1`
  );
  if (!rows[0]) return null;
  return { stockCode: rows[0].stock_code, stockName: rows[0].stock_name };
}

function fmt(n: number): string {
  return n.toFixed(3).padStart(6);
}

async function run() {
  const argStock = process.argv[2];
  const stock = await pickStock(argStock);
  if (!stock) {
    console.error('임베딩된 종목이 없습니다. 먼저 주석 임베딩을 실행하세요.');
    process.exit(1);
  }

  console.log('═'.repeat(70));
  console.log(`테스트 종목: ${stock.stockName} (${stock.stockCode})`);
  console.log('═'.repeat(70));

  let v1TotalHits = 0, v2TotalHits = 0;
  let v1TotalScore = 0, v2TotalScore = 0;

  for (let qi = 0; qi < TEST_QUESTIONS.length; qi++) {
    const q = TEST_QUESTIONS[qi];
    const qtype = classifyQuestion(q);
    console.log(`\n[Q${qi + 1}] "${q}"  (유형: ${qtype})`);
    console.log('─'.repeat(70));

    // ── V1 ──
    let v1Count = 0, v1Top = 0;
    try {
      const v1 = await searchNotes(q, { stockCode: stock.stockCode, limit: 5 });
      v1Count = v1.length;
      v1Top = v1[0]?.similarity ?? 0;
      console.log(`  V1 (기존): ${v1.length}건  최고점=${fmt(v1Top)}`);
      v1.slice(0, 3).forEach((r, i) => {
        console.log(`     ${i + 1}. sim=${fmt(r.similarity)}  "${(r.chunkText || '').slice(0, 45).replace(/\n/g, ' ')}"`);
      });
    } catch (e) {
      console.log(`  V1 오류: ${e instanceof Error ? e.message : e}`);
    }

    // ── V2 ──
    let v2Count = 0, v2Top = 0;
    try {
      const v2 = await searchNotesV2(q, { stockCode: stock.stockCode, limit: 7 });
      v2Count = v2.chunks.length;
      v2Top = v2.chunks[0]?.finalScore ?? 0;
      console.log(`  V2 (개선): ${v2.chunks.length}건  최고점=${fmt(v2Top)}  후보=${v2.candidateCount}`);
      console.log(`     ${'순위'.padEnd(4)} ${'종류'.padEnd(6)} ${'vec'.padStart(6)} ${'kw'.padStart(6)} ${'title'.padStart(6)} ${'tbl'.padStart(6)} ${'final'.padStart(6)}  섹션`);
      v2.chunks.slice(0, 5).forEach((c, i) => {
        console.log(`     ${String(i + 1).padEnd(4)} ${c.kind.padEnd(6)} ${fmt(c.vectorScore)} ${fmt(c.keywordScore)} ${fmt(c.titleScore)} ${fmt(c.tableScore)} ${fmt(c.finalScore)}  ${c.sectionTitle.slice(0, 25)}`);
      });
    } catch (e) {
      console.log(`  V2 오류: ${e instanceof Error ? e.message : e}`);
    }

    v1TotalHits += v1Count; v2TotalHits += v2Count;
    v1TotalScore += v1Top; v2TotalScore += v2Top;

    // jp: 간단 판정 — V2가 결과를 더 찾거나 최고점이 높으면 ↑
    const better = v2Count > v1Count || v2Top > v1Top;
    console.log(`  → ${better ? '✅ V2 우세 (결과수↑ 또는 점수↑)' : '≈ 비슷'}`);
  }

  console.log('\n' + '═'.repeat(70));
  console.log('종합 비교');
  console.log('═'.repeat(70));
  console.log(`  총 검색 결과 수:   V1=${v1TotalHits}  →  V2=${v2TotalHits}`);
  console.log(`  평균 최고 점수:    V1=${(v1TotalScore / TEST_QUESTIONS.length).toFixed(3)}  →  V2=${(v2TotalScore / TEST_QUESTIONS.length).toFixed(3)}`);
  console.log(`  질문당 평균 결과:  V1=${(v1TotalHits / TEST_QUESTIONS.length).toFixed(1)}  →  V2=${(v2TotalHits / TEST_QUESTIONS.length).toFixed(1)}`);
  console.log('═'.repeat(70));
  console.log('\n참고: V2는 표 검색 병합 + 유형별 가중치로 금액/특수관계자 질문에서 특히 강해집니다.');
  console.log('Claude rerank를 켜려면: NOTES_RERANK_LLM=true 환경변수 설정 후 재실행\n');

  process.exit(0);
}

run().catch((e) => {
  console.error('테스트 실행 실패:', e);
  process.exit(1);
});
