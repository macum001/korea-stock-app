// ============================================================
// jp: 주석 임베딩 서비스 (RAG 자동 방식) — 고도화판 v2
// jp: 사용자가 종목/공시를 보면 → 사업보고서 주석을 자동 임베딩 → 검색 DB에 축적
// jp: 위치: backend/src/services/ai/notesEmbedding.service.ts
// jp: v2 보강:
// jp:   1. 주석 영역 우선 탐지 (앞 본문이 청크 다 먹어 뒤 주석 누락되는 문제 해결)
// jp:   2. MAX_CHUNKS 상향 + 주석영역 기준 (대기업 주석 누락 방지)
// jp:   3. 모든 단계 재시도/격리 (DART/임베딩/저장 100% 실패 방지)
// jp:   4. 상태 추적(notes_embed_status) + 부분 성공 저장 + 자동 재처리
// ============================================================
import axios from 'axios';
import AdmZip from 'adm-zip';
import { ENV } from '../../config/env';
import { query } from '../../config/db';

const DOC_URL = 'https://opendart.fss.or.kr/api/document.xml';
const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MODEL = 'voyage-3.5';
const EMBED_DIM = 1024;

const CHUNK_SIZE = 3000;        // jp: 청크 글자 수 (한국어 ~2000토큰)
const CHUNK_OVERLAP = 200;      // jp: 청크 간 겹침
const MAX_CHUNKS = 200;         // jp: v2 상향 60→200 (대기업 주석 커버, 약 56만자)
const VOYAGE_BATCH = 7;         // jp: Voyage 배치 (무료티어 한도)
const BATCH_DELAY_MS = 1500;    // jp: 배치 사이 대기
const MAX_RETRY = 5;            // jp: 429 재시도
const DART_RETRY = 3;           // jp: DART 다운로드 재시도
const DART_RETRY_DELAY = 2000;  // jp: DART 재시도 대기

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// jp: ===== 주석 영역 시작 키워드 (이 부근부터가 주석 본문) =====
// jp: 검증: 회사마다 표현 다름 → 여러 패턴 시도, 가장 이른 위치 채택
// jp: 못 찾으면 전체를 대상으로 (fallback) — 누락보다 과포함이 안전
const NOTES_ANCHORS = [
  /주석\s*제\s*\d+\s*\([당전]\)\s*기/,
  /(연결\s*)?재무제표\s*에?\s*대한\s*주석/,
  /\d{1,2}\s*\.\s*(일반\s*사항|회사의?\s*개요|당사의?\s*개요|보고\s*기업)/,
  /중요한?\s*회계\s*정책/,
];

