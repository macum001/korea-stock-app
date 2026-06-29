// ============================================================
// jp: 주석 검색 V2 — 품질 최적화 파이프라인
// jp: 위치: backend/src/services/ai/notesSearchV2.service.ts
// jp: 구조: 후보확장(30) → 질문유형 분류 → 하이브리드 점수화 → 규칙 rerank
// jp:        → (옵션) Claude rerank → 표 검색 병합 → 근거 5~8개 반환
// jp:
// jp: 기존 notesEmbedding.service.ts의 embedTexts/query를 재사용하되,
// jp: searchNotes의 "mainKw 미포함 sim=0 제거" 문제를 근본 해결.
// jp:
// jp: source_section 컬럼이 없으므로 chunk_text 앞부분에서 섹션 제목을 "추정"한다.
// jp: Claude rerank는 process.env.NOTES_RERANK_LLM === 'true'일 때만 동작 (기본 off).
// ============================================================
import { ENV } from '../../config/env';
import { query } from '../../config/db';
import { embedTexts, cleanMarkdownTable } from './notesEmbedding.service';

// ── 환경 토글 ───────────────────────────────────────────
const RERANK_LLM_ENABLED = process.env.NOTES_RERANK_LLM === 'true';
const RERANK_LLM_TOPN = 12;        // jp: Claude rerank에 넘길 상위 후보 수
const DEBUG_LOG = process.env.NOTES_SEARCH_DEBUG !== 'false'; // jp: 기본 on

// ── 결과 타입 ───────────────────────────────────────────
export interface NotesV2Chunk {
  kind: 'prose' | 'table';
  stockCode: string | null;
  stockName: string | null;
  receiptNo: string;
  reportName: string | null;
  reportPeriod: string | null;
  chunkIndex: number;
  text: string;            // jp: prose=chunk_text, table=markdown
  sectionTitle: string;    // jp: 추정한 주석 섹션 제목
  // jp: 점수 분해 (로그/디버깅용)
  vectorScore: number;
  keywordScore: number;
  titleScore: number;
  tableScore: number;
  finalScore: number;
}

export interface NotesV2Options {
  stockCode?: string;
  corpCode?: string;
  reportPeriod?: string;
  limit?: number;          // jp: 최종 반환 개수 (기본 7, 5~8 권장)
}

export interface NotesV2Result {
  query: string;
  questionType: QuestionType;
  chunks: NotesV2Chunk[];
  candidateCount: number;  // jp: rerank 전 후보 수
  debug: NotesV2DebugRow[];
}

// ── 질문 유형 ───────────────────────────────────────────
export type QuestionType =
  | 'accounting_policy'   // 회계정책
  | 'financial_amount'    // 금액/재무 수치
  | 'risk'                // 리스크/우발부채
  | 'related_party'       // 특수관계자/주식보상/퇴직급여
  | 'period_change'       // 전기 대비 변화
  | 'general';            // 기타

interface NotesV2DebugRow {
  rank: number;
  kind: string;
  section: string;
  receiptNo: string;
  vectorScore: number;
  keywordScore: number;
  titleScore: number;
  tableScore: number;
  finalScore: number;
  preview: string;
}

// ── 질문 유형별 가중치 프로파일 ──────────────────────────
// jp: [vector, keyword, title, table] 가중치
const TYPE_WEIGHTS: Record<QuestionType, { vector: number; keyword: number; title: number; table: number }> = {
  // jp: 회계정책 — 제목 매칭이 가장 중요 (예: "수익인식", "리스")
  accounting_policy: { vector: 0.45, keyword: 0.20, title: 0.30, table: 0.05 },
  // jp: 금액/재무 — 표를 강하게 우선
  financial_amount:  { vector: 0.30, keyword: 0.20, title: 0.15, table: 0.35 },
  // jp: 리스크/우발부채 — 제목+본문 균형
  risk:              { vector: 0.45, keyword: 0.25, title: 0.25, table: 0.05 },
  // jp: 특수관계자/퇴직급여/주식보상 — 제목 매칭 강함 + 표도 자주 등장
  related_party:     { vector: 0.35, keyword: 0.20, title: 0.30, table: 0.15 },
  // jp: 전기 대비 변화 — 표 우선 (비교표), 본문 보조
  period_change:     { vector: 0.35, keyword: 0.20, title: 0.15, table: 0.30 },
  // jp: 일반 — 균형
  general:           { vector: 0.50, keyword: 0.25, title: 0.20, table: 0.05 },
};

