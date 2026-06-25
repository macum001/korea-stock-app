// jp: 공시 AI 분석 서비스 - 백엔드에서 Claude API 호출해 공시 요약 생성
// jp: 프론트는 절대 직접 호출 안 함. 공시 수집 시 여기서 생성 → DB 저장 → 프론트는 조회만
// jp: feature flag(ENABLE_AI_DISCLOSURE_SUMMARY)로 보호. 기본 OFF (비용 발생)
// jp: 유료화 대비 - 이 서비스 레이어만 분리돼 있어 권한 체크를 나중에 쉽게 붙일 수 있음

import { ENV } from '../../config/env';

export interface AiAnalysisResult {
  summary: string;
  keyPoints: string[];
  investorNote: string;
  riskNote: string;
  impactLevel: string;      // jp: 매우 긍정적/긍정적/중립/부정적/매우 부정적
  confidenceScore: number;  // jp: 0~100
  model: string;
  status: 'completed' | 'failed' | 'skipped';
}

// jp: AI 분석 활성 여부 (키 + flag 둘 다 필요)
export function isAiAnalysisEnabled(): boolean {
  return ENV.AI_DISCLOSURE.ENABLED && !!ENV.AI_DISCLOSURE.API_KEY;
}

const SYSTEM_PROMPT = `너는 한국 주식 공시를 개인투자자에게 쉽게 설명하는 증권앱 AI 분석가다.
공시 원문을 읽기 어려운 초보 투자자도 3~10초 안에 이해할 수 있게 설명한다.
반드시 실제 공시 내용 기반으로 작성하고, 확인되지 않은 미래 전망을 단정하지 않으며, 매수/매도 추천은 절대 하지 않는다.
"좋은 공시입니다", "나쁜 공시입니다", "큰 계약을 따냈습니다", "투자에 도움이 됩니다" 같은 추상적·권유성 표현은 금지한다.
반드시 JSON만 출력한다(설명·마크다운 없이).`;

function buildUserPrompt(reportName: string, corpName: string, stockCode: string): string {
  return `다음 한국 공시를 분석해서 JSON으로만 답하라.

회사명: ${corpName}
종목코드: ${stockCode}
공시 제목: ${reportName}

출력 형식(JSON):
{
  "summary": "공시를 쉬운 말로 한 문장 요약 (150~300자)",
  "key_points": ["핵심 포인트 2~3개 (계약상대방/금액/수량/기간 등 핵심 수치 포함)"],
  "investor_note": "투자자가 알아야 할 핵심 의미 (단정·권유 금지)",
  "risk_note": "추가로 확인해야 할 점",
  "impact_level": "매우 긍정적|긍정적|중립|부정적|매우 부정적 중 하나",
  "confidence_score": 0~100 정수 (제목만으로 판단 가능한 정도)
}`;
}

// jp: 단일 공시 AI 분석 (Claude API fetch 호출)
export async function analyzeDisclosure(
  reportName: string,
  corpName: string,
  stockCode: string
): Promise<AiAnalysisResult> {
  // jp: 비활성/키 없음 → skipped (앱 안 깨짐)
  if (!isAiAnalysisEnabled()) {
    return emptyResult('skipped');
  }

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
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserPrompt(reportName, corpName, stockCode) }],
      }),
      // jp: 타임아웃 (느린 응답이 수집을 막지 않게)
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error(`[AI공시] Claude API 오류: ${res.status} - ${errBody}`);
      return emptyResult('failed');
    }

    const data = await res.json() as { content?: Array<{ type: string; text?: string }> };
    // jp: 응답에서 text 블록 추출
    const text = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text || '')
      .join('');

    // jp: JSON 파싱 (혹시 코드펜스 있으면 제거)
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    return {
      summary:         String(parsed.summary || ''),
      keyPoints:       Array.isArray(parsed.key_points) ? parsed.key_points.map(String) : [],
      investorNote:    String(parsed.investor_note || ''),
      riskNote:        String(parsed.risk_note || ''),
      impactLevel:     String(parsed.impact_level || '중립'),
      confidenceScore: Math.max(0, Math.min(100, parseInt(parsed.confidence_score) || 0)),
      model:           ENV.AI_DISCLOSURE.MODEL,
      status:          'completed',
    };
  } catch (err) {
    console.error('[AI공시] 분석 실패:', err instanceof Error ? err.message : err);
    return emptyResult('failed');
  }
}

function emptyResult(status: 'failed' | 'skipped'): AiAnalysisResult {
  return {
    summary: '', keyPoints: [], investorNote: '', riskNote: '',
    impactLevel: '중립', confidenceScore: 0,
    model: ENV.AI_DISCLOSURE.MODEL, status,
  };
}
