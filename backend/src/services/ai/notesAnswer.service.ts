// ============================================================
// jp: 주석 검색 AI 답변 생성 서비스 (RAG의 G = Generation)
// jp: 위치: backend/src/services/ai/notesAnswer.service.ts
// jp: 역할: searchNotes()가 찾은 주석 청크들을 Haiku에게 주고
// jp:       "초등학생도 이해하게 아주 쉽게" 자연어 답변을 생성
// jp: 모델: ENV.AI_DISCLOSURE.MODEL (claude-haiku-4-5) — 공시분석과 동일
// jp: 핵심: 원문에 있는 내용만 답하고, 없으면 "없다"고 말하게 (할루시네이션 차단)
// ============================================================
import { ENV } from '../../config/env';
import type { NotesSearchResult } from './notesEmbedding.service';
import { getPrompt } from './promptStore.service';

// jp: 답변 생성에 쓸 상위 청크 개수 (많을수록 비용↑, 보통 3개면 충분)
const MAX_CONTEXT_CHUNKS = 3;
// jp: 각 청크에서 가져올 최대 글자 (너무 길면 비용↑ — 앞부분이 보통 핵심)
const CHUNK_CHAR_LIMIT = 2200;
// jp: 답변 최대 토큰 (짧고 쉽게 — 출력 비용 고정)
const ANSWER_MAX_TOKENS = 700;

export interface NotesAnswerResult {
  answer: string;          // jp: AI가 생성한 쉬운 설명
  usedChunks: number;      // jp: 답변에 사용한 청크 수
  model: string;           // jp: 사용 모델
}

// jp: ===== 시스템 프롬프트 fallback (DB/promptStore 조회 실패 시만 사용) =====
// jp: 평소엔 getPrompt('notes_answer')로 admin이 수정한 값을 씀.
// jp: 실제 기본값은 promptStore.service.ts의 DEFAULT_PROMPTS.notes_answer 와 동일하게 유지.
const SYSTEM_PROMPT_FALLBACK = `당신은 어려운 기업 공시 주석을 친구에게 이야기하듯 쉽게 풀어주는 사람입니다.

[답변 규칙]
1. 제공된 "주석 원문"에 실제로 적힌 내용만 사용해 답하세요. 원문에 없는 내용은 절대 지어내지 마세요.
2. 옆에서 친근하게 설명하듯 자연스러운 말투로 쓰세요. "~있어요", "~돼요", "~거예요" 처럼 부드럽게 끝맺으세요.
3. 어려운 회계 용어가 나오면 괄호로 짧게 쉬운 뜻을 덧붙이세요.
4. 숫자(금액·비율·날짜)는 원문 그대로 정확히 쓰세요.
5. 핵심을 먼저 한 줄로 말한 뒤, 필요한 만큼만 풀어서 설명하세요.
6. 주석 원문에서 질문에 대한 내용을 찾을 수 없으면 정확히 이렇게만 답하세요: "주석 원문에서 관련 내용을 찾지 못했어요."

[출력 형식]
- 마크다운 기호(#, **, ---, > 등)를 절대 쓰지 마세요. 일반 문장과 줄바꿈만 사용하세요.
- 항목 나열 시 각 줄 맨 앞에 이모지를 붙이세요. 핵심은 "📝 ", 주의는 "⚠️ ", 정상은 "✅ ", 참고는 "💡 ", 금액은 "💰 ", 날짜는 "📅 ".
- 평가하거나 투자를 권하지 마세요. 사실만 친근하게 전달하세요.`;

// jp: 청크들을 프롬프트용 문자열로 정리
function buildContext(chunks: NotesSearchResult[]): string {
  return chunks
    .slice(0, MAX_CONTEXT_CHUNKS)
    .map((c, i) => {
      const txt = (c.chunkText || '').slice(0, CHUNK_CHAR_LIMIT).trim();
      return `[주석 원문 ${i + 1}] (${c.reportName || '보고서'})\n${txt}`;
    })
    .join('\n\n---\n\n');
}

