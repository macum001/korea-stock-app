// jp: 공시 접수번호 AI 분석 서비스 (원문 기반) — 개선판
// jp: 흐름: Redis 캐시 → DB 조회 → [DART원문추출 + DB병렬] → Claude(스트리밍) → 저장
// jp: 개선: 스트리밍, 유형별 프롬프트 분기, keyNumbers/timeline 구조화, JSON retry, 병렬화, 선분석

import { ENV } from '../../config/env';
import { query } from '../../config/db';
import { safeGet, safeSetEx } from '../../config/redis';
import { extractDisclosureCore } from './dartDocument.service';
import { getPrompt } from './promptStore.service';

// ─────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────

export interface KeyNumber {
  label: string;   // jp: 예) "발행주식수", "발행가액", "납입일"
  value: string;   // jp: 예) "1,200만주", "주당 5,000원", "2024-03-15"
}

export interface ReceiptAnalysis {
  summary: string;
  detail: string;
  reason: string;
  impact: string;
  impactLabel: string;
  risks: string[];
  keyNumbers?: KeyNumber[];   // jp: 핵심 숫자 구조화 (신규)
  timeline?: string;          // jp: 주요 일정 흐름 (신규)
  subtype?: string;
  promptTokens?: number;
  completionTokens?: number;
  sourceMode?: string;
}

export interface ReceiptAnalysisResponse {
  receiptNo: string;
  stockCode: string;
  stockName: string;
  reportName: string;
  originalUrl: string;
  disclosedAt: string;
  analysis: ReceiptAnalysis;
  tokens?: number;
  cached?: boolean;
}

interface DisclosureRow {
  receipt_no: string;
  stock_code: string | null;
  stock_name: string | null;
  corp_code: string | null;
  report_name: string;
  disclosure_type: string | null;
  category: string | null;
  importance: string | null;
  sentiment: string | null;
  summary: string | null;
  original_url: string | null;
  disclosed_at: string;
  is_important: boolean;
  is_capital: boolean;
  is_good: boolean;
  is_bad: boolean;
  ai_summary: string | null;
  ai_key_points: string[] | null;
  ai_investor_note: string | null;
  ai_risk_note: string | null;
  impact_level: string | null;
}

// ─────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────

export const DISCLOSURE_SUBTYPES = [
  // jp: 증자 (세분화)
  '유상증자_주주배정후실권주공모',
  '유상증자_제3자배정',
  '유상증자_일반공모',
  '유상증자_주주우선공모',
  '유상증자_기타',
  '무상증자',
  // jp: 감자
  '유상감자',
  '무상감자',
  // jp: 사채
  '전환사채_CB',
  '신주인수권부사채_BW',
  '교환사채_EB',
  '일반사채',
  // jp: 실적
  '실적공시_잠정',
  '실적공시_확정',
  '실적공시_수정',
  '매출손익변동',
  // jp: 주요사항
  '단일판매공급계약',
  '타인채무보증',
  '자기주식_취득',
  '자기주식_처분',
  '자기주식_소각',
  // jp: 지배구조
  '최대주주변경',
  '임원변경_대표이사',
  '임원변경_기타',
  '주주총회',
  // jp: 감사/재무
  '감사보고서_적정',
  '감사보고서_한정',
  '감사보고서_거절부적정',
  '자본잠식',
  // jp: 기업변화
  '합병',
  '분할',
  '영업양수도',
  '상장폐지관련',
  '관리종목지정',
  // jp: 배당
  '현금배당',
  '주식배당',
  // jp: 소송/제재
  '소송판결',
  '공정위제재',
  // jp: 기타
  '대량보유보고',
  '기업설명회IR',
  '기타',] as const;

const CACHE_PREFIX = 'ai:disclosure:';
const CACHE_TTL = 60 * 60 * 24 * 7;  // jp: 7일 (공시는 안 바뀜)

// ─────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────

function isAiEnabled(): boolean {
  return ENV.AI_DISCLOSURE.ENABLED && !!ENV.AI_DISCLOSURE.API_KEY;
}



function impactLabel(impact: string): string {
  switch (impact) {
    case 'positive': return '긍정적';
    case 'negative': return '부정적';
    case 'neutral':  return '중립';
    default:         return '판단 유보';
  }
}