// ── 유형별 트리거 키워드 ────────────────────────────────
// jp: financial_amount는 "명시적 금액 표현"만 (있/원 같은 오탐 제거)
const TYPE_KEYWORDS: Record<Exclude<QuestionType, 'general'>, RegExp> = {
  // jp: 주제어 매칭이 핵심인 유형들 (risk/related/policy)을 먼저 본다
  risk:              /리스크|위험|우발|소송|충당부채|담보|보증|약정|제재|불확실|손상|부도|신용위험|유동성|계류/,
  related_party:     /특수관계자|특수\s*관계|관계회사|퇴직급여|퇴직연금|주식보상|스톡옵션|주식기준보상|임직원|보수|대여금|차입/,
  accounting_policy: /회계정책|인식기준|측정방법|평가방법|수익\s*인식|감가상각|상각방법|회계처리|적용기준|기준서|어떻게\s*인식|어떻게\s*처리|어떻게\s*평가/,
  // jp: 금액은 명시적 표현만 (얼마/금액/규모/총액/잔액 등). "있나요/원" 단독 제외
  financial_amount:  /얼마|금액|규모|총액|잔액|장부금액|평가액|단가|몇\s*원|몇\s*억|시가총액/,
  period_change:     /전기\s*대비|전년\s*대비|증감|늘었|줄었|증가했|감소했|추이|얼마나\s*변/,
};

export function classifyQuestion(q: string): QuestionType {
  const text = q || '';
  // jp: 우선순위 재조정 — 주제 특이도가 높은 유형 먼저
  // jp: risk/related/policy를 financial_amount보다 먼저 체크 (오분류 방지)
  // jp: 예) "우발부채 위험 있나요" → risk (기존엔 '있'이 금액에 걸려 오분류됨)
  if (TYPE_KEYWORDS.risk.test(text)) return 'risk';
  if (TYPE_KEYWORDS.related_party.test(text)) return 'related_party';
  if (TYPE_KEYWORDS.accounting_policy.test(text)) return 'accounting_policy';
  if (TYPE_KEYWORDS.financial_amount.test(text)) return 'financial_amount';
  if (TYPE_KEYWORDS.period_change.test(text)) return 'period_change';
  return 'general';
}

// ── 키워드 추출 (기존 로직 + 약간 보강) ──────────────────
const STOP = new Set([
  '그리고', '또는', '관련', '대한', '등의', '및', '거래의', '관해', '내용', '경우',
  '있는', '없는', '위한', '따른', '통한', '부터', '까지', '에서', '으로',
  '어떻게', '무엇', '얼마', '어떤', '하는', '되는', '인가', '인지', '나요', '알려',
]);

