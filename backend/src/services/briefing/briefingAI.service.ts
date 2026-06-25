// briefingAI.service.ts
// jp: 수집된 시황 데이터 + 뉴스 + 공시 + 수급 → Claude AI 분석 → DB 저장
// jp: 개선: 네이버뉴스(국내/미국) + 주요공시 + 외국인/기관 수급 추가
// jp: 프롬프트: 인과관계 중심, 글자수 완화, 시간대별 포커스

import Anthropic from '@anthropic-ai/sdk';
import { MarketBriefing, updateBriefingAnalyzed, markBriefingFailed } from '../../repositories/briefing.repository';
import { BriefingDataItem } from '../kis/globalIndex.service';
import { getPrompt } from '../ai/promptStore.service';
import { searchStockNews } from '../naverNews.service';
import { query } from '../../config/db';

const anthropic = new Anthropic();

// jp: 시간대별 포커스 (slot 기준)
function getSlotFocus(slot: string): string {
  switch (slot) {
    case '0600': return '미국 증시 마감 결과와 오늘 국내 장 전망 중심';
    case '0840': return '장 시작 전 준비 - 오늘 주목할 종목과 섹터 중심';
    case '1150': return '오전 장중 흐름 - 현재 강세/약세 섹터와 수급 중심';
    case '1540': return '장 마감 결과 - 오늘 시장 총평과 내일 전망 중심';
    case '2250': return '미국 장 중반 - 야간 선물과 내일 국내 장 영향 중심';
    default:     return '전반적인 시장 현황 중심';
  }
}

// jp: 지수 데이터 텍스트 변환
function buildMarketDataText(items: BriefingDataItem[]): string {
  const byCategory: Record<string, BriefingDataItem[]> = {};
  for (const item of items) {
    if (!byCategory[item.category]) byCategory[item.category] = [];
    byCategory[item.category].push(item);
  }

  const categoryNames: Record<string, string> = {
    kr_index: '국내 지수', kr_stock: '국내 주요종목',
    us_index: '미국 지수', us_rate: '미국 금리',
    forex: '환율', commodity: '원자재',
    global_index: '글로벌 지수', us_stock: '미국 주요종목',
  };

  const order = ['kr_index', 'kr_stock', 'us_index', 'us_rate', 'forex', 'commodity', 'global_index', 'us_stock'];
  const lines: string[] = [];
  for (const cat of order) {
    const catItems = byCategory[cat];
    if (!catItems || catItems.length === 0) continue;
    lines.push(`▶ ${categoryNames[cat] ?? cat}`);
    for (const item of catItems) {
      const unit = item.unit ? ` ${item.unit}` : '';
      lines.push(`  ${item.name}: ${item.price.toLocaleString()}${unit} (전일비 ${item.changeRateStr})`);
    }
  }
  return lines.join('\n');
}

// jp: 네이버 뉴스 수집 (국내 + 미국 증시)
async function fetchMarketNews(): Promise<string> {
  try {
    const [krNews, usNews, forexNews] = await Promise.all([
      searchStockNews('코스피 증시', 5),
      searchStockNews('미국증시 나스닥', 5),
      searchStockNews('원달러 환율', 3),
    ]);

    const lines: string[] = [];

    if (krNews.length > 0) {
      lines.push('▶ 국내 증시 뉴스');
      krNews.forEach((n, i) => lines.push(`  ${i + 1}. ${n.title} (${n.source})`));
    }
    if (usNews.length > 0) {
      lines.push('▶ 미국 증시 뉴스');
      usNews.forEach((n, i) => lines.push(`  ${i + 1}. ${n.title} (${n.source})`));
    }
    if (forexNews.length > 0) {
      lines.push('▶ 환율 관련 뉴스');
      forexNews.forEach((n, i) => lines.push(`  ${i + 1}. ${n.title} (${n.source})`));
    }

    return lines.length > 0 ? lines.join('\n') : '뉴스를 가져오지 못했습니다.';
  } catch {
    return '뉴스를 가져오지 못했습니다.';
  }
}