function normalizeImpact(level: string | null, sentiment: string | null): string {
  const s = (level || '').toLowerCase();
  if (s.includes('긍정')) return 'positive';
  if (s.includes('부정')) return 'negative';
  if (s.includes('중립')) return 'neutral';
  if (sentiment === 'positive') return 'positive';
  if (sentiment === 'negative') return 'negative';
  if (sentiment === 'neutral')  return 'neutral';
  return 'unknown';
}

function normalizeSubtype(raw: unknown): string {
  const s = String(raw || '').trim();
  return (DISCLOSURE_SUBTYPES as readonly string[]).includes(s) ? s : '기타';
}

// jp: JSON 파싱 — 마크다운 펜스 제거 후 파싱, 실패 시 null
function safeParseJson(text: string): Record<string, unknown> | null {
  try {
    const clean = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// 유형별 분석 체크리스트 (정확성 핵심)
// ─────────────────────────────────────────────

function getSubtypeChecklist(subtype: string | null | undefined, reportName: string): string {
  const s = subtype || reportName;

  // 전환사채 / 신주인수권부사채 / 교환사채
  if (s.includes('전환사채') || s.includes('CB') || s.includes('신주인수권') || s.includes('BW') || s.includes('교환사채') || s.includes('EB')) {
    return `[이 공시 유형 전용 체크리스트 — 반드시 원문에서 찾아 keyNumbers에 포함]
- 발행총액 (원)
- 표면이율 / 만기이율 (%)
- 전환(행사)가액 (원/주)
- 리픽싱(전환가액 조정) 조건: 최저 조정가액, 조정 주기
- 만기일
- 전환청구 가능 기간
- 주식으로 전환 시 신주 발행 예정 주수 (희석 규모)
- 투자자(사채 인수자) 명칭`;
  }

  // 유상증자
  if (s.includes('유상증자')) {
    return `[이 공시 유형 전용 체크리스트 — 반드시 원문에서 찾아 keyNumbers에 포함]
- 신주 발행 주수
- 발행가액 (예정가 또는 확정가, 원/주)
- 기준주가 대비 할인율 (%)
- 조달 총액 (원)
- 증자 방식 (주주배정 / 제3자배정 / 일반공모)
- 제3자배정이면: 배정 대상자 명칭
- 청약일 / 납입일 / 신주 상장 예정일
- 자금 사용 목적 (운영자금 / 채무상환 / 시설투자 등)`;
  }

  // 무상증자
  if (s.includes('무상증자')) {
    return `[이 공시 유형 전용 체크리스트]
- 신주 배정 비율 (기존 1주당 몇 주)
- 신주 발행 주수
- 신주 배정 기준일
- 신주 상장 예정일`;
  }

  // 감자
  if (s.includes('감자')) {
    return `[이 공시 유형 전용 체크리스트]
- 감자 비율 (몇 대 1)
- 유상감자 여부 (주주 보상 지급 여부)
- 무상감자 사유 (자본잠식 해소 등)
- 감자 기준일 / 효력 발생일
- 감자 후 자본금`;
  }

  // 자사주
  if (s.includes('자사주')) {
    return `[이 공시 유형 전용 체크리스트]
- 취득/처분 주수 및 금액
- 취득/처분 단가 (예정)
- 취득 기간 (시작일 ~ 종료일)
- 취득 목적 (주가안정 / 소각 / 임직원 성과급 등)
- 취득 방법 (장내매수 / 신탁 등)`;
  }

  // 실적 공시
  if (s.includes('실적') || s.includes('매출') || s.includes('영업이익') || reportName.includes('사업보고') || reportName.includes('분기보고')) {
    return `[이 공시 유형 전용 체크리스트]
- 매출액 (당기 vs 전기 비교)
- 영업이익 / 영업이익률
- 당기순이익
- 전년 동기 대비 증감률 (%)
- 어닝 서프라이즈 / 쇼크 여부
- 특이 항목 (일회성 손익 등)`;
  }

  // 단일 판매/공급계약
  if (s.includes('계약') || s.includes('수주')) {
    return `[이 공시 유형 전용 체크리스트]
- 계약 상대방
- 계약 금액 (원) 및 매출 대비 비율 (%)
- 계약 기간 (시작일 ~ 종료일)
- 계약 내용 (제품/서비스명)
- 계약 조건 (선급금, 잔금 일정 등)`;
  }

  // 합병/분할
  if (s.includes('합병') || s.includes('분할')) {
    return `[이 공시 유형 전용 체크리스트]
- 합병/분할 방식 (흡수합병 / 신설합병 / 물적분할 / 인적분할)
- 합병비율 또는 분할비율
- 상대 법인명
- 합병기일 / 분할기일
- 주주총회 예정일
- 반대주주 주식매수청구권 행사 가능 여부`;
  }

  // 지분변동 (대량보유 / 임원·주요주주 소유)
  if (s.includes('대량보유') || s.includes('주식등의') || s.includes('임원') || s.includes('주요주주') || s.includes('특정증권')) {
    return `[이 공시 유형 전용 체크리스트 — 반드시 원문에서 찾아 keyNumbers에 포함]
- 보고자(변동 주체) 이름/법인명, 회사와의 관계(임원/최대주주/기관 등)
- 변동 전 보유 주식수·지분율 → 변동 후 보유 주식수·지분율
- 이번 변동 수량 (취득/처분 주식 수)
- 보유 목적 (단순투자 / 경영참가 / 경영권 영향 — 매우 중요)
- 변동 사유 (장내매수/장외/상속/증여/신주취득 등)
- 취득/처분 단가, 평균 단가
- 발행주식 총수 (지분율 계산 근거)`;
  }

  // 배당
  if (s.includes('배당')) {
    return `[이 공시 유형 전용 체크리스트 — 반드시 원문에서 찾아 keyNumbers에 포함]
- 주당 배당금 (보통주/우선주)
- 시가배당률 (%)
- 배당 총액
- 배당 기준일 / 지급 예정일
- 배당 종류 (현금 / 현물 / 중간배당 / 결산배당)
- 전년 대비 배당 증감 (있으면)`;
  }

  // 소송
  if (s.includes('소송') || s.includes('소제기') || s.includes('판결')) {
    return `[이 공시 유형 전용 체크리스트 — 반드시 원문에서 찾아 keyNumbers에 포함]
- 소송 상대방 (원고/피고)
- 청구 금액 (소송 가액)
- 청구 금액이 자기자본에서 차지하는 비율 (규모 체감)
- 소송의 내용/요지
- 진행 단계 (제소 / 1심 / 항소 / 확정)
- 패소 시 회사에 미치는 영향`;
  }

  // 기본 체크리스트
  return `[공통 체크리스트]
- 공시의 핵심 숫자 (금액, 주식 수, 비율, 날짜)
- 이 공시로 인해 변화하는 것
- 주주에게 직접적 영향을 주는 항목`;
}

// ─────────────────────────────────────────────
// 원문 전처리 — 앞 + 핵심 섹션 + 끝 조합 (세세함 개선)
// ─────────────────────────────────────────────

function buildDocContext(docText: string): string {
  if (!docText) return '';

  // jp: 이미 핵심 섹션 추출이 된 짧은 텍스트면 그대로 사용
  if (docText.length <= 6000) return docText;

  // jp: 긴 원문: 앞 2500자(표지·결의 내용) + 마지막 1500자(세부 조건·일정) 조합
  // jp: 중간부 잘림으로 핵심 숫자가 누락되는 것을 방지
  const head = docText.slice(0, 2500);
  const tail = docText.slice(-1500);
  const mid  = docText.length > 8000
    ? `\n...(중략 ${Math.round((docText.length - 4000) / 1000)}k자)...\n`
    : docText.slice(2500, docText.length - 1500);

  return head + mid + tail;
}

// ─────────────────────────────────────────────
// 프롬프트 빌더
// ─────────────────────────────────────────────

const SUBTYPE_GUIDE = `[disclosure_subtype 분류 지침]
아래 목록에서 정확히 하나만 고른다:
- 유상증자는 증자방식을 반드시 구분: 유상증자_주주배정 / 유상증자_제3자배정 / 유상증자_일반공모 / 유상증자_주주배정후실권주공모 / 유상증자_기타
- 무상증자 / 유무상증자
- 전환사채(CB) / 신주인수권부사채(BW) / 교환사채(EB)
- 자사주취득 / 자사주처분 / 자사주신탁
- 감자는 반드시 구분: 유상감자 / 무상감자
- 주식소각 / 단일판매공급계약 / 실적공시 / 영업정지
- 최대주주변경 / 합병 / 분할 / 소송
- 위 어디에도 해당 없으면 기타`;

function buildUserPrompt(row: DisclosureRow, docText: string, docMode: string): string {
  const processedDoc = buildDocContext(docText);

  // jp: 유형별 체크리스트 — subtype은 아직 모를 수 있으므로 report_name + disclosure_type으로 추론
  const checklist = getSubtypeChecklist(row.disclosure_type, row.report_name);

  const base = `다음 한국 공시를 초등학생도 이해할 수 있게 분석해서 JSON으로만 답하라.

회사명: ${row.stock_name || '-'}
종목코드: ${row.stock_code || '-'}
공시 제목: ${row.report_name}
공시 유형: ${row.disclosure_type || '-'}`;

  const docPart = processedDoc
    ? `\n\n[공시 원문 — 이 데이터를 근거로 분석하라. 원문에 없는 사실은 절대 지어내지 말 것]\n${processedDoc}`
    : `\n\n(공시 원문을 가져오지 못했습니다. 제목과 유형만으로 일반적인 설명을 하되, 구체적 숫자는 절대 지어내지 마세요. keyNumbers는 빈 배열로.)`;

  const format = `\n\n${checklist}

${SUBTYPE_GUIDE}

출력 형식(JSON만, 설명·마크다운 없이):
{
  "summary": "공시 핵심을 초등학생도 알 수 있게 한 문장으로 (40~90자)",
  "detail": "무슨 내용인지 쉬운 말로 설명. 어려운 용어는 괄호로 풀이. 원문의 핵심 숫자 포함 (150~350자)",
  "reason": "이 공시가 투자자에게 왜 중요한지 쉽게 (80~200자)",
  "impact": "positive|neutral|negative|unknown 중 하나",
  "risks": ["투자자가 확인해야 할 점 1~3개. 쉬운 말로"],
  "keyNumbers": [
    { "label": "항목명", "value": "원문 그대로의 값 (없으면 빈 배열)" }
  ],
  "timeline": "주요 일정 흐름 한 줄 (예: 이사회결의(1/5) → 청약(2/10~11) → 납입(2/15) → 신주상장(2/25)). 날짜 정보 없으면 빈 문자열.",
  "disclosure_subtype": "위 목록 중 정확히 하나"
}`;

  return base + docPart + format;
}

// ─────────────────────────────────────────────
// Claude 호출 — 스트리밍으로 전문 수집 후 파싱
// ─────────────────────────────────────────────

async function callClaudeStreaming(
  row: DisclosureRow,
  docText: string,
  docMode: string,
  systemPrompt: string,
): Promise<Partial<ReceiptAnalysis> | null> {
  const userPrompt = buildUserPrompt(row, docText, docMode);

  // jp: 스트리밍 요청 — 사용자는 프론트에서 SSE로 바로 받고, 백엔드는 전체 수집 후 DB 저장
  let fullText = '';
  let promptTokens = 0;
  let completionTokens = 0;

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
        max_tokens: 1800,
        stream: true,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      console.error(`[AI분석] Claude 오류: ${res.status} ${await res.text()}`);
      return null;
    }

    // jp: SSE 스트림 읽기
    const reader = res.body?.getReader();
    if (!reader) return null;
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const event = JSON.parse(data) as {
            type: string;
            delta?: { type: string; text?: string };
            usage?: { input_tokens?: number; output_tokens?: number };
            message?: { usage?: { input_tokens?: number; output_tokens?: number } };
          };
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            fullText += event.delta.text || '';
          }
          // jp: 토큰 집계 (message_start 또는 message_delta 이벤트)
          if (event.type === 'message_start' && event.message?.usage) {
            promptTokens = event.message.usage.input_tokens || 0;
          }
          if (event.type === 'message_delta' && event.usage) {
            completionTokens = event.usage.output_tokens || 0;
          }
        } catch { /* 파싱 불가 라인 무시 */ }
      }
    }
  } catch (err) {
    console.error('[AI분석] 스트리밍 실패:', err instanceof Error ? err.message : err);
    return null;
  }

  // jp: JSON 파싱 — 실패 시 1회 retry (모델이 가끔 앞뒤에 텍스트 붙임)
  let parsed = safeParseJson(fullText);
  if (!parsed) {
    // jp: JSON 블록만 추출 시도
    const match = fullText.match(/\{[\s\S]*\}/);
    if (match) parsed = safeParseJson(match[0]);
  }
  if (!parsed) {
    console.error('[AI분석] JSON 파싱 실패. 원문:', fullText.slice(0, 300));
    return null;
  }

  // jp: keyNumbers 정규화
  const rawNums = Array.isArray(parsed.keyNumbers) ? parsed.keyNumbers : [];
  const keyNumbers: KeyNumber[] = rawNums
    .filter((n): n is { label: unknown; value: unknown } => n && typeof n === 'object')
    .map((n) => ({ label: String(n.label || ''), value: String(n.value || '') }))
    .filter((n) => n.label && n.value);

  return {
    summary:          String(parsed.summary || ''),
    detail:           String(parsed.detail || ''),
    reason:           String(parsed.reason || ''),
    impact:           String(parsed.impact || 'unknown'),
    risks:            Array.isArray(parsed.risks) ? parsed.risks.map(String) : [],
    keyNumbers,
    timeline:         String(parsed.timeline || ''),
    subtype:          normalizeSubtype(parsed.disclosure_subtype),
    promptTokens,
    completionTokens,
  };
}