export function extractKeywords(q: string): string[] {
  // jp: 괄호·중점·슬래시를 공백으로 분리 → "주식기준보상(스톡옵션)" → "주식기준보상 스톡옵션"
  const normalized = (q || '')
    .replace(/[()（）\[\]·/,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized
    .split(/\s+/)
    .map((w) => w.replace(/[은는이가을를의에과와로으로부터까지나요]+$/, '').trim())
    .filter((w) => w.length >= 2 && !STOP.has(w));
}

// ── 섹션 제목 추정 (source_section 컬럼 부재 우회) ────────
// jp: chunk_text 앞부분에서 "주석 N. XXX" / "N. XXX" / "XXX에 관한 사항" 패턴 추출
// jp: 못 찾으면 앞 40자를 제목 대용으로 사용
const SECTION_PATTERNS: RegExp[] = [
  /주석\s*\d+\s*[.:]?\s*([가-힣A-Za-z·\s]{2,40})/,
  /^\s*\d{1,2}\s*[.)]\s*([가-힣A-Za-z·\s]{2,40})/,
  /([가-힣]{2,20})\s*에\s*관한\s*(?:사항|주석)/,
  /(수익\s*인식|금융상품|리스|퇴직급여|특수관계자|우발부채|충당부채|법인세|재고자산|유형자산|무형자산|주식기준보상|영업부문|현금흐름)/,
];

export function guessSectionTitle(chunkText: string): string {
  const head = (chunkText || '').slice(0, 200);
  for (const re of SECTION_PATTERNS) {
    const m = re.exec(head);
    if (m && m[1]) return m[1].replace(/\s+/g, ' ').trim().slice(0, 40);
  }
  return head.slice(0, 40).trim();
}

// ── 1. 후보 확장 (벡터 검색, 30개) ──────────────────────
async function fetchProseCandidates(
  qvec: number[], opt: NotesV2Options, candN: number
): Promise<Array<{
  stock_code: string | null; stock_name: string | null; receipt_no: string;
  report_name: string | null; report_period: string | null;
  chunk_index: number; chunk_text: string; dist: number;
}>> {
  const vecLit = '[' + qvec.join(',') + ']';
  const conds: string[] = [];
  const params: any[] = [vecLit];
  let pi = 2;
  if (opt.stockCode) { conds.push(`stock_code = $${pi++}`); params.push(opt.stockCode); }
  if (opt.corpCode) { conds.push(`corp_code = $${pi++}`); params.push(opt.corpCode); }
  if (opt.reportPeriod) { conds.push(`report_period = $${pi++}`); params.push(opt.reportPeriod); }
  const where = conds.length > 0 ? 'WHERE ' + conds.join(' AND ') : '';
  params.push(candN);
  return query(
    `SELECT stock_code, stock_name, receipt_no, report_name, report_period,
            chunk_index, chunk_text, embedding <=> $1::vector AS dist
     FROM disclosure_notes_vec ${where}
     ORDER BY embedding <=> $1::vector LIMIT $${pi}`,
    params
  );
}

// ── 2. 표 후보 (caption 키워드 매칭) ────────────────────
async function fetchTableCandidates(
  keywords: string[], opt: NotesV2Options, candN: number
): Promise<Array<{
  stock_code: string | null; stock_name: string | null; receipt_no: string;
  report_name: string | null; report_period: string | null;
  table_index: number; table_md: string; table_caption: string;
}>> {
  if (keywords.length === 0) return [];
  // jp: 키워드 OR 조건으로 caption 매칭 (최소 1개라도 포함)
  const conds: string[] = [];
  const params: any[] = [];
  let pi = 1;
  const kwOr = keywords.slice(0, 5).map((k) => {
    params.push('%' + k + '%');
    return `table_caption LIKE $${pi++}`;
  });
  conds.push('(' + kwOr.join(' OR ') + ')');
  if (opt.stockCode) { conds.push(`stock_code = $${pi++}`); params.push(opt.stockCode); }
  if (opt.corpCode) { conds.push(`corp_code = $${pi++}`); params.push(opt.corpCode); }
  if (opt.reportPeriod) { conds.push(`report_period = $${pi++}`); params.push(opt.reportPeriod); }
  params.push(candN);
  try {
    return await query(
      `SELECT stock_code, stock_name, receipt_no, report_name, report_period,
              table_index, table_md, table_caption
       FROM disclosure_notes_tables
       WHERE ${conds.join(' AND ')}
       ORDER BY table_index LIMIT $${pi}`,
      params
    );
  } catch (err) {
    console.warn('[NotesV2] 표 후보 조회 실패:', err instanceof Error ? err.message : err);
    return [];
  }
}

// ── 3. 하이브리드 점수화 ────────────────────────────────
function scoreChunk(
  base: { vectorScore: number; text: string; sectionTitle: string; kind: 'prose' | 'table' },
  keywords: string[], mainKw: string | null, qtype: QuestionType
): { keywordScore: number; titleScore: number; tableScore: number; finalScore: number } {
  const w = TYPE_WEIGHTS[qtype];
  const txt = base.text || '';
  const title = base.sectionTitle || '';

  // jp: keywordScore — 본문 내 키워드 매칭 비율 (0~1)
  const kwHits = keywords.filter((k) => txt.includes(k)).length;
  const keywordScore = keywords.length > 0 ? Math.min(1, kwHits / keywords.length) : 0;

  // jp: titleScore — 섹션 제목에 키워드 포함 시 강한 가산 (0~1)
  const titleHits = keywords.filter((k) => title.includes(k)).length;
  let titleScore = keywords.length > 0 ? Math.min(1, titleHits / keywords.length) : 0;
  // jp: mainKw가 제목에 있으면 만점 부스트 (예: 질문 "퇴직급여" → 제목 "퇴직급여")
  if (mainKw && title.includes(mainKw)) titleScore = 1;

  // jp: tableScore — 표 청크 점수. caption 키워드 실매칭에 비례 (무관한 표 억제)
  // jp: 질문유형별로 표 선호도 차등: 금액/전기대비는 표 강함, 리스크/회계정책은 표 약함
  let tableScore = 0;
  if (base.kind === 'table') {
    const TABLE_PREFER: Record<QuestionType, number> = {
      financial_amount: 0.9, period_change: 0.85, related_party: 0.6,
      accounting_policy: 0.35, risk: 0.35, general: 0.5,
    };
    const prefer = TABLE_PREFER[qtype];
    // jp: 핵심 — caption(=title)에 mainKw 없으면 표 점수 대폭 감소
    // jp: (스톡옵션 표가 "우발부채" 질문에 뜨던 문제 차단)
    const titleHasMain = mainKw ? title.includes(mainKw) : false;
    const captionMatch = keywords.length > 0
      ? keywords.filter((k) => title.includes(k)).length / keywords.length
      : 0;
    const relevance = titleHasMain ? 1 : captionMatch * 0.4;
    tableScore = prefer * relevance;
  }

  // jp: mainKw 미포함 — 기존엔 sim=0으로 완전 제거 → 0.5배 감점으로 완화
  let vectorScore = base.vectorScore;
  if (mainKw && !txt.includes(mainKw) && !title.includes(mainKw)) {
    vectorScore *= 0.5;  // jp: 의미는 맞을 수 있으니 죽이지 말고 감점만
  }

  const finalScore =
    w.vector * vectorScore +
    w.keyword * keywordScore +
    w.title * titleScore +
    w.table * tableScore;

  return { keywordScore, titleScore, tableScore, finalScore };
}

// ── 4. (옵션) Claude rerank ─────────────────────────────
// jp: 규칙 rerank 상위 RERANK_LLM_TOPN개를 Claude에 주고 질문 관련성 0~10 점수 요청
async function llmRerank(
  question: string, chunks: NotesV2Chunk[]
): Promise<NotesV2Chunk[]> {
  if (!RERANK_LLM_ENABLED) return chunks;
  if (!ENV.AI_DISCLOSURE.ENABLED || !ENV.AI_DISCLOSURE.API_KEY) return chunks;
  if (chunks.length <= 1) return chunks;

  const topN = chunks.slice(0, RERANK_LLM_TOPN);
  const rest = chunks.slice(RERANK_LLM_TOPN);

  const listText = topN.map((c, i) =>
    `[${i}] (${c.sectionTitle}) ${c.text.slice(0, 300).replace(/\n/g, ' ')}`
  ).join('\n');

  const sys = '당신은 검색 결과 재정렬기입니다. 각 후보가 질문에 답하는 데 얼마나 직접적으로 관련있는지 0~10으로 평가하세요. 반드시 JSON 배열만 출력: [{"i":0,"score":8}, ...]. 설명 금지.';
  const user = `질문: "${question}"\n\n후보:\n${listText}\n\n각 후보의 관련성을 평가해 JSON 배열로만 답하세요.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ENV.AI_DISCLOSURE.API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ENV.AI_DISCLOSURE.MODEL,
        max_tokens: 500,
        system: sys,
        messages: [{ role: 'user', content: user }],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return chunks;
    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const raw = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text || '').join('').trim();
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return chunks;
    const scores = JSON.parse(jsonMatch[0]) as Array<{ i: number; score: number }>;
    // jp: LLM 점수를 finalScore에 0.5 가중 혼합 (규칙 점수도 유지)
    const scoreMap = new Map(scores.map((s) => [s.i, s.score]));
    topN.forEach((c, i) => {
      const llm = scoreMap.get(i);
      if (typeof llm === 'number') {
        c.finalScore = 0.5 * c.finalScore + 0.5 * (llm / 10);
      }
    });
    topN.sort((a, b) => b.finalScore - a.finalScore);
    if (DEBUG_LOG) console.log('[NotesV2] Claude rerank 적용됨');
    return [...topN, ...rest];
  } catch (err) {
    console.warn('[NotesV2] Claude rerank 실패 (규칙 점수 유지):', err instanceof Error ? err.message : err);
    return chunks;
  }
}

// ── 5. 메인 진입점 ──────────────────────────────────────
export async function searchNotesV2(
  queryStr: string, options: NotesV2Options = {}
): Promise<NotesV2Result> {
  const q = (queryStr || '').trim();
  const limit = Math.min(Math.max(options.limit || 7, 5), 8); // jp: 5~8 강제
  const empty: NotesV2Result = { query: q, questionType: 'general', chunks: [], candidateCount: 0, debug: [] };
  if (!q) return empty;

  // jp: 질문 유형 분류 + 키워드 추출
  const qtype = classifyQuestion(q);
  const keywords = extractKeywords(q);
  const mainKw = keywords.length > 0 ? [...keywords].sort((a, b) => b.length - a.length)[0] : null;

  // jp: 질문 임베딩
  let qvec: number[];
  try {
    const [vec] = await embedTexts([q], 'query');
    qvec = vec;
  } catch (err) {
    console.error('[NotesV2] 질문 임베딩 실패:', err instanceof Error ? err.message : err);
    return { ...empty, questionType: qtype };
  }
  if (!qvec || qvec.length === 0) return { ...empty, questionType: qtype };

  // jp: 후보 확장 — 산문 30개 + 표 (limit*2)
  const PROSE_CAND = 30;
  const TABLE_CAND = Math.max(limit * 2, 10);
  const [proseRows, tableRows] = await Promise.all([
    fetchProseCandidates(qvec, options, PROSE_CAND).catch(() => []),
    fetchTableCandidates(keywords, options, TABLE_CAND).catch(() => []),
  ]);

  // jp: 산문 후보 → NotesV2Chunk
  const proseChunks: NotesV2Chunk[] = proseRows.map((r) => {
    const sectionTitle = guessSectionTitle(r.chunk_text);
    const vectorScore = Math.max(0, 1 - Number(r.dist));
    const sc = scoreChunk(
      { vectorScore, text: r.chunk_text, sectionTitle, kind: 'prose' },
      keywords, mainKw, qtype
    );
    return {
      kind: 'prose', stockCode: r.stock_code, stockName: r.stock_name,
      receiptNo: r.receipt_no, reportName: r.report_name, reportPeriod: r.report_period,
      chunkIndex: r.chunk_index, text: r.chunk_text, sectionTitle,
      vectorScore, ...sc,
    };
  });

  // jp: 표 후보 → NotesV2Chunk (벡터 점수는 caption 키워드 매칭으로 근사)
  const tableChunks: NotesV2Chunk[] = tableRows.map((r) => {
    const caption = r.table_caption || '';
    const sectionTitle = guessSectionTitle(caption) || caption.slice(0, 40);
    // jp: 표는 임베딩 검색 안 함 → caption 키워드 매칭률을 vectorScore 근사값으로
    // jp: 매칭 0이면 기본점도 낮게 (무관한 표가 0.4 깔고 들어오던 문제 수정)
    const capHits = keywords.filter((k) => caption.includes(k)).length;
    const matchRatio = keywords.length > 0 ? capHits / keywords.length : 0;
    const vectorScore = matchRatio > 0
      ? Math.min(0.9, 0.45 + 0.45 * matchRatio)
      : 0.2;  // jp: 키워드 0매칭 표는 거의 죽임
    const md = cleanMarkdownTable(r.table_md);
    const sc = scoreChunk(
      { vectorScore, text: caption, sectionTitle, kind: 'table' },
      keywords, mainKw, qtype
    );
    return {
      kind: 'table', stockCode: r.stock_code, stockName: r.stock_name,
      receiptNo: r.receipt_no, reportName: r.report_name, reportPeriod: r.report_period,
      chunkIndex: r.table_index, text: md, sectionTitle,
      vectorScore, ...sc,
    };
  });

  // jp: 병합 + 규칙 rerank
  let all = [...proseChunks, ...tableChunks];
  all.sort((a, b) => b.finalScore - a.finalScore);

  // jp: 최소 점수 컷 (관련 없는 결과 제거) — 유형별로 약간 다르게
  const MIN_FINAL = qtype === 'financial_amount' ? 0.18 : 0.22;
  all = all.filter((c) => c.finalScore >= MIN_FINAL);

  const candidateCount = all.length;

  // jp: (옵션) Claude rerank — 상위 후보만
  if (RERANK_LLM_ENABLED) {
    all = await llmRerank(q, all);
  }

  // jp: 중복 제거 — 같은 receiptNo+섹션 표가 5개씩 깔리던 문제 수정
  // jp: (1) 텍스트 앞부분 중복 제거 (2) 같은 receiptNo+섹션은 최대 2개까지만
  const seen = new Set<string>();
  const sectionCount = new Map<string, number>();
  const deduped = all.filter((c) => {
    const sig = c.receiptNo + '|' + c.kind + '|' + c.text.slice(0, 80);
    if (seen.has(sig)) return false;
    seen.add(sig);
    // jp: 같은 보고서+섹션 표는 최대 2개 (다양성 확보)
    const secKey = c.receiptNo + '|' + c.sectionTitle;
    const cnt = sectionCount.get(secKey) || 0;
    if (cnt >= 2) return false;
    sectionCount.set(secKey, cnt + 1);
    return true;
  });

  const finalChunks = deduped.slice(0, limit);

  // jp: 디버그 로그
  const debug: NotesV2DebugRow[] = finalChunks.map((c, i) => ({
    rank: i + 1,
    kind: c.kind,
    section: c.sectionTitle,
    receiptNo: c.receiptNo,
    vectorScore: +c.vectorScore.toFixed(3),
    keywordScore: +c.keywordScore.toFixed(3),
    titleScore: +c.titleScore.toFixed(3),
    tableScore: +c.tableScore.toFixed(3),
    finalScore: +c.finalScore.toFixed(3),
    preview: c.text.slice(0, 60).replace(/\n/g, ' '),
  }));

  if (DEBUG_LOG) {
    console.log(`\n[NotesV2] 질문="${q}" 유형=${qtype} 후보=${candidateCount} 최종=${finalChunks.length}`);
    console.table(debug);
  }

  return { query: q, questionType: qtype, chunks: finalChunks, candidateCount, debug };
}