// jp: 오늘 주요 공시 (is_important=true, 최근 24시간)
async function fetchTodayDisclosures(): Promise<string> {
  try {
    const rows = await query<{ stock_name: string; report_name: string; category: string; disclosed_at: string }>(
      `SELECT stock_name, report_name, category, disclosed_at
         FROM disclosures
        WHERE disclosed_at > now() - INTERVAL '24 hours'
          AND is_important = true
        ORDER BY disclosed_at DESC
        LIMIT 8`
    );
    if (rows.length === 0) return '오늘 주요 공시 없음';

    const lines = ['▶ 오늘 주요 공시'];
    rows.forEach((r, i) => {
      const time = new Date(r.disclosed_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
      lines.push(`  ${i + 1}. [${r.category || '일반'}] ${r.stock_name} - ${r.report_name} (${time})`);
    });
    return lines.join('\n');
  } catch {
    return '공시 데이터를 가져오지 못했습니다.';
  }
}

// jp: 외국인/기관 수급 상위 종목 (오늘)
async function fetchInvestorFlow(): Promise<string> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await query<{ stock_code: string; name: string; investor_type: string; net_buy_value: number }>(
      `SELECT f.stock_code, m.name, f.investor_type, f.net_buy_value
         FROM stock_daily_investor_flows f
         JOIN stock_master m ON m.code = f.stock_code
        WHERE f.trade_date = $1
          AND f.net_buy_value > 0
          AND f.investor_type IN ('foreign', 'institution')
        ORDER BY f.net_buy_value DESC
        LIMIT 6`,
      [today]
    );

    if (rows.length === 0) return '';

    const foreign = rows.filter(r => r.investor_type === 'foreign').slice(0, 3);
    const institution = rows.filter(r => r.investor_type === 'institution').slice(0, 3);

    const lines = ['▶ 수급 동향'];
    if (foreign.length > 0) {
      lines.push('  외국인 순매수: ' + foreign.map(r =>
        `${r.name}(+${(r.net_buy_value / 100000000).toFixed(0)}억)`
      ).join(', '));
    }
    if (institution.length > 0) {
      lines.push('  기관 순매수: ' + institution.map(r =>
        `${r.name}(+${(r.net_buy_value / 100000000).toFixed(0)}억)`
      ).join(', '));
    }
    return lines.join('\n');
  } catch {
    return '';
  }
}

// jp: 전체 프롬프트 조합
async function buildUserMessage(items: BriefingDataItem[], slot: string): Promise<string> {
  const slotFocus = getSlotFocus(slot);

  // jp: 병렬로 데이터 수집
  const [marketData, news, disclosures, investorFlow] = await Promise.all([
    Promise.resolve(buildMarketDataText(items)),
    fetchMarketNews(),
    fetchTodayDisclosures(),
    fetchInvestorFlow(),
  ]);

  const lines = [
    `[시황 브리핑 데이터 - ${slot} 기준]`,
    `📌 이번 브리핑 포커스: ${slotFocus}`,
    '',
    '=== 시장 지표 ===',
    marketData,
    '',
    '=== 오늘의 뉴스 ===',
    news,
    '',
    '=== 오늘 주요 공시 ===',
    disclosures,
  ];

  if (investorFlow) {
    lines.push('');
    lines.push('=== 수급 동향 ===');
    lines.push(investorFlow);
  }

  lines.push('');
  lines.push('위 데이터를 종합해서 JSON으로만 답해주세요.');
  return lines.join('\n');
}

interface BriefingAnalysis {
  status: '호황' | '보합' | '악화';
  summary: string;
  why: string;
  korea_impact: string;
  strong_area: string;
  caution: string;
  conclusion: string;
  is_important: boolean;
}

function normalizeStatus(raw: string): '호황' | '보합' | '악화' {
  const s = String(raw).trim();
  if (['호황', '긍정', '상승', '강세', '양호', 'good', 'positive'].includes(s)) return '호황';
  if (['악화', '하락', '약세', '위험', '부정', 'bad', 'negative'].includes(s)) return '악화';
  return '보합';
}