// jp: ===== 마크다운 기호 제거 (이중 안전장치) =====
// jp: 프롬프트로 막아도 가끔 새어나오는 #, **, ---, > 등을 후처리로 청소
function stripMarkdown(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      let s = line;
      // jp: 제목 기호 (### 제목 → 제목)
      s = s.replace(/^\s*#{1,6}\s*/, '');
      // jp: 인용 기호 (> 내용 → 내용)
      s = s.replace(/^\s*>\s?/, '');
      // jp: 구분선 (---, ***, ___ 한 줄) → 빈 줄
      if (/^\s*([-*_])\1{2,}\s*$/.test(s)) return '';
      // jp: 굵게/기울임 별표 제거 (**text** → text, *text* → text)
      s = s.replace(/\*\*([^*]+)\*\*/g, '$1');
      s = s.replace(/\*([^*]+)\*/g, '$1');
      // jp: 남은 떠돌이 별표/언더바 강조 기호 제거
      s = s.replace(/\*\*/g, '').replace(/(^|\s)\*(\S)/g, '$1$2');
      // jp: 인라인 백틱 코드 기호 제거
      s = s.replace(/`([^`]+)`/g, '$1');
      return s;
    })
    .join('\n')
    // jp: 3줄 이상 연속 빈 줄 → 2줄로 축소
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * jp: 검색 결과(청크)를 받아 Haiku로 쉬운 설명 생성
 * @param questionStr 사용자 질문 (예: "전환사채 이연손익")
 * @param chunks searchNotes() 결과 상위 N개
 * @returns 쉬운 답변 or null (AI 비활성/오류 시)
 */
export async function generateNotesAnswer(
  questionStr: string,
  chunks: NotesSearchResult[],
): Promise<NotesAnswerResult | null> {
  // jp: AI 비활성 or 키 없음 → 답변 생략 (검색 결과만 보여주면 됨)
  if (!ENV.AI_DISCLOSURE.ENABLED || !ENV.AI_DISCLOSURE.API_KEY) return null;

  const question = (questionStr || '').trim();
  if (!question) return null;

  // jp: 근거 청크가 없으면 AI 호출 자체를 안 함 (비용 0 + 헛답변 방지)
  if (!chunks || chunks.length === 0) return null;

  const context = buildContext(chunks);
  const userPrompt = `아래는 어떤 회사의 사업보고서 주석 원문 일부입니다.\n\n${context}\n\n---\n\n질문: "${question}"\n\n위 주석 원문을 근거로, 질문에 대해 일반인도 이해하기 쉽게 설명해 주세요.`;

  // jp: 시스템 프롬프트 — admin이 수정한 값(promptStore) 우선, 실패 시 fallback
  let systemPrompt = SYSTEM_PROMPT_FALLBACK;
  try {
    const p = await getPrompt('notes_answer');
    if (p && p.trim()) systemPrompt = p;
  } catch { /* fallback 사용 */ }

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
      // jp: 검색 답변은 빨라야 함 — 20초 타임아웃
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      console.error(`[NotesAnswer] Claude 오류: ${res.status} ${await res.text().catch(() => '')}`);
      return null;
    }

    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };

    // jp: text 블록들을 합쳐 최종 답변 + 마크다운 청소
    const raw = (data.content || [])
      .filter((b) => b.type === 'text' && b.text)
      .map((b) => b.text!.trim())
      .join('\n')
      .trim();

    const answer = stripMarkdown(raw);

    if (!answer) return null;

    return {
      answer,
      usedChunks: Math.min(chunks.length, MAX_CONTEXT_CHUNKS),
      model: ENV.AI_DISCLOSURE.MODEL,
    };
  } catch (err) {
    console.error('[NotesAnswer] 답변 생성 실패:', err instanceof Error ? err.message : err);
    return null;
  }
}