// ─────────────────────────────────────────────
// DB 헬퍼
// ─────────────────────────────────────────────

function fromDb(row: DisclosureRow): ReceiptAnalysis {
  // jp: ai_key_points 배열을 자연스러운 문장으로 조합 (기존: · 구분자 → 개선: 줄바꿈 없이 자연스럽게)
  let detail = row.summary || '';
  if (row.ai_key_points && row.ai_key_points.length > 0) {
    detail = row.ai_key_points
      .filter(Boolean)
      .map((p, i) => (i === 0 ? p : p.charAt(0).toLowerCase() + p.slice(1)))
      .join(' 또한 ');
  }

  return {
    summary:       row.ai_summary || row.report_name,
    detail,
    reason:        row.ai_investor_note || '',
    impact:        normalizeImpact(row.impact_level, row.sentiment),
    impactLabel:   impactLabel(normalizeImpact(row.impact_level, row.sentiment)),
    risks:         row.ai_risk_note ? row.ai_risk_note.split(' / ').filter(Boolean) : [],
    sourceMode:    'db',
  };
}

function fallbackAnalysis(row: DisclosureRow): ReceiptAnalysis {
  const impact = normalizeImpact(row.impact_level, row.sentiment);
  return {
    summary:       row.summary || row.report_name,
    detail:        row.summary || '',
    reason:        '',
    impact,
    impactLabel:   impactLabel(impact),
    risks:         [],
    sourceMode:    'none',
  };
}

