// ============================================================
// jp: 주석 검색 프론트 서비스 — 표준 응답 계약 소비
// jp: 위치: src/services/notesSearchService.ts
// jp: 중요: apiClient.post는 {success,data} 봉투를 이미 벗겨서 data 안쪽만 반환한다.
// jp:       따라서 반환값이 곧 NotesSearchResponse (봉투 재처리 금지).
// ============================================================
import { apiClient } from './apiClient';

// jp: ===== 백엔드와 동일한 표준 타입 (복제) =====
export interface NotesSearchResult {
  id: string;
  kind: 'prose' | 'table';
  title: string;
  sectionTitle?: string;
  sourceYear?: number;
  chunkText: string;
  tableMarkdown?: string;
  chunkIndex?: number;
  reportName?: string | null;
  reportPeriod?: string | null;
  receiptNo: string;
  score: number;
  scores?: {
    vector?: number;
    keyword?: number;
    title?: number;
    table?: number;
    final?: number;
    confidence?: number;
  };
  dartUrl?: string | null;
}

export interface NotesSearchResponse {
  query: string;
  questionType: string;
  count: number;
  candidateCount: number;
  aiAnswer: string | null;
  weak: boolean;
  evidence: unknown[];
  results: NotesSearchResult[];
  fallbackUrl: string | null;
}

// jp: 백엔드가 data 안에 담아 보내는 실제 구조 (apiClient가 이걸 바로 반환)
interface NotesSearchData {
  query?: string;
  questionType?: string;
  count?: number;
  candidateCount?: number;
  aiAnswer?: string | null;
  weak?: boolean;
  evidence?: unknown[];
  results?: NotesSearchResult[];
  fallbackUrl?: string | null;
}

// jp: ===== 클라이언트 측 타입 가드 (이중 안전망) =====
export function isValidNotesResult(x: unknown): x is NotesSearchResult {
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

export interface SearchNotesOptions {
  stockCode?: string;
  corpCode?: string;
  reportPeriod?: string;
  limit?: number;
}

const EMPTY: NotesSearchResponse = {
  query: '', questionType: 'general', count: 0, candidateCount: 0,
  aiAnswer: null, weak: false, evidence: [], results: [], fallbackUrl: null,
};

export async function searchNotes(
  query: string,
  options: SearchNotesOptions = {},
): Promise<NotesSearchResponse> {
  const q = (query || '').trim();
  if (!q) return { ...EMPTY, query: q };

  try {
    // jp: apiClient.post는 {success,data} 봉투를 이미 벗겨서 data만 반환
    // jp: → 반환값(data)이 곧 NotesSearchData. 봉투 재처리 안 함.
    const data = await apiClient.post<NotesSearchData>('/api/notes/search', {
      query: q,
      stockCode: options.stockCode,
      corpCode: options.corpCode,
      reportPeriod: options.reportPeriod,
      limit: options.limit ?? 7,
    });

    if (!data) return { ...EMPTY, query: q };

    // jp: 표준 계약이라도 한 번 더 가드 (깨진 item 제거)
    const safeResults = Array.isArray(data.results)
      ? data.results.filter(isValidNotesResult)
      : [];

    return {
      query: data.query ?? q,
      questionType: data.questionType ?? 'general',
      count: safeResults.length,
      candidateCount: data.candidateCount ?? 0,
      aiAnswer: data.aiAnswer ?? null,
      weak: data.weak ?? false,
      evidence: Array.isArray(data.evidence) ? data.evidence : [],
      results: safeResults,
      fallbackUrl: data.fallbackUrl ?? null,
    };
  } catch {
    // jp: 실패 시 빈 결과 (화면은 "못 찾음" 안내 표시)
    return { ...EMPTY, query: q };
  }
}
