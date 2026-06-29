// ============================================================
// jp: 주석 검색 응답 표준 계약 (Contract)
// jp: 위치: backend/src/types/notesSearch.ts
// jp: 백엔드 normalize와 프론트 렌더링이 공유하는 단일 표준 타입.
// jp: V1/V2 내부 필드가 무엇이든 이 형태로 변환해서 내려준다.
// ============================================================

// jp: ===== 표준 결과 타입 (프론트도 동일 구조 복제) =====
export interface NotesSearchResultStd {
  id: string;                  // jp: React key + 중복제거용 (receiptNo|kind|index)
  kind: 'prose' | 'table';
  title: string;               // jp: 카드 헤더에 보일 제목 (보고서명 등)
  sectionTitle?: string;       // jp: 추정 주석 섹션명
  sourceYear?: number;         // jp: 기준 연도
  chunkText: string;           // jp: 산문 본문 또는 표 fallback 텍스트 (항상 채움)
  tableMarkdown?: string;      // jp: 표일 때만 — 마크다운 표
  chunkIndex?: number;
  reportName?: string | null;
  reportPeriod?: string | null;
  receiptNo: string;
  score: number;               // jp: finalScore
  scores?: {
    vector?: number;
    keyword?: number;
    title?: number;
    table?: number;
    final?: number;
    confidence?: number;       // jp: 0~1 정규화 신뢰도
  };
  dartUrl?: string | null;
}

// jp: ===== normalize 입력 (V2 chunk + dartUrl) =====
export interface RawV2Chunk {
  kind: 'prose' | 'table';
  stockCode: string | null;
  stockName: string | null;
  receiptNo: string;
  reportName: string | null;
  reportPeriod: string | null;
  chunkIndex: number;
  text: string;                // jp: prose=본문, table=마크다운
  sectionTitle: string;
  vectorScore: number;
  keywordScore: number;
  titleScore: number;
  tableScore: number;
  finalScore: number;
}

// jp: reportPeriod("2025FY","2024Q1" 등)에서 연도 추출
function extractYear(period: string | null, reportName: string | null): number | undefined {
  const src = period || reportName || '';
  const m = src.match(/(20\d{2})/);
  return m ? parseInt(m[1], 10) : undefined;
}

// jp: finalScore(0~1+) → confidence(0~1) 클램프
function toConfidence(finalScore: number): number {
  return Math.max(0, Math.min(1, finalScore));
}

// jp: ===== 핵심: V2 chunk → 표준 타입 변환 =====
// jp: table인데 본문(text)이 비면 null 반환 → 호출부에서 제외
export function normalizeV2Chunk(
  c: RawV2Chunk,
  dartUrl: string | null,
): NotesSearchResultStd | null {
  const text = (c.text || '').trim();

  // jp: table은 tableMarkdown=text, 비면 제외 (placeholder 안 만듦)
  if (c.kind === 'table') {
    if (!text) {
      // jp: 표 본문이 없으면 — DART URL이라도 있으면 slim 카드용으로 살림
      if (!dartUrl) return null;
    }
  } else {
    // jp: prose는 본문 없으면 무조건 제외
    if (!text) return null;
  }

  const id = `${c.receiptNo}|${c.kind}|${c.chunkIndex}`;
  const sourceYear = extractYear(c.reportPeriod, c.reportName);

  const std: NotesSearchResultStd = {
    id,
    kind: c.kind,
    title: c.reportName || '보고서',
    sectionTitle: c.sectionTitle || undefined,
    sourceYear,
    chunkText: text,                                  // jp: 항상 채움 (table도 fallback)
    tableMarkdown: c.kind === 'table' ? text : undefined,
    chunkIndex: c.chunkIndex,
    reportName: c.reportName,
    reportPeriod: c.reportPeriod,
    receiptNo: c.receiptNo,
    score: c.finalScore,
    scores: {
      vector: +c.vectorScore.toFixed(3),
      keyword: +c.keywordScore.toFixed(3),
      title: +c.titleScore.toFixed(3),
      table: +c.tableScore.toFixed(3),
      final: +c.finalScore.toFixed(3),
      confidence: +toConfidence(c.finalScore).toFixed(3),
    },
    dartUrl: dartUrl || undefined,
  };
  return std;
}

// jp: ===== 타입 가드 (백+프론트 공용 검증) =====
// jp: 최소 조건: id, kind, title, score, (chunkText || tableMarkdown)
export function isValidNotesResult(x: unknown): x is NotesSearchResultStd {
  if (!x || typeof x !== 'object') return false;
  const r = x as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id) return false;
  if (r.kind !== 'prose' && r.kind !== 'table') return false;
  if (typeof r.title !== 'string') return false;
  if (typeof r.score !== 'number' || Number.isNaN(r.score)) return false;
  const hasText = typeof r.chunkText === 'string' && r.chunkText.length > 0;
  const hasTable = typeof r.tableMarkdown === 'string' && r.tableMarkdown.length > 0;
  if (!hasText && !hasTable) return false;
  return true;
}