// ─────────────────────────────────────────────
// 메인 분석 함수
// ─────────────────────────────────────────────

export async function analyzeByReceiptNo(receiptNo: string): Promise<ReceiptAnalysisResponse | null> {

  // 1. Redis 캐시
  const cacheKey = `${CACHE_PREFIX}${receiptNo}`;
  try {
    const cached = await safeGet(cacheKey);
    if (cached) {
      const obj = JSON.parse(cached) as ReceiptAnalysisResponse;
      obj.cached = true;
      return obj;
    }
  } catch { /* 캐시 실패 무시 */ }

  // 2. DB 조회
  let rows: DisclosureRow[];
  try {
    rows = await query<DisclosureRow>(
      `SELECT receipt_no, stock_code, stock_name, corp_code, report_name, disclosure_type,
              category, importance, sentiment, summary, original_url, disclosed_at,
              is_important, is_capital, is_good, is_bad,
              ai_summary, ai_key_points, ai_investor_note, ai_risk_note, impact_level
         FROM disclosures
        WHERE receipt_no = $1
        LIMIT 1`,
      [receiptNo]
    );
  } catch (err) {
    console.error('[AI분석] DB 조회 실패:', err instanceof Error ? err.message : err);
    return null;
  }

  if (!rows || rows.length === 0) return null;

  const row = rows[0];

  // 3. DB에 이미 분석 결과 있으면 재사용 (토큰 0)
  if (row.ai_summary && row.ai_summary.trim().length > 0) {
    const dbResult: ReceiptAnalysisResponse = {
      receiptNo:   row.receipt_no,
      stockCode:   row.stock_code || '',
      stockName:   row.stock_name || '',
      reportName:  row.report_name,
      originalUrl: row.original_url || '',
      disclosedAt: row.disclosed_at,
      analysis:    fromDb(row),
      tokens:      0,
      cached:      true,
    };
    try { await safeSetEx(cacheKey, CACHE_TTL, JSON.stringify(dbResult)); } catch { /* 무시 */ }
    return dbResult;
  }

  let analysis: ReceiptAnalysis;

  if (isAiEnabled()) {
    // 4. DART 원문 추출 & 시스템 프롬프트 병렬 로드 (속도 개선)
    const [docResult, systemPrompt] = await Promise.allSettled([
      extractDisclosureCore(receiptNo, row.report_name).catch((err) => {
        console.warn('[AI분석] 원문 추출 실패, 제목 기반 분석:', err instanceof Error ? err.message : err);
        return { ok: false as const, text: '', mode: 'title' as const };
      }),
      getPrompt('disclosure_system').catch(() => ''),
    ]);

    const doc = docResult.status === 'fulfilled'
      ? docResult.value
      : { ok: false, text: '', mode: 'title' };

    const sysPrompt = systemPrompt.status === 'fulfilled' && systemPrompt.value
      ? systemPrompt.value
      : DEFAULT_SYSTEM_PROMPT;

    const docText = (doc.ok && doc.text) ? doc.text : '';
    const docMode = doc.mode || 'title';

    // 5. Claude 스트리밍 호출
    const ai = await callClaudeStreaming(row, docText, docMode, sysPrompt);

    if (ai) {
      const impact = ai.impact && ai.impact !== 'unknown'
        ? ai.impact
        : normalizeImpact(row.impact_level, row.sentiment);
      const subtype = ai.subtype || '기타';
      const promptTokens = ai.promptTokens || 0;
      const completionTokens = ai.completionTokens || 0;
      const totalTokens = promptTokens + completionTokens;

      analysis = {
        summary:          ai.summary || row.summary || row.report_name,
        detail:           ai.detail  || row.summary || '',
        reason:           ai.reason  || '',
        impact,
        impactLabel:      impactLabel(impact),
        risks:            ai.risks   || [],
        keyNumbers:       ai.keyNumbers || [],
        timeline:         ai.timeline   || '',
        subtype,
        promptTokens,
        completionTokens,
        sourceMode:       docMode,
      };

      // 6. DB 저장 — keyNumbers/timeline JSON 컬럼 저장 (컬럼 없으면 무시됨)
      try {
        await query(
          `UPDATE disclosures
              SET ai_summary            = $1,
                  ai_investor_note      = $2,
                  ai_risk_note          = $3,
                  impact_level          = $4,
                  disclosure_subtype    = $5,
                  ai_prompt_tokens      = $6,
                  ai_completion_tokens  = $7,
                  ai_total_tokens       = $8,
                  ai_status             = 'completed',
                  ai_analyzed_at        = now(),
                  ai_model              = $9,
                  ai_key_numbers        = $10,
                  ai_timeline           = $11
            WHERE receipt_no = $12`,
          [
            analysis.summary,
            analysis.reason,
            analysis.risks.join(' / '),
            analysis.impactLabel,
            subtype,
            promptTokens,
            completionTokens,
            totalTokens,
            ENV.AI_DISCLOSURE.MODEL,
            JSON.stringify(analysis.keyNumbers || []),
            analysis.timeline || '',
            receiptNo,
          ]
        );
      } catch (e) {
        // jp: ai_key_numbers / ai_timeline 컬럼이 아직 없는 경우 기존 컬럼만 저장
        console.warn('[AI분석] 확장 컬럼 저장 실패, 기본 컬럼으로 재시도:', (e as Error).message);
        try {
          await query(
            `UPDATE disclosures
                SET ai_summary = $1, ai_investor_note = $2, ai_risk_note = $3,
                    impact_level = $4, disclosure_subtype = $5,
                    ai_prompt_tokens = $6, ai_completion_tokens = $7, ai_total_tokens = $8,
                    ai_status = 'completed', ai_analyzed_at = now(), ai_model = $9
              WHERE receipt_no = $10`,
            [analysis.summary, analysis.reason, analysis.risks.join(' / '), analysis.impactLabel, subtype,
             promptTokens, completionTokens, totalTokens, ENV.AI_DISCLOSURE.MODEL, receiptNo]
          );
        } catch { /* 저장 실패해도 응답은 정상 */ }
      }
    } else {
      analysis = row.ai_summary ? fromDb(row) : fallbackAnalysis(row);
    }
  } else {
    analysis = row.ai_summary ? fromDb(row) : fallbackAnalysis(row);
  }

  const result: ReceiptAnalysisResponse = {
    receiptNo:   row.receipt_no,
    stockCode:   row.stock_code || '',
    stockName:   row.stock_name || '',
    reportName:  row.report_name,
    originalUrl: row.original_url || '',
    disclosedAt: row.disclosed_at,
    analysis,
    tokens: (analysis.promptTokens || 0) + (analysis.completionTokens || 0),
  };

  try { await safeSetEx(cacheKey, CACHE_TTL, JSON.stringify(result)); } catch { /* 무시 */ }
  return result;
}