// jp: ===== 1. 메인 XML 추출 (DART 재시도 포함) =====
export async function fetchMainDocumentText(receiptNo: string): Promise<string | null> {
  if (!ENV.DART.API_KEY || ENV.DART.API_KEY === 'your_dart_api_key_here') return null;

  // jp: DART 다운로드 재시도 (네트워크/일시 오류 방어)
  let buf: Buffer | null = null;
  for (let attempt = 1; attempt <= DART_RETRY; attempt++) {
    try {
      const res = await axios.get(DOC_URL, {
        params: { crtfc_key: ENV.DART.API_KEY, rcept_no: receiptNo },
        responseType: 'arraybuffer',
        timeout: 60000,
      });
      const b = Buffer.from(res.data);
      // jp: ZIP 시그니처 확인 (PK)
      if (b.length < 4 || b[0] !== 0x50 || b[1] !== 0x4b) {
        // jp: ZIP 아님 = 에러 응답일 수 있음, 재시도 무의미하므로 중단
        console.warn(`[NotesEmbed] ${receiptNo} ZIP 아님 (DART 에러 응답 가능)`);
        return null;
      }
      buf = b;
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[NotesEmbed] DART 다운로드 실패 (${attempt}/${DART_RETRY}): ${msg}`);
      if (attempt < DART_RETRY) await sleep(DART_RETRY_DELAY * attempt);
    }
  }
  if (!buf) return null;

  // jp: ZIP 파싱 + 메인 XML 선택
  try {
    const zip = new AdmZip(buf);
    const entries = zip.getEntries();
    if (entries.length === 0) return null;

    let mainEntry = null;
    let maxSize = 0;
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const name = entry.entryName;
      if (!name.endsWith('.xml')) continue;
      if (/_\d+\.xml$/.test(name)) continue;  // jp: 첨부 제외
      const size = entry.header.size;
      if (size > maxSize) { maxSize = size; mainEntry = entry; }
    }
    if (!mainEntry) {
      // jp: 메인 없으면 가장 큰 XML fallback
      for (const entry of entries) {
        if (entry.isDirectory || !entry.entryName.endsWith('.xml')) continue;
        if (entry.header.size > maxSize) { maxSize = entry.header.size; mainEntry = entry; }
      }
    }
    if (!mainEntry) return null;

    const raw = decodeKorean(mainEntry.getData());
    // jp: 표 제거 후 서술만 반환 (표는 fetchDocumentTables로 따로 - 임베딩 노이즈 제거)
    return stripMarkup(removeTables(raw));
  } catch (err) {
    console.error('[NotesEmbed] ZIP 파싱 실패:', err instanceof Error ? err.message : err);
    return null;
  }
}

// jp: ===== 표 추출 함수 - document.xml에서 <TABLE>만 마크다운으로 =====
// jp: fetchMainDocumentText와 같은 ZIP/XML을 받아 표만 반환 (검색 결과 표 렌더링용)
export async function fetchDocumentTables(receiptNo: string): Promise<string[]> {
  if (!ENV.DART.API_KEY || ENV.DART.API_KEY === 'your_dart_api_key_here') return [];
  let buf: Buffer | null = null;
  for (let attempt = 1; attempt <= DART_RETRY; attempt++) {
    try {
      const res = await axios.get(DOC_URL, {
        params: { crtfc_key: ENV.DART.API_KEY, rcept_no: receiptNo },
        responseType: 'arraybuffer',
        timeout: 60000,
      });
      const b = Buffer.from(res.data);
      if (b.length < 4 || b[0] !== 0x50 || b[1] !== 0x4b) return [];
      buf = b;
      break;
    } catch {
      if (attempt < DART_RETRY) await sleep(DART_RETRY_DELAY * attempt);
    }
  }
  if (!buf) return [];
  try {
    const zip = new AdmZip(buf);
    const entries = zip.getEntries();
    let mainEntry = null;
    let maxSize = 0;
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const name = entry.entryName;
      if (!name.endsWith('.xml')) continue;
      if (/_\d+\.xml$/.test(name)) continue;
      const size = entry.header.size;
      if (size > maxSize) { maxSize = size; mainEntry = entry; }
    }
    if (!mainEntry) return [];
    const raw = decodeKorean(mainEntry.getData());
    return tablesToMarkdown(raw);
  } catch {
    return [];
  }
}

// jp: ===== 2. 주석 영역 탐지 (앞 본문 스킵, 뒤 주석 누락 방지) =====
// jp: 주석 시작 위치를 찾아 그 앞(목차/재무본문)은 잘라냄 → 청크가 주석에 집중
export function findNotesStart(text: string): number {
  let earliest = -1;
  for (const re of NOTES_ANCHORS) {
    const m = re.exec(text);
    if (m && m.index >= 0) {
      if (earliest === -1 || m.index < earliest) earliest = m.index;
    }
  }
  // jp: 못 찾거나 너무 뒤(90% 이후)면 전체 사용 (과포함이 누락보다 안전)
  if (earliest === -1 || earliest > text.length * 0.9) return 0;
  return earliest;
}

// jp: ===== 숫자 청크 판정 (XBRL이 숫자 담당 → RAG는 서술만, 숫자표는 노이즈) =====
// jp: 청크에서 숫자/기호/공백 비율이 높으면 = 재무수치 표 = 임베딩 제외
function isMostlyNumeric(text: string): boolean {
  if (!text || text.length < 50) return true;  // jp: 너무 짧으면 스킵
  const korean = (text.match(/[가-힣]/g) || []).length;
  const digits = (text.match(/[0-9]/g) || []).length;
  const total = text.length;
  const krRatio = korean / total;
  const dgRatio = digits / total;
  // jp: 데이터 검증 기준 (메타바이오메드 30청크 실측):
  // jp:   숫자 40%+ & 한글 35%미만 = 재무수치 표 (노이즈)
  // jp:   정확도 11/12, 중요 서술 0개 손실 — XBRL이 숫자 담당하므로 제거
  // jp:   극단적 케이스(한글 거의 없음)도 방어
  if (krRatio < 0.10) return true;                  // jp: 한글 거의 없음 = 확실한 숫자/영문표
  if (dgRatio > 0.40 && krRatio < 0.35) return true; // jp: 숫자 위주 표
  return false;
}

// jp: ===== 3. 청크 분할 (주석 영역 우선 + 충분한 청크) =====
export function splitIntoChunks(text: string): string[] {
  if (!text || text.length < 100) return [];

  // jp: 전체 텍스트를 대상 (주석영역 탐지는 회사마다 불안정해서 끔)
  // jp: 노이즈는 숫자필터 + 중복제거로 처리. 서술 주석은 의미검색이 알아서 찾음
  // jp: findNotesStart는 유지하되 미사용 (XBRL 도입 후 정교화 가능)
  const target = text;
  const len = target.length;

  const chunks: string[] = [];
  const seen = new Set<string>();  // jp: 중복 방지 (같은 청크 재저장 차단)
  let pos = 0;

  while (pos < len && chunks.length < MAX_CHUNKS) {
    let end = Math.min(pos + CHUNK_SIZE, len);
    // jp: 문장 경계에서 자르기 (마지막 청크 제외)
    if (end < len) {
      const slice = target.slice(pos, end);
      const lastDot = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('다. '));
      if (lastDot > CHUNK_SIZE * 0.5) end = pos + lastDot + 1;
    }

    const body = target.slice(pos, end).trim();
    // jp: 숫자 위주 청크(재무수치 표)는 스킵 - XBRL이 숫자 담당, RAG는 서술만
    // jp: 중복 청크도 스킵 (같은 내용 재저장 방지)
    if (body.length > 50 && !isMostlyNumeric(body) && !seen.has(body)) {
      chunks.push(body);
      seen.add(body);
    }

    // jp: pos 전진 - 반드시 앞으로 나아가게 (무한루프/중복 방지)
    const nextPos = end - CHUNK_OVERLAP;
    if (nextPos <= pos) {
      // jp: 전진 못 하면 (겹침이 청크보다 크거나 끝 도달) → 강제 전진
      pos = end > pos ? end : pos + CHUNK_SIZE;
    } else {
      pos = nextPos;
    }
    // jp: 끝에 도달했으면 종료 (마지막 청크까지 처리 후)
    if (end >= len) break;
  }
  return chunks;
}

// jp: ===== 4. Voyage 임베딩 (배치별 부분 성공 지원) =====
// jp: v2: 배치 단위로 결과 반환 (일부 실패해도 성공분은 저장 가능하게)
export async function embedTexts(texts: string[], inputType: 'document' | 'query' = 'document'): Promise<number[][]> {
  const key = ENV.VOYAGE?.API_KEY || process.env.VOYAGE_API_KEY;
  if (!key) throw new Error('VOYAGE_API_KEY 없음');
  if (texts.length === 0) return [];

  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += VOYAGE_BATCH) {
    const batch = texts.slice(i, i + VOYAGE_BATCH);
    let attempt = 0;
    while (true) {
      try {
        const res = await axios.post(
          VOYAGE_URL,
          { input: batch, model: VOYAGE_MODEL, input_type: inputType },
          { headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, timeout: 60000 }
        );
        const data = res.data as { data: { embedding: number[] }[] };
        for (const d of data.data) out.push(d.embedding);
        break;
      } catch (err: any) {
        const status = err?.response?.status;
        if (status === 429 && attempt < MAX_RETRY) {
          attempt++;
          const wait = BATCH_DELAY_MS * Math.pow(2, attempt);
          console.warn(`[NotesEmbed] 429 - ${wait}ms 후 재시도 (${attempt}/${MAX_RETRY})`);
          await sleep(wait);
          continue;
        }
        throw err;
      }
    }
    if (i + VOYAGE_BATCH < texts.length) await sleep(BATCH_DELAY_MS);
  }
  return out;
}

// jp: v2: 청크를 임베딩하되, 배치 실패 시 성공분까지만 반환 (부분 성공)
async function embedTextsPartial(
  texts: string[]
): Promise<{ embeddings: number[][]; failedFrom: number }> {
  const key = ENV.VOYAGE?.API_KEY || process.env.VOYAGE_API_KEY;
  if (!key) throw new Error('VOYAGE_API_KEY 없음');
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += VOYAGE_BATCH) {
    const batch = texts.slice(i, i + VOYAGE_BATCH);
    let attempt = 0;
    let batchOk = false;
    while (!batchOk) {
      try {
        const res = await axios.post(
          VOYAGE_URL,
          { input: batch, model: VOYAGE_MODEL, input_type: 'document' },
          { headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, timeout: 60000 }
        );
        const data = res.data as { data: { embedding: number[] }[] };
        for (const d of data.data) out.push(d.embedding);
        batchOk = true;
      } catch (err: any) {
        const status = err?.response?.status;
        if (status === 429 && attempt < MAX_RETRY) {
          attempt++;
          await sleep(BATCH_DELAY_MS * Math.pow(2, attempt));
          continue;
        }
        // jp: 재시도 소진/다른 에러 → 여기까지 성공분 반환, 실패 지점 기록
        console.warn(`[NotesEmbed] 배치 ${i} 실패 (성공 ${out.length}개까지 저장):`, err instanceof Error ? err.message : err);
        return { embeddings: out, failedFrom: out.length };
      }
    }
    if (i + VOYAGE_BATCH < texts.length) await sleep(BATCH_DELAY_MS);
  }
  return { embeddings: out, failedFrom: -1 };  // jp: -1 = 전부 성공
}

// jp: ===== 5. 보고서 시점 파싱 =====
export function parseReportPeriod(reportName: string): { type: string; period: string } | null {
  if (!reportName) return null;
  const dateM = reportName.match(/\((\d{4})\.(\d{2})\)/);
  const year = dateM ? dateM[1] : '';
  const month = dateM ? dateM[2] : '';
  if (/사업보고서/.test(reportName)) return { type: 'annual', period: year ? `${year}FY` : 'FY' };
  if (/반기보고서/.test(reportName)) return { type: 'half', period: year ? `${year}H1` : 'H1' };
  if (/분기보고서/.test(reportName)) {
    let q = month === '03' ? 'Q1' : month === '09' ? 'Q3' : 'Q';
    return { type: 'quarterly', period: year ? `${year}${q}` : q };
  }
  return null;
}

export function isPeriodicReport(reportName: string): boolean {
  if (!reportName) return false;
  return /사업보고서|반기보고서|분기보고서/.test(reportName);
}

// jp: ===== 6. 상태 추적 헬퍼 (notes_embed_status 테이블) =====
type EmbedStatus = 'pending' | 'done' | 'partial' | 'failed';

async function setStatus(
  receiptNo: string, corpCode: string, reportName: string,
  status: EmbedStatus, savedChunks: number, totalChunks: number, errorMsg?: string
): Promise<void> {
  try {
    await query(
      `INSERT INTO notes_embed_status
        (receipt_no, corp_code, report_name, status, saved_chunks, total_chunks, error_msg, updated_at, retry_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7, now(), 0)
       ON CONFLICT (receipt_no) DO UPDATE SET
         status = EXCLUDED.status,
         saved_chunks = EXCLUDED.saved_chunks,
         total_chunks = EXCLUDED.total_chunks,
         error_msg = EXCLUDED.error_msg,
         updated_at = now(),
         retry_count = notes_embed_status.retry_count + 1`,
      [receiptNo, corpCode, reportName, status, savedChunks, totalChunks, errorMsg || null]
    );
  } catch (err) {
    console.warn('[NotesEmbed] 상태 기록 실패(무시):', err instanceof Error ? err.message : err);
  }
}

// jp: ===== 7. 메인 파이프라인 (부분성공 + 상태기록 + 재개) =====
export interface EmbedTarget {
  corpCode: string;
  stockCode?: string;
  stockName?: string;
  receiptNo: string;
  reportName: string;
  disclosedAt?: string | Date;
}

export async function embedAndStoreNotes(t: EmbedTarget): Promise<{ ok: boolean; chunks: number; skipped?: string }> {
  // jp: 정기보고서만
  if (!isPeriodicReport(t.reportName)) {
    return { ok: false, chunks: 0, skipped: 'not-periodic' };
  }

  // jp: 실제 임베딩 개수를 DB에서 직접 확인 (상태 플래그만 믿지 않음)
  // jp: pre-split 임베딩 전체 삭제 후 status=done으로 남은 공시 방어
  let alreadyDone = 0;
  try {
    const existing = await query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM disclosure_notes_vec WHERE receipt_no = $1`,
      [t.receiptNo]
    );
    alreadyDone = existing[0] ? parseInt(existing[0].cnt, 10) : 0;

    // jp: 상태 테이블에서 done 확인 — 단, 실제 임베딩이 존재할 때만 스킵
    // jp: done인데 실제 임베딩이 0개 = pre-split 삭제된 공시 → 재임베딩 필수
    const st = await query<{ status: string; total_chunks: number }>(
      `SELECT status, total_chunks FROM notes_embed_status WHERE receipt_no = $1`,
      [t.receiptNo]
    );
    if (st[0] && st[0].status === 'done' && alreadyDone > 0) {
      // jp: 추가로 테이블 존재 여부도 확인 (표 없으면 embedAndStoreTables만 재실행)
      const tableCount = await query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM disclosure_notes_tables WHERE receipt_no = $1`,
        [t.receiptNo]
      );
      const tablesDone = tableCount[0] ? parseInt(tableCount[0].cnt, 10) : 0;
      if (tablesDone === 0) {
        // jp: 서술 임베딩은 있는데 표만 없음 → 표만 재처리 후 done 유지
        await embedAndStoreTables(t).catch((e) =>
          console.error('[NotesEmbed] 표 재처리 실패:', e instanceof Error ? e.message : e)
        );
      }
      return { ok: true, chunks: 0, skipped: 'already-embedded' };
    }
    // jp: done인데 임베딩이 0개 = 재임베딩 필요 (플래그 무시하고 진행)
    // jp: partial/failed/pending이면 아래에서 alreadyDone(=0)부터 재개
  } catch { /* 테이블 없으면 아래서 처리 */ }

  await setStatus(t.receiptNo, t.corpCode, t.reportName, 'pending', alreadyDone, 0);

  // jp: 원문 → 청크
  const text = await fetchMainDocumentText(t.receiptNo);
  if (!text) {
    await setStatus(t.receiptNo, t.corpCode, t.reportName, 'failed', alreadyDone, 0, 'no-document');
    return { ok: false, chunks: 0, skipped: 'no-document' };
  }

  const allChunks = splitIntoChunks(text);
  if (allChunks.length === 0) {
    await setStatus(t.receiptNo, t.corpCode, t.reportName, 'failed', alreadyDone, 0, 'no-chunks');
    return { ok: false, chunks: 0, skipped: 'no-chunks' };
  }

  // jp: 재개 - 이미 저장된 청크부터 이어서 임베딩
  // jp: alreadyDone > allChunks.length = 청크 분할 방식이 바뀐 케이스(구형 pre-split 잔존)
  // jp: 이 경우 ON CONFLICT DO NOTHING으로 기존 청크는 무시, 새 청크만 추가
  const effectiveAlreadyDone = alreadyDone <= allChunks.length ? alreadyDone : 0;
  const chunksToEmbed = allChunks.slice(effectiveAlreadyDone);
  if (chunksToEmbed.length === 0) {
    await setStatus(t.receiptNo, t.corpCode, t.reportName, 'done', effectiveAlreadyDone, allChunks.length);
    return { ok: true, chunks: 0, skipped: 'already-embedded' };
  }

  // jp: 임베딩 (부분 성공 지원)
  let embeddings: number[][];
  let failedFrom: number;
  try {
    const r = await embedTextsPartial(chunksToEmbed);
    embeddings = r.embeddings;
    failedFrom = r.failedFrom;
  } catch (err) {
    await setStatus(t.receiptNo, t.corpCode, t.reportName, 'failed', alreadyDone, allChunks.length,
      err instanceof Error ? err.message : 'embed-failed');
    return { ok: false, chunks: 0, skipped: 'embed-failed' };
  }

  if (embeddings.length === 0) {
    await setStatus(t.receiptNo, t.corpCode, t.reportName, 'failed', alreadyDone, allChunks.length, 'embed-empty');
    return { ok: false, chunks: 0, skipped: 'embed-failed' };
  }

  // jp: 시점 메타
  const periodInfo = parseReportPeriod(t.reportName);
  const reportPeriod = periodInfo?.period || null;

  // jp: 저장 (성공한 임베딩만, chunk_index는 effectiveAlreadyDone부터)
  let saved = 0;
  for (let i = 0; i < embeddings.length; i++) {
    const chunkIdx = effectiveAlreadyDone + i;
    const vec = '[' + embeddings[i].join(',') + ']';
    try {
      await query(
        `INSERT INTO disclosure_notes_vec
          (corp_code, stock_code, stock_name, receipt_no, report_name, report_period, disclosed_at, chunk_index, chunk_text, embedding)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::vector)
         ON CONFLICT (receipt_no, chunk_index) DO NOTHING`,
        [t.corpCode, t.stockCode || null, t.stockName || null, t.receiptNo,
         t.reportName, reportPeriod, t.disclosedAt || null, chunkIdx, chunksToEmbed[i], vec]
      );
      saved++;
    } catch (err) {
      console.error(`[NotesEmbed] 저장 실패 chunk ${chunkIdx}:`, err instanceof Error ? err.message : err);
    }
  }

  const totalSaved = effectiveAlreadyDone + saved;
  // jp: 전부 성공 = done, 일부만 = partial (나중에 재처리)
  const finalStatus: EmbedStatus = (failedFrom === -1 && totalSaved >= allChunks.length) ? 'done' : 'partial';
  await setStatus(t.receiptNo, t.corpCode, t.reportName, finalStatus, totalSaved, allChunks.length,
    finalStatus === 'partial' ? 'partial-embed' : undefined);

  if (finalStatus === 'done') {
    console.log(`[NotesEmbed] ${t.stockName || t.corpCode} (${t.reportName}) → ${saved}청크 저장 완료 (총 ${totalSaved}개)`);
  } else {
    console.warn(`[NotesEmbed] ${t.stockName || t.corpCode} (${t.reportName}) → partial: ${totalSaved}/${allChunks.length}청크 저장`);
  }
  // jp: 표/서술 분리 - 서술 임베딩 후 표도 별도 저장 (실패해도 서술 done은 유지)
  await embedAndStoreTables(t).catch((e) =>
    console.error('[NotesEmbed] 표 처리 실패:', e instanceof Error ? e.message : e)
  );
  return { ok: true, chunks: saved };
}

// jp: ===== 표 저장 (표/서술 분리 - 표는 마크다운 보존 + 항목명 키워드검색) =====
// jp: 임베딩 안 함 (voyage 비용 0). 항목명은 정확한 명사라 키워드 매칭으로 충분.
function isUsefulTable(md: string): boolean {
  const lines = md.split('\n').filter((l) => l.startsWith('|') && !l.includes('---'));
  if (lines.length < 4) return false;                          // jp: 4행+ (헤더+데이터3행+)
  if ((md.match(/-{5,}/g) || []).length >= 2) return false;    // jp: 목차(점선) 제외
  if ((md.match(/\d{1,3}(,\d{3})+/g) || []).length < 3) return false; // jp: 천단위숫자 3개+ = 데이터표
  if ((md.match(/[가-힣]{2,}/g) || []).length < 3) return false;       // jp: 한글 항목명 3개+
  return true;
}

// jp: 표에서 항목명(한글)만 추출 → caption (키워드 검색용, 숫자 노이즈 제거)
function extractTableCaption(md: string): string {
  const cells: string[] = [];
  for (const line of md.split('\n')) {
    if (!line.startsWith('|') || line.includes('---')) continue;
    for (const cell of line.split('|')) {
      const t = cell.trim();
      if (/[가-힣]{2,}/.test(t)) cells.push(t);
    }
  }
  return [...new Set(cells)].join(' ').slice(0, 1000);
}

// jp: 표 저장 (임베딩 없이 마크다운 + caption만 - 키워드 검색)
export async function embedAndStoreTables(t: EmbedTarget): Promise<number> {
  try {
    const allTables = await fetchDocumentTables(t.receiptNo);
    const useful = allTables.filter(isUsefulTable);
    if (useful.length === 0) return 0;

    const periodInfo = parseReportPeriod(t.reportName);
    const reportPeriod = periodInfo?.period || null;

    let saved = 0;
    for (let i = 0; i < useful.length; i++) {
      const caption = extractTableCaption(useful[i]);
      try {
        await query(
          `INSERT INTO disclosure_notes_tables
            (corp_code, stock_code, stock_name, receipt_no, report_name, report_period, disclosed_at, table_index, table_md, table_caption, embedding)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NULL)
           ON CONFLICT (receipt_no, table_index) DO NOTHING`,
          [t.corpCode, t.stockCode || null, t.stockName || null, t.receiptNo,
           t.reportName, reportPeriod, t.disclosedAt || null, i, useful[i], caption]
        );
        saved++;
      } catch (err) {
        console.error(`[NotesTable] 저장 실패 표 ${i}:`, err instanceof Error ? err.message : err);
      }
    }
    console.log(`[NotesTable] ${t.stockName || t.corpCode} → ${saved}개 표 저장 (전체 ${allTables.length}, 유효 ${useful.length})`);
    return saved;
  } catch (err) {
    console.error('[NotesTable] 표 처리 실패:', err instanceof Error ? err.message : err);
    return 0;
  }
}

// jp: ===== 8. 실패/부분/ghost-done 자동 재처리 (스케줄러가 주기적으로 호출) =====
// jp: "ghost-done" = status=done인데 실제 disclosure_notes_vec에 임베딩이 없는 공시
// jp: pre-split 임베딩 전체 삭제 후 발생. 이 함수에서 같이 잡아서 재임베딩.
export async function retryFailedEmbeddings(limit = 5): Promise<{ processed: number; recovered: number }> {
  let processed = 0, recovered = 0;
  try {
    // jp: [1] failed/partial/pending - 기존 재시도 대상 (재시도 10회 미만, 5분 이상 지난 것)
    const failedRows = await query<{
      receipt_no: string; corp_code: string; report_name: string;
      stock_code: string | null; stock_name: string | null; reason: string;
    }>(
      `SELECT s.receipt_no, s.corp_code, s.report_name,
              d.stock_code, d.stock_name,
              'status:' || s.status AS reason
       FROM notes_embed_status s
       LEFT JOIN LATERAL (
         SELECT stock_code, stock_name FROM disclosures
         WHERE receipt_no = s.receipt_no LIMIT 1
       ) d ON true
       WHERE s.status IN ('failed','partial','pending')
         AND s.retry_count < 10
         AND s.updated_at < now() - interval '5 minutes'
       ORDER BY s.updated_at ASC
       LIMIT $1`,
      [limit]
    );

    // jp: [2] ghost-done - status=done인데 실제 임베딩이 0개인 공시
    // jp: 남은 슬롯만큼만 조회 (전체 limit 초과 방지)
    const ghostLimit = Math.max(0, limit - failedRows.length);
    const ghostRows = ghostLimit > 0
      ? await query<{
          receipt_no: string; corp_code: string; report_name: string;
          stock_code: string | null; stock_name: string | null; reason: string;
        }>(
          `SELECT s.receipt_no, s.corp_code, s.report_name,
                  d.stock_code, d.stock_name,
                  'ghost-done' AS reason
           FROM notes_embed_status s
           LEFT JOIN LATERAL (
             SELECT stock_code, stock_name FROM disclosures
             WHERE receipt_no = s.receipt_no LIMIT 1
           ) d ON true
           WHERE s.status = 'done'
             AND NOT EXISTS (
               SELECT 1 FROM disclosure_notes_vec v
               WHERE v.receipt_no = s.receipt_no LIMIT 1
             )
           ORDER BY s.updated_at ASC
           LIMIT $1`,
          [ghostLimit]
        )
      : [];

    const rows = [...failedRows, ...ghostRows];

    for (const r of rows) {
      processed++;
      try {
        // jp: ghost-done은 상태를 먼저 pending으로 리셋 (embedAndStoreNotes의 done 스킵 우회)
        if (r.reason === 'ghost-done') {
          await query(
            `UPDATE notes_embed_status
             SET status = 'pending', updated_at = now(), error_msg = 'ghost-done-reset'
             WHERE receipt_no = $1`,
            [r.receipt_no]
          );
        }
        const res = await embedAndStoreNotes({
          corpCode: r.corp_code,
          stockCode: r.stock_code || undefined,
          stockName: r.stock_name || undefined,
          receiptNo: r.receipt_no,
          reportName: r.report_name,
        });
        if (res.ok && res.chunks > 0) recovered++;
      } catch (itemErr) {
        // jp: 개별 공시 실패는 로그만 찍고 계속 (다른 공시 재처리 막지 않음)
        console.warn(
          `[NotesEmbedRetry] ${r.receipt_no} 재처리 실패 (${r.reason}):`,
          itemErr instanceof Error ? itemErr.message : itemErr
        );
      }
    }
  } catch (err) {
    console.warn('[NotesEmbedRetry] 재처리 쿼리 실패:', err instanceof Error ? err.message : err);
  }
  if (processed > 0) {
    console.log(`[NotesEmbedRetry] 재처리 ${processed}건 시도, ${recovered}건 복구`);
  }
  return { processed, recovered };
}

// jp: ===== 9. 의미 검색 =====
export interface NotesSearchResult {
  stockCode: string | null; stockName: string | null; receiptNo: string;
  reportName: string | null; reportPeriod: string | null;
  chunkIndex: number; chunkText: string; similarity: number;
}
export interface NotesSearchOptions {
  stockCode?: string; corpCode?: string; reportPeriod?: string; limit?: number;
}

// jp: 하이브리드 검색용 - 검색어에서 핵심 명사 추출 (조사/일반어 제거)
function extractSearchKeywords(query: string): string[] {
  const STOP = new Set([
    '그리고','또는','관한','대한','등의','및','거래일','관련','내용','경우',
    '있는','없는','위한','따른','통한','부터','까지','에서','으로',
  ]);
  return (query || '')
    .split(/\s+/)
    .map((w) => w.replace(/[은는이가을를의에과와도로]$/, '').trim())
    .filter((w) => w.length >= 2 && !STOP.has(w));
}

export async function searchNotes(queryStr: string, options: NotesSearchOptions = {}): Promise<NotesSearchResult[]> {
  const q = (queryStr || '').trim();
  if (!q) return [];
  let qvec: number[];
  try {
    const [vec] = await embedTexts([q], 'query');
    qvec = vec;
  } catch (err) {
    console.error('[NotesSearch] 질문 임베딩 실패:', err instanceof Error ? err.message : err);
    return [];
  }
  if (!qvec || qvec.length === 0) return [];

  const vecLit = '[' + qvec.join(',') + ']';
  const limit = Math.min(options.limit || 5, 30);
  const conds: string[] = [];
  const params: any[] = [vecLit];
  let pi = 2;
  if (options.stockCode) { conds.push(`stock_code = $${pi++}`); params.push(options.stockCode); }
  if (options.corpCode) { conds.push(`corp_code = $${pi++}`); params.push(options.corpCode); }
  if (options.reportPeriod) { conds.push(`report_period = $${pi++}`); params.push(options.reportPeriod); }
  const whereClause = conds.length > 0 ? 'WHERE ' + conds.join(' AND ') : '';
    // jp: 하이브리드 - 후보를 넓게 가져와 키워드 재순위 (최종은 limit으로 자름)
    const candidateLimit = Math.max(limit * 8, 40);
    params.push(candidateLimit);
  const limitIdx = pi;

  try {
    const rows = await query<{
      stock_code: string | null; stock_name: string | null; receipt_no: string;
      report_name: string | null; report_period: string | null;
      chunk_index: number; chunk_text: string; dist: number;
    }>(
      `SELECT stock_code, stock_name, receipt_no, report_name, report_period,
              chunk_index, chunk_text, embedding <=> $1::vector AS dist
       FROM disclosure_notes_vec ${whereClause}
       ORDER BY embedding <=> $1::vector LIMIT $${limitIdx}`,
      params
    );
    // jp: 디랭킹 - 숫자 비율 높은 청크는 점수 페널티 (경계선 숫자표를 뒤로)
    // jp: 필터를 통과한 애매한 숫자청크(#20 같은)의 검색 순위를 낮춤
    // jp: 하이브리드 - 검색어 핵심 단어 추출 + 변별력 단어(가장 긴 것)
    const keywords = extractSearchKeywords(q);
    const mainKw = keywords.length > 0 ? [...keywords].sort((a, b) => b.length - a.length)[0] : null;
    const scored = rows.map((r) => {
      const txt = r.chunk_text || '';
      const total = txt.length || 1;
      const digits = (txt.match(/[0-9]/g) || []).length;
      const korean = (txt.match(/[가-힣]/g) || []).length;
      const dgRatio = digits / total;
      const krRatio = korean / total;
      let sim = Math.max(0, 1 - Number(r.dist));
      // jp: 숫자 35%+ 또는 한글 30%미만이면 페널티 (서술 우선)
      if (dgRatio > 0.35 || krRatio < 0.30) sim *= 0.85;
      // jp: 하이브리드 키워드 매칭 - 변별력 단어 없으면 제외, 매칭 많을수록 가산점
      const mc = keywords.filter((k) => txt.includes(k)).length;
      if (mainKw && !txt.includes(mainKw)) sim = 0;
      else sim += 0.1 * mc;
      return {
        stockCode: r.stock_code, stockName: r.stock_name, receiptNo: r.receipt_no,
        reportName: r.report_name, reportPeriod: r.report_period,
        chunkIndex: r.chunk_index, chunkText: r.chunk_text,
        similarity: sim,
      };
    });
    // jp: 페널티 반영 후 재정렬
    scored.sort((a, b) => b.similarity - a.similarity);
    // jp: 유사도 임계값 - 관련 없는 결과 제외 (없는 내용 억지로 안 보여줌)
    const MIN_SIM = 0.40;
    const filtered = scored.filter((s) => s.similarity >= MIN_SIM);
    return filtered.slice(0, limit);
  } catch (err) {
    console.error('[NotesSearch] 검색 실패:', err instanceof Error ? err.message : err);
    return [];
  }
}


// jp: ===== 표 검색 (caption 키워드 매칭, 임베딩 없이 - voyage 비용 0) =====
export interface TableSearchResult {
  stockCode: string | null;
  stockName: string | null;
  receiptNo: string;
  reportName: string | null;
  reportPeriod: string | null;
  tableIndex: number;
  tableMd: string;
  matchCount: number;
}

export async function searchTables(queryStr: string, options: NotesSearchOptions = {}): Promise<TableSearchResult[]> {
  const q = (queryStr || '').trim();
  if (!q) return [];
  const keywords = extractSearchKeywords(q);
  if (keywords.length === 0) return [];
  const mainKw = [...keywords].sort((a, b) => b.length - a.length)[0];

  const limit = Math.min(options.limit || 3, 10);
  const conds: string[] = [];
  const params: any[] = [];
  let pi = 1;
  // jp: 변별력 단어(가장 긴 핵심어)가 caption에 있는 표만 (정확도)
  conds.push(`table_caption LIKE $${pi++}`);
  params.push('%' + mainKw + '%');
  if (options.stockCode) { conds.push(`stock_code = $${pi++}`); params.push(options.stockCode); }
  if (options.corpCode) { conds.push(`corp_code = $${pi++}`); params.push(options.corpCode); }
  if (options.reportPeriod) { conds.push(`report_period = $${pi++}`); params.push(options.reportPeriod); }
  const whereClause = 'WHERE ' + conds.join(' AND ');
  params.push(limit * 8);  // jp: 후보 넓게

  try {
    const rows = await query<{
      stock_code: string | null; stock_name: string | null; receipt_no: string;
      report_name: string | null; report_period: string | null;
      table_index: number; table_md: string; table_caption: string;
    }>(
      `SELECT stock_code, stock_name, receipt_no, report_name, report_period,
              table_index, table_md, table_caption
       FROM disclosure_notes_tables ${whereClause}
       ORDER BY table_index LIMIT $${pi}`,
      params
    );
    // jp: 키워드 매칭 개수로 점수 → 정렬 (많이 매칭된 표가 위로)
    const scored = rows.map((r) => {
      const cap = r.table_caption || '';
      const mc = keywords.filter((k) => cap.includes(k)).length;
      // jp: 오매칭 방지 - 변별력단어가 표 헤더(첫2행)에 있거나 caption에 2번+ 나와야 진짜 주제 표
      const md = r.table_md || '';
      const headerPart = md.split(String.fromCharCode(10)).slice(0, 3).join(' ');
      const mainInHeader = mainKw ? headerPart.includes(mainKw) : true;
      const mainOccur = mainKw ? (cap.split(mainKw).length - 1) : 0;
      // jp: 헤더에 없고 1번만 언급 = 형식적 언급(변동사유 목록 등) → 제외
      const isStrong = mainInHeader || mainOccur >= 2;
      const finalScore = isStrong ? mc : -1;
      return {
        stockCode: r.stock_code, stockName: r.stock_name, receiptNo: r.receipt_no,
        reportName: r.report_name, reportPeriod: r.report_period,
        tableIndex: r.table_index, tableMd: cleanMarkdownTable(r.table_md), matchCount: finalScore,
      };
    });
    scored.sort((a, b) => b.matchCount - a.matchCount);
    // jp: 중복 제거 (table_md 앞부분 같으면 같은 표로 간주)
    const seen = new Set<string>();
    const unique = scored.filter((s) => {
      const sig = s.tableMd.slice(0, 100);
      if (seen.has(sig)) return false;
      seen.add(sig);
      return true;
    });
    // jp: 약한 매칭(형식적 언급, finalScore<0) 제외 후 상위 limit개
    return unique.filter((s) => s.matchCount >= 0).slice(0, limit);
  } catch (err) {
    console.error('[TableSearch] 검색 실패:', err instanceof Error ? err.message : err);
    return [];
  }
}
export async function listEmbeddedStocks(): Promise<{ stockCode: string | null; stockName: string | null; reportPeriod: string | null; chunks: number }[]> {
  try {
    const rows = await query<{ stock_code: string | null; stock_name: string | null; report_period: string | null; chunks: string }>(
      `SELECT stock_code, stock_name, report_period, COUNT(*) AS chunks
       FROM disclosure_notes_vec
       GROUP BY stock_code, stock_name, report_period
       ORDER BY MAX(created_at) DESC`
    );
    return rows.map((r) => ({
      stockCode: r.stock_code, stockName: r.stock_name,
      reportPeriod: r.report_period, chunks: parseInt(r.chunks, 10),
    }));
  } catch { return []; }
}

// jp: ===== 유틸 =====
function decodeKorean(buf: Buffer): string {
  const utf8 = buf.toString('utf-8');
  const broken = (utf8.match(/\uFFFD/g) || []).length;
  if (broken > 10) {
    try {
      const iconv = require('iconv-lite');
      return iconv.decode(buf, 'euc-kr');
    } catch { return utf8; }
  }
  return utf8;
}


// jp: ===== 표/서술 분리 - DART XML의 <TABLE>을 마크다운으로 변환 =====
// jp: 표는 구조보존(마크다운), 서술은 RAG임베딩으로 분리하기 위함

// jp: 빈 열 정리 - 완전히 빈 열(모든 행이 빈칸) 제거해서 표 가독성 향상
export function cleanMarkdownTable(md: string): string {
  const lines = md.split('\n');
  const rows = lines
    .filter((l) => l.startsWith('|') && !/^\|[\s\-|]+\|$/.test(l))
    .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
  if (rows.length === 0) return md;

  const colCount = Math.max(...rows.map((r) => r.length));
  const colEmpty: boolean[] = [];
  for (let c = 0; c < colCount; c++) {
    colEmpty[c] = rows.every((r) => !(r[c] || '').trim());
  }
  const cleaned = rows.map((r) => r.filter((_, c) => !colEmpty[c]));
  const newColCount = Math.max(...cleaned.map((r) => r.length));
  if (newColCount === 0) return md;

  const out: string[] = [];
  cleaned.forEach((r, i) => {
    const padded = [...r];
    while (padded.length < newColCount) padded.push('');
    out.push('| ' + padded.join(' | ') + ' |');
    if (i === 0) out.push('|' + ' --- |'.repeat(newColCount));
  });
  return out.join('\n');
}
export function tablesToMarkdown(raw: string): string[] {
  const tables: string[] = [];
  const tableRe = /<TABLE[^>]*>([\s\S]*?)<\/TABLE>/gi;
  let m: RegExpExecArray | null;
  while ((m = tableRe.exec(raw)) !== null) {
    const tableContent = m[1];
    const rows: string[][] = [];
    const trRe = /<TR[^>]*>([\s\S]*?)<\/TR>/gi;
    let tr: RegExpExecArray | null;
    while ((tr = trRe.exec(tableContent)) !== null) {
      const cells: string[] = [];
      // jp: DART 셀 타입 = TD(일반)/TE(숫자값)/TH(헤더)/TU(단위)
      const cellRe = /<(?:TD|TE|TH|TU)[^>]*>([\s\S]*?)<\/(?:TD|TE|TH|TU)>/gi;
      let cell: RegExpExecArray | null;
      while ((cell = cellRe.exec(tr[1])) !== null) {
        const text = cell[1]
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/gi, ' ')
          .replace(/&cr;/gi, ' ')
          .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&amp;/gi, '&')
          .replace(/\s+/g, ' ')
          .trim();
        cells.push(text);
      }
      if (cells.length > 0) rows.push(cells);
    }
    if (rows.length > 0) {
      const colCount = Math.max(...rows.map((r) => r.length));
      const md: string[] = [];
      rows.forEach((r, i) => {
        const padded = [...r];
        while (padded.length < colCount) padded.push('');
        md.push('| ' + padded.join(' | ') + ' |');
        if (i === 0) md.push('|' + ' --- |'.repeat(colCount));
      });
      tables.push(md.join('\n'));
    }
  }
  return tables;
}

// jp: raw에서 <TABLE> 제거 (서술만 남김 - 임베딩용)
export function removeTables(raw: string): string {
  return raw.replace(/<TABLE[^>]*>[\s\S]*?<\/TABLE>/gi, ' ');
}
function stripMarkup(raw: string): string {
  return raw
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// jp: [fallback] 종목의 가장 최근 임베딩된 receiptNo 조회 (검색 0건일 때 DART 안내용)
export async function getLatestReceiptForStock(opts: {
  stockCode?: string;
  corpCode?: string;
}): Promise<string | null> {
  const { stockCode, corpCode } = opts;
  if (!stockCode && !corpCode) return null;
  try {
    const conds: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (stockCode) { conds.push('stock_code = $' + i); vals.push(stockCode); i++; }
    if (corpCode) { conds.push('corp_code = $' + i); vals.push(corpCode); i++; }
    const where = conds.join(' OR ');
    const sql =
      'SELECT receipt_no FROM disclosure_notes_vec WHERE ' + where +
      ' ORDER BY disclosed_at DESC NULLS LAST, receipt_no DESC LIMIT 1';
    const rows = await query<{ receipt_no: string }>(sql, vals);
    return rows.length > 0 ? rows[0].receipt_no : null;
  } catch (err) {
    console.warn('[getLatestReceiptForStock] 실패:', err instanceof Error ? err.message : err);
    return null;
  }
}
