// ============================================================
// jp: 주석 검색 AI 답변 생성 V2 (RAG의 G)
// jp: 위치: backend/src/services/ai/notesAnswerV2.service.ts
// jp: V2 개선:
// jp:   1. top3 제한 제거 → 5~8개 근거 사용
// jp:   2. 표(table) 청크도 컨텍스트에 포함 (금액/계정 질문 대응)
// jp:   3. 근거 출처 강제 — 주석 제목/표 제목/연도/receiptNo 메타 동봉
// jp:   4. hallucination 방지 — "제공된 근거만 사용" 강하게 명시
// jp:   5. 근거 약하면 "명확한 근거를 찾지 못했습니다" 답변
// ============================================================
import { ENV } from '../../config/env';
import type { NotesV2Chunk } from './notesSearchV2.service';
import { getPrompt } from './promptStore.service';

const MAX_CONTEXT_CHUNKS = 8;     // jp: V2 — top3 → 최대 8
const PROSE_CHAR_LIMIT = 1800;    // jp: 산문 청크 1개당 최대 글자
const TABLE_CHAR_LIMIT = 1200;    // jp: 표 1개당 최대 글자
const ANSWER_MAX_TOKENS = 900;
// jp: 이 점수 미만이면 "근거 약함"으로 보고 답변 생성 자체를 스킵
const WEAK_EVIDENCE_THRESHOLD = 0.25;

export interface NotesAnswerV2Result {
  answer: string;
  usedChunks: number;
  model: string;
  evidence: Array<{
    kind: 'prose' | 'table';
    sectionTitle: string;
    reportName: string | null;
    reportPeriod: string | null;
    receiptNo: string;
  }>;
  weak: boolean;  // jp: 근거 약함 여부
}

const SYSTEM_PROMPT_FALLBACK = `당신은 어려운 기업 공시 주석을 친구에게 이야기하듯 쉽게 풀어주는 사람입니다.

[절대 규칙 — 환각 방지]
1. 아래 제공된 "주석 근거"에 실제로 적힌 내용만 사용하세요. 근거에 없는 숫자·사실·추정은 절대 말하지 마세요.
2. 근거에서 질문에 답할 내용을 찾을 수 없으면, 지어내지 말고 정확히 이렇게만 답하세요: "공시 주석에서 명확한 근거를 찾지 못했습니다."
3. 추측·일반론·교과서적 설명으로 빈자리를 채우지 마세요.

[답변 방식]
4. 쉬운 말로, 핵심을 먼저 한 줄로 요약한 뒤 필요하면 부연하세요.
5. 숫자(금액·비율·날짜)는 근거 그대로 정확히 전달하세요. 반올림·각색 금지.
6. "~예요", "~돼요", "~거예요"처럼 부드럽게 설명하세요.
7. 어려운 회계 용어가 나오면 괄호로 짧게 풀이를 덧붙이세요.

[출력 형식]
- 마크다운 기호(#, **, ---, > 등)를 쓰지 말고 일반 문장으로 작성하세요.
- 답변 맨 끝에 "📎 근거: " 형식으로 사용한 주석/표 제목과 기준 보고서를 1줄로 밝히세요.`;

// jp: 근거 청크 → 프롬프트 컨텍스트 (출처 메타 포함)
function buildContext(chunks: NotesV2Chunk[]): string {
  return chunks
    .slice(0, MAX_CONTEXT_CHUNKS)
    .map((c, i) => {
      const tag = c.kind === 'table' ? '표' : '주석';
      const limit = c.kind === 'table' ? TABLE_CHAR_LIMIT : PROSE_CHAR_LIMIT;
      const body = (c.text || '').slice(0, limit).trim();
      const meta = `[${tag} 근거 ${i + 1}] 섹션="${c.sectionTitle}" / 보고서=${c.reportName || '미상'}${c.reportPeriod ? ` (${c.reportPeriod})` : ''}`;
      return `${meta}\n${body}`;
    })
    .join('\n\n---\n\n');
}

function stripMarkdown(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      let s = line;
      s = s.replace(/^\s*#{1,6}\s*/, '');
      s = s.replace(/^\s*>\s?/, '');
      if (/^\s*([-*_])\1{2,}\s*$/.test(s)) return '';
      s = s.replace(/\*\*([^*]+)\*\*/g, '$1');
      s = s.replace(/\*([^*]+)\*/g, '$1');
      s = s.replace(/\*\*/g, '').replace(/(^|\s)\*(\S)/g, '$1$2');
      s = s.replace(/`([^`]+)`/g, '$1');
      return s;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function generateNotesAnswerV2(
  questionStr: string,
  chunks: NotesV2Chunk[],
): Promise<NotesAnswerV2Result | null> {
  if (!ENV.AI_DISCLOSURE.ENABLED || !ENV.AI_DISCLOSURE.API_KEY) return null;
  const question = (questionStr || '').trim();
  if (!question) return null;
  if (!chunks || chunks.length === 0) return null;

  // jp: 근거 약함 판단 — 최상위 점수가 임계 미만이면 답변 생성 스킵
  const topScore = chunks[0]?.finalScore ?? 0;
  const weak = topScore < WEAK_EVIDENCE_THRESHOLD;
  if (weak) {
    return {
      answer: '공시 주석에서 명확한 근거를 찾지 못했습니다.',
      usedChunks: 0,
      model: ENV.AI_DISCLOSURE.MODEL,
      evidence: [],
      weak: true,
    };
  }

  const used = chunks.slice(0, MAX_CONTEXT_CHUNKS);
  const context = buildContext(used);
  const userPrompt = `아래는 한 회사의 정기보고서 주석 근거입니다 (주석 본문 + 표).\n\n${context}\n\n---\n\n질문: "${question}"\n\n위 근거에 적힌 내용만 사용해서, 질문에 답하세요. 근거에 없으면 "공시 주석에서 명확한 근거를 찾지 못했습니다."라고만 답하세요. 답변 끝에 사용한 근거를 "📎 근거:"로 밝히세요.`;

  let systemPrompt = SYSTEM_PROMPT_FALLBACK;
  try {
    const p = await getPrompt('notes_answer_v2');
    if (p && p.trim()) systemPrompt = p;
  } catch { /* fallback */ }

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
        max_tokens: ANSWER_MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) {
      console.error(`[NotesAnswerV2] Claude 오류: ${res.status}`);
      return null;
    }
    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const raw = (data.content || [])
      .filter((b) => b.type === 'text' && b.text)
      .map((b) => b.text!.trim())
      .join('\n')
      .trim();
    const answer = stripMarkdown(raw);
    if (!answer) return null;

    const evidence = used.map((c) => ({
      kind: c.kind,
      sectionTitle: c.sectionTitle,
      reportName: c.reportName,
      reportPeriod: c.reportPeriod,
      receiptNo: c.receiptNo,
    }));

    return {
      answer,
      usedChunks: used.length,
      model: ENV.AI_DISCLOSURE.MODEL,
      evidence,
      weak: false,
    };
  } catch (err) {
    console.error('[NotesAnswerV2] 답변 생성 실패:', err instanceof Error ? err.message : err);
    return null;
  }
}