// ─────────────────────────────────────────────
// 백그라운드 선분석 — 수집 시점에 호출해서 Redis/DB 워밍업
// jp: 공시 수집 워커에서 importanceScore 높은 공시에 대해 호출
// jp: 사용자 요청 전에 미리 분석해두면 항상 캐시 히트
// ─────────────────────────────────────────────

export async function preAnalyzeDisclosure(receiptNo: string): Promise<void> {
  const cacheKey = `${CACHE_PREFIX}${receiptNo}`;

  // jp: 이미 캐시 또는 DB 분석 있으면 스킵
  try {
    const cached = await safeGet(cacheKey);
    if (cached) return;
  } catch { /* 무시 */ }

  try {
    const rows = await query<Pick<DisclosureRow, 'ai_summary'>>(
      `SELECT ai_summary FROM disclosures WHERE receipt_no = $1 LIMIT 1`,
      [receiptNo]
    );
    if (rows?.[0]?.ai_summary) return;
  } catch { /* 무시 */ }

  // jp: 분석 실행 (결과는 analyzeByReceiptNo 내부에서 캐싱됨)
  await analyzeByReceiptNo(receiptNo).catch((err) => {
    console.warn(`[선분석] ${receiptNo} 실패:`, err instanceof Error ? err.message : err);
  });
}