function validateNoHallucination(analysis: BriefingAnalysis): boolean {
  // jp: 데이터에 없는 구체적 수치 예측만 차단 (정상 분석 내용은 허용)
  const forbiddenPatterns: RegExp[] = [
    /(?:사상|역대)\s*(?:최고|최저)/,           // 사상최고/역대최저 과장
    /내일\s*(?:\d+%|\d+포인트)/,              // 내일 구체적 수치 예측
    /(?:반드시|확실히|무조건)\s*(?:상승|하락)/,  // 단정적 예측
  ];
  const allText = Object.values(analysis).join(' ');
  for (const pat of forbiddenPatterns) {
    const m = allText.match(pat);
    if (m) {
      console.warn(`[BriefingAI] 환각 패턴 감지: "${m[0]}"`);
      return false;
    }
  }
  return true;
}

function parseAIResponse(text: string): BriefingAnalysis | null {
  try {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*\})/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[1]) as Record<string, unknown>;
    const required = ['status', 'summary', 'why', 'korea_impact', 'strong_area', 'caution', 'conclusion'];
    for (const field of required) {
      if (!parsed[field]) return null;
    }
    parsed.status = normalizeStatus(String(parsed.status));
    return parsed as unknown as BriefingAnalysis;
  } catch {
    return null;
  }
}

async function callAI(
  systemPrompt: string,
  userMessage: string,
  extraWarning: string
): Promise<{ analysis: BriefingAnalysis | null; tokens: number; rawText: string }> {
  const finalSystem = extraWarning ? `${systemPrompt}\n\n${extraWarning}` : systemPrompt;
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2500,
    system: finalSystem,
    messages: [{ role: 'user', content: userMessage }],
  });
  const rawText = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text).join('');
  const tokens = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);
  const analysis = parseAIResponse(rawText);
  return { analysis, tokens, rawText };
}

export async function runBriefingAI(briefing: MarketBriefing): Promise<{
  success: boolean;
  analysis?: BriefingAnalysis;
  message: string;
}> {
  console.log(`[BriefingAI] AI 분석 시작 (briefingId=${briefing.id}, slot=${briefing.slot})`);

  const items = briefing.raw_data?.items ?? [];
  if (items.length === 0) return { success: false, message: '수집 데이터가 없습니다.' };

  const systemPrompt = await getPrompt('briefing_system');
  if (!systemPrompt) return { success: false, message: 'briefing_system 프롬프트가 없습니다.' };

  // jp: slot 정보 포함해서 프롬프트 생성
  const userMessage = await buildUserMessage(items, briefing.slot ?? '1540');

  const MAX_ATTEMPTS = 2;
  let lastFailReason = '';
  let totalTokensSum = 0;

  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const warning = attempt === 1 ? '' :
        '경고: 이전 응답에 환각 표현이 포함됐습니다. 데이터에 없는 수치나 예측은 절대 포함하지 마세요.';

      const { analysis, tokens, rawText } = await callAI(systemPrompt, userMessage, warning);
      totalTokensSum += tokens;
      console.log(`[BriefingAI] 시도 ${attempt}/${MAX_ATTEMPTS} 완료 (토큰: ${tokens})`);

      if (!analysis) {
        lastFailReason = 'AI 응답 파싱 실패';
        console.error(`[BriefingAI] 파싱 실패 (시도 ${attempt}):`, rawText.slice(0, 300));
        continue;
      }
      if (!validateNoHallucination(analysis)) {
        lastFailReason = 'AI 응답 검증 실패 (환각 패턴)';
        console.warn(`[BriefingAI] 검증 실패 (시도 ${attempt}), 재시도`);
        continue;
      }

      await updateBriefingAnalyzed(
        briefing.id, analysis.summary,
        analysis as unknown as Record<string, unknown>,
        'claude-sonnet-4-6', totalTokensSum
      );
      console.log(`[BriefingAI] 완료 - status=${analysis.status}`);
      return { success: true, analysis, message: `분석 완료 (시도 ${attempt}회)` };
    }

    await markBriefingFailed(briefing.date, briefing.slot, lastFailReason);
    return { success: false, message: lastFailReason };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[BriefingAI] API 호출 실패:', msg);
    await markBriefingFailed(briefing.date, briefing.slot, `AI API 오류: ${msg}`);
    return { success: false, message: `AI API 오류: ${msg}` };
  }
}