// ─────────────────────────────────────────────
// 기본 시스템 프롬프트 (promptStore DB 장애 시 fallback)
// ─────────────────────────────────────────────

const DEFAULT_SYSTEM_PROMPT = `너는 한국 상장사 공시를 초등학생도 이해할 수 있게 쉽게 풀어주는 AI 분석가다.

원칙:
- 어려운 금융/회계 용어가 나오면 반드시 쉬운 말로 풀어서 설명한다.
- 제공된 공시 원문 데이터만 사용한다. 원문에 없는 사실/숫자/전망은 절대 지어내지 않는다.
- 숫자(금액, 주식 수, 비율, 날짜)는 원문 그대로 정확히 쓰되, 큰 금액은 읽기 쉽게 표현한다.
- 투자 추천 금지. 매수/매도 추천 금지. "사라/팔아야 한다" 같은 단정 금지.
- 자본조달 공시(유상증자, 전환사채 등)를 무조건 호재/악재로 단정하지 않고, 방식과 목적에 따라 다르다고 설명한다.
- 따뜻하고 친절한 말투로 초등학생에게 설명하듯 한다.
- keyNumbers에는 원문에서 찾은 숫자만 넣는다. 없으면 빈 배열.

반드시 JSON만 출력한다 (설명·마크다운 없이).`;
