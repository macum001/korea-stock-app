// jp: 종목 분석 서비스 - 종목명/코드/자연어 질문 모두 처리
// jp: 흐름: 입력 → 의도 분류 → SINGLE_STOCK|SCREENING|SECTOR|GENERAL → Claude 분석
// jp: 개선: 종목명 없는 질문도 처리 (자본잠식/테마/시황/일반)
// jp: 개선: 네이버뉴스 5개 주입, 숫자 한국식 표기 규칙

import { ENV } from '../../config/env';
import { query } from '../../config/db';
import { safeGet, safeSetEx } from '../../config/redis';
import { getStockPrice } from '../kis/kisRest.service';
import { getPrompt } from './promptStore.service';
import { searchStockNews, NewsItem } from '../naverNews.service';

export interface StockAnalysisResult {
  stockCode: string;
  stockName: string;
  price: { current: number; change: number; changeRate: number } | null;
  recentDisclosures: Array<{ receiptNo: string; reportName: string; category: string; disclosedAt: string }>;
  analysis: {
    summary: string;
    detail: string;
    recentMoves: string;
    impact: string;
    impactLabel: string;
    notes: string[];
  };
  tokens?: number;
  cached?: boolean;
}

const CACHE_PREFIX = 'ai:stock:';
const CACHE_TTL = 60 * 30;

// jp: 동적 캐시 TTL - 장중 30분, 장후/주말은 길게 (주가 안 바뀜)
function getCacheTTL(): number {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const hour = kst.getUTCHours();
  const day = kst.getUTCDay();
  if (day === 0 || day === 6) return 60 * 60 * 12;
  if (hour < 9 || hour >= 16) return 60 * 60 * 6;
  return 60 * 30;
}

interface StockRow { code: string; name: string; market: string | null; sector: string | null; }
interface DiscRow { receipt_no: string; report_name: string; category: string | null; disclosed_at: string; is_capital: boolean; is_bad: boolean; is_good: boolean; is_important: boolean; }

// jp: 의도 분류 타입
type QueryIntent = 'SINGLE_STOCK' | 'SCREENING' | 'SECTOR' | 'GENERAL';

function isAiEnabled(): boolean {
  return ENV.AI_DISCLOSURE.ENABLED && !!ENV.AI_DISCLOSURE.API_KEY;
}

function categoryLabel(cat: string): string {
  switch (cat) {
    case 'capital':   return '자본변동';
    case 'good':      return '호재';
    case 'bad':       return '악재';
    case 'important': return '중요';
    default:          return '일반';
  }
}

function resolveCategory(d: DiscRow): string {
  if (d.category) return d.category;
  if (d.is_capital) return 'capital';
  if (d.is_bad) return 'bad';
  if (d.is_good) return 'good';
  if (d.is_important) return 'important';
  return 'general';
}

function impactLabelFn(impact: string): string {
  switch (impact) {
    case 'positive': return '긍정적';
    case 'negative': return '부정적';
    case 'neutral':  return '중립';
    default:         return '판단 유보';
  }
}

// jp: 의도 분류 - 키워드 기반 (Claude 호출 없이 빠르게)
function classifyIntent(q: string): QueryIntent {
  const screening = ['자본잠식', '상장폐지', '부채비율', '재무위험', '부실', '급등', '급락',
    '거래량', '신고가', '신저가', '외국인', '기관', '순매수', '순매도', '위험 종목', '위험한 종목'];
  const sector = ['반도체', 'HBM', '2차전지', '배터리', '바이오', '제약', '자동차', '전기차',
    'AI', '인공지능', '플랫폼', '관련주', '테마', '섹터', '업종'];

  if (screening.some(k => q.includes(k))) return 'SCREENING';
  if (sector.some(k => q.includes(k))) return 'SECTOR';
  return 'GENERAL';
}

const STOPWORDS = [
  '지금', '오늘', '요즘', '최근', '좀', '한번', '알려줘', '알려주세요', '어때요', '어때',
  '어떻게', '어떤지', '될까요', '될까', '사도', '팔아야', '팔까', '분석', '분석해줘', '정리', '정리해줘',
  '뉴스', '공시', '관련주', '테마', '섹터',
  '을', '를', '이', '가', '은', '는', '의', '에', '로', '으로', '와', '과', '도', '만', '에서', '까지', '이랑', '년', '월',
  '?', '!', '.', ',',
];

async function findStock(queryStr: string): Promise<StockRow | null> {
  const q = queryStr.trim();

  const codeMatch = q.match(/\d{6}/);
  if (codeMatch) {
    const rows = await query<StockRow>(`SELECT code, name, market, sector FROM stock_master WHERE code = $1 LIMIT 1`, [codeMatch[0]]);
    if (rows[0]) return rows[0];
  }

  const exact = await query<StockRow>(`SELECT code, name, market, sector FROM stock_master WHERE name = $1 LIMIT 1`, [q]);
  if (exact[0]) return exact[0];

  const reverse = await query<StockRow>(
    `SELECT code, name, market, sector
       FROM stock_master
      WHERE is_etf = false
        AND char_length(name) >= 2
        AND strpos($1, name) > 0
      ORDER BY char_length(name) DESC
      LIMIT 1`,
    [q]
  );
  if (reverse[0]) return reverse[0];

  const tokens = q.replace(/[?!.,]/g, ' ').split(/\s+/).map(t => t.trim()).filter(t => t.length >= 2 && !STOPWORDS.includes(t));
  tokens.sort((a, b) => b.length - a.length);
  for (const tok of tokens) {
    const hit = await query<StockRow>(
      `SELECT code, name, market, sector
         FROM stock_master
        WHERE is_etf = false
          AND (name = $1 OR name ILIKE $2 OR strpos($1, name) > 0)
        ORDER BY CASE WHEN name = $1 THEN 0 ELSE 1 END, char_length(name) ASC
        LIMIT 1`,
      [tok, `%${tok}%`]
    );
    if (hit[0]) return hit[0];
  }

  const like = await query<StockRow>(
    `SELECT code, name, market, sector FROM stock_master WHERE name ILIKE $1 AND is_etf = false ORDER BY length(name) ASC LIMIT 1`,
    [`%${q}%`]
  );
  return like[0] || null;
}

function formatNewsDate(pubDate: string): string {
  try {
    const d = new Date(pubDate);
    const diff = Date.now() - d.getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return '방금';
    if (hours < 24) return `${hours}시간 전`;
    return `${Math.floor(hours / 24)}일 전`;
  } catch { return pubDate; }
}

// jp: Claude 공통 호출
async function callClaudeRaw(systemPrompt: string, userPrompt: string, maxTokens = 1200): Promise<{ text: string; tokens: number } | null> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': ENV.AI_DISCLOSURE.API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: ENV.AI_DISCLOSURE.MODEL,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { content?: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } };
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text || '').join('');
    const tokens = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);
    return { text, tokens };
  } catch (err) {
    console.error('[Claude] 호출 실패:', err instanceof Error ? err.message : err);
    return null;
  }
}

// jp: JSON 파싱 + StockAnalysisResult 변환
function parseAnalysisResult(text: string, tokens: number, extra: Partial<StockAnalysisResult> = {}): StockAnalysisResult {
  try {
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    const impact = String(parsed.impact || 'unknown');
    return {
      stockCode: extra.stockCode || '',
      stockName: extra.stockName || '',
      price: extra.price || null,
      recentDisclosures: extra.recentDisclosures || [],
      analysis: {
        summary:     String(parsed.summary || ''),
        detail:      String(parsed.detail || ''),
        recentMoves: String(parsed.recentMoves || ''),
        impact,
        impactLabel: impactLabelFn(impact),
        notes:       Array.isArray(parsed.notes) ? parsed.notes.map(String) : [],
      },
      tokens,
    };
  } catch {
    return {
      stockCode: extra.stockCode || '',
      stockName: extra.stockName || '',
      price: extra.price || null,
      recentDisclosures: extra.recentDisclosures || [],
      analysis: {
        summary: '분석 결과를 파싱하지 못했어요.',
        detail: '', recentMoves: '', impact: 'unknown', impactLabel: '판단 유보', notes: [],
      },
      tokens,
    };
  }
}

const NUMBER_RULE = `⚠️ 숫자 표기 규칙 (반드시 준수):
- 한국식 단위: 1억, 3억, 1,200억, 2조 5,000억
- 영어식 절대 금지: 30M, 1.2B, 300K
- 원화: 항상 "원" 단위: 72,400원`;

const JSON_FORMAT = `JSON으로만 답해줘:
{
  "summary": "핵심 한 문장 (40~90자)",
  "detail": "자세한 설명 (150~400자)",
  "recentMoves": "최근 흐름 요약 (80~200자)",
  "impact": "positive|neutral|negative|unknown 중 하나",
  "notes": ["참고사항 1~3개"]
}`;

// ===== SINGLE_STOCK 분석 =====
async function analyzeSingleStock(
  stock: StockRow,
  price: StockAnalysisResult['price'],
  discs: DiscRow[],
  news: NewsItem[],
  userQuestion: string
): Promise<{ analysis: StockAnalysisResult['analysis']; tokens: number } | null> {
  const priceText = price
    ? `현재가: ${price.current.toLocaleString('ko-KR')}원, 전일대비: ${price.change >= 0 ? '+' : ''}${price.change.toLocaleString('ko-KR')}원(${price.changeRate >= 0 ? '+' : ''}${price.changeRate}%)`
    : '현재가 정보를 가져오지 못했습니다.';

  const discText = discs.length > 0
    ? discs.map((d, i) => `${i + 1}. [${categoryLabel(resolveCategory(d))}] ${d.report_name} (${new Date(d.disclosed_at).toLocaleDateString('ko-KR')})`).join('\n')
    : '최근 등록된 공시가 없어요.';

  const newsText = news.length > 0
    ? news.map((n, i) => `${i + 1}. ${n.title} (${n.source}, ${formatNewsDate(n.pubDate)})${n.description ? `\n   → ${n.description.slice(0, 80)}` : ''}`).join('\n')
    : '최근 뉴스를 가져오지 못했습니다.';

  const q = (userQuestion || '').trim();
  const isJustName = !q || q === stock.name || q === stock.code || q.length <= stock.name.length + 1;
  const questionBlock = isJustName
    ? `[사용자 요청]\n${stock.name}의 최근 현황을 투자자 관점으로 정리해줘`
    : `[사용자 질문]\n"${q}"\n\n위 질문에 답하되 아래 데이터를 최대한 활용해줘. 데이터에 없으면 솔직히 "확인하기 어렵다"고 말해줘.`;

  const prompt = `다음 종목의 최근 현황을 투자자 관점에서 명확하게 분석해줘.

종목명: ${stock.name} (${stock.code})
시장: ${stock.market || '-'} / 섹터: ${stock.sector || '-'}

${questionBlock}

[현재가]
${priceText}

[최근 공시 (최신순)]
${discText}

[최근 뉴스 (네이버)]
${newsText}

뉴스와 공시가 같은 방향이면 모멘텀 강조, 상충하면 불확실성 언급.
${NUMBER_RULE}

${JSON_FORMAT}`;

  const systemPrompt = await getPrompt('stock_system');
  const result = await callClaudeRaw(systemPrompt, prompt, 1500);
  if (!result) return null;

  const parsed = JSON.parse(result.text.replace(/```json|```/g, '').trim());
  const impact = String(parsed.impact || 'unknown');
  return {
    analysis: {
      summary: String(parsed.summary || ''),
      detail: String(parsed.detail || ''),
      recentMoves: String(parsed.recentMoves || ''),
      impact,
      impactLabel: impactLabelFn(impact),
      notes: Array.isArray(parsed.notes) ? parsed.notes.map(String) : [],
    },
    tokens: result.tokens,
  };
}

// ===== SCREENING 분석 (자본잠식, 급등 등) =====
async function analyzeScreening(userQuestion: string): Promise<StockAnalysisResult | null> {
  let contextData = '';

  // jp: 자본잠식/재무위험 키워드 → disclosures에서 is_capital 공시 최근 10개
  const isCapitalQuery = ['자본잠식', '상장폐지', '부실', '재무위험'].some(k => userQuestion.includes(k));
  if (isCapitalQuery) {
    try {
      const rows = await query<{ stock_name: string; stock_code: string; report_name: string; disclosed_at: string }>(
        `SELECT stock_name, stock_code, report_name, disclosed_at
           FROM disclosures
          WHERE is_capital = true
          ORDER BY disclosed_at DESC LIMIT 10`
      );
      if (rows.length > 0) {
        contextData += '\n[최근 자본변동/자본잠식 관련 공시]\n' +
          rows.map((r, i) => `${i + 1}. ${r.stock_name}(${r.stock_code}) - ${r.report_name} (${new Date(r.disclosed_at).toLocaleDateString('ko-KR')})`).join('\n');
      }
    } catch { /* 무시 */ }
  }

  // jp: 부채비율 키워드 → ai_risk_signals 있는 공시 최근 10개
  const isDebtQuery = ['부채비율', '부채', '레버리지'].some(k => userQuestion.includes(k));
  if (isDebtQuery) {
    try {
      const rows = await query<{ stock_name: string; stock_code: string; report_name: string; ai_delisting_risk: string }>(
        `SELECT stock_name, stock_code, report_name, ai_delisting_risk
           FROM disclosures
          WHERE ai_delisting_risk IS NOT NULL AND ai_delisting_risk != ''
          ORDER BY disclosed_at DESC LIMIT 10`
      );
      if (rows.length > 0) {
        contextData += '\n[상장폐지 위험 공시]\n' +
          rows.map((r, i) => `${i + 1}. ${r.stock_name}(${r.stock_code}) - ${r.report_name}: ${r.ai_delisting_risk?.slice(0, 50)}`).join('\n');
      }
    } catch { /* 무시 */ }
  }

  // jp: 뉴스도 질문 키워드로 검색
  let newsText = '';
  try {
    const newsKeyword = userQuestion.replace(/[?!.,]/g, '').slice(0, 20);
    const news = await searchStockNews(newsKeyword, 5);
    if (news.length > 0) {
      newsText = '\n[관련 뉴스]\n' + news.map((n, i) => `${i + 1}. ${n.title} (${n.source})`).join('\n');
    }
  } catch { /* 무시 */ }

  const systemPrompt = await getPrompt('stock_system');
  const result = await callClaudeRaw(
    systemPrompt,
    `다음 질문에 답해줘. 주식 스크리닝/조건 검색 질문이야.${contextData}${newsText}

[질문]
"${userQuestion}"

위 DB 데이터를 바탕으로 답해줘. 데이터가 없는 내용은 솔직히 말해줘.
${NUMBER_RULE}

${JSON_FORMAT}`,
    1200
  );

  if (!result) return null;
  return parseAnalysisResult(result.text, result.tokens);
}

// ===== SECTOR 분석 (반도체, 2차전지 등) =====
async function analyzeSector(userQuestion: string): Promise<StockAnalysisResult | null> {
  // jp: 섹터 키워드로 최근 공시 10개 + 뉴스 5개
  let contextData = '';
  try {
    const sectorKeywords = ['반도체', 'HBM', '2차전지', '배터리', '바이오', '제약', '자동차', '전기차', 'AI', '인공지능'];
    const matchedKeyword = sectorKeywords.find(k => userQuestion.includes(k)) || userQuestion.slice(0, 10);

    const rows = await query<{ stock_name: string; stock_code: string; report_name: string; disclosed_at: string }>(
      `SELECT stock_name, stock_code, report_name, disclosed_at
         FROM disclosures
        WHERE report_name ILIKE $1 OR stock_name ILIKE $1
        ORDER BY disclosed_at DESC LIMIT 10`,
      [`%${matchedKeyword}%`]
    );
    if (rows.length > 0) {
      contextData += `\n[${matchedKeyword} 관련 최근 공시]\n` +
        rows.map((r, i) => `${i + 1}. ${r.stock_name}(${r.stock_code}) - ${r.report_name} (${new Date(r.disclosed_at).toLocaleDateString('ko-KR')})`).join('\n');
    }

    const news = await searchStockNews(matchedKeyword, 5);
    if (news.length > 0) {
      contextData += '\n[관련 뉴스]\n' + news.map((n, i) => `${i + 1}. ${n.title} (${n.source}, ${formatNewsDate(n.pubDate)})`).join('\n');
    }
  } catch { /* 무시 */ }

  const systemPrompt = await getPrompt('stock_system');
  const result = await callClaudeRaw(
    systemPrompt,
    `다음 섹터/테마 관련 질문에 답해줘.${contextData}

[질문]
"${userQuestion}"

위 공시와 뉴스 데이터를 바탕으로 답해줘.
${NUMBER_RULE}

${JSON_FORMAT}`,
    1200
  );

  if (!result) return null;
  return parseAnalysisResult(result.text, result.tokens);
}

// ===== GENERAL 분석 (시황, 일반 주식 질문) =====
async function analyzeGeneral(userQuestion: string): Promise<StockAnalysisResult | null> {
  // jp: 뉴스 키워드 검색
  let newsText = '';
  try {
    const keyword = userQuestion.replace(/[?!.,\s]/g, '').slice(0, 15);
    const news = await searchStockNews(keyword, 3);
    if (news.length > 0) {
      newsText = '\n[관련 뉴스]\n' + news.map((n, i) => `${i + 1}. ${n.title} (${n.source})`).join('\n');
    }
  } catch { /* 무시 */ }

  const systemPrompt = await getPrompt('stock_system');
  const result = await callClaudeRaw(
    systemPrompt,
    `다음 주식 관련 질문에 답해줘. 일반적인 시황/투자 관련 질문이야.${newsText}

[질문]
"${userQuestion}"

${NUMBER_RULE}

${JSON_FORMAT}`,
    1000
  );

  if (!result) return null;
  return parseAnalysisResult(result.text, result.tokens);
}

// ===== 메인 분석 함수 =====
export async function analyzeStock(queryStr: string): Promise<StockAnalysisResult | null> {
  const q = queryStr.trim();

  // jp: 1. 종목 검색 시도
  const stock = await findStock(q);

  // jp: 2. 종목 찾으면 SINGLE_STOCK 분석
  if (stock) {
    const qSlug = q === stock.name || q === stock.code ? '' : ':' + encodeURIComponent(q).slice(0, 80);
    const cacheKey = `${CACHE_PREFIX}${stock.code}${qSlug}`;

    try {
      const cached = await safeGet(cacheKey);
      if (cached) {
        const obj = JSON.parse(cached) as StockAnalysisResult;
        obj.cached = true; obj.tokens = 0;
        return obj;
      }
    } catch { /* 무시 */ }

    let discs: DiscRow[] = [];
    try {
      discs = await query<DiscRow>(
        `SELECT receipt_no, report_name, category, disclosed_at, is_capital, is_bad, is_good, is_important
           FROM disclosures WHERE stock_code = $1
          ORDER BY disclosed_at DESC LIMIT 8`,
        [stock.code]
      );
    } catch { /* 무시 */ }

    let price: StockAnalysisResult['price'] = null;
    try {
      const p = await getStockPrice(stock.code);
      price = { current: p.price, change: p.change, changeRate: p.changeRate };
    } catch { /* 무시 */ }

    let news: NewsItem[] = [];
    try { news = await searchStockNews(stock.name, 5); } catch { /* 무시 */ }

    let analysis: StockAnalysisResult['analysis'];
    let tokens = 0;

    if (isAiEnabled()) {
      const ai = await analyzeSingleStock(stock, price, discs, news, q);
      if (ai) { analysis = ai.analysis; tokens = ai.tokens; }
      else { analysis = fallbackAnalysis(discs); }
    } else {
      analysis = fallbackAnalysis(discs);
    }

    const result: StockAnalysisResult = {
      stockCode: stock.code,
      stockName: stock.name,
      price,
      recentDisclosures: discs.map(d => ({
        receiptNo: d.receipt_no, reportName: d.report_name,
        category: resolveCategory(d), disclosedAt: d.disclosed_at,
      })),
      analysis, tokens,
    };

    try { await safeSetEx(cacheKey, getCacheTTL(), JSON.stringify(result)); } catch { /* 무시 */ }
    return result;
  }

  // jp: 3. 종목 없으면 의도 분류 후 처리
  if (!isAiEnabled()) {
    return {
      stockCode: '', stockName: '', price: null, recentDisclosures: [],
      analysis: {
        summary: '종목명이나 6자리 코드를 포함해서 질문해주세요.',
        detail: '예: "삼성전자 지금 어때?", "005930 최근 공시 알려줘"',
        recentMoves: '', impact: 'unknown', impactLabel: '판단 유보',
        notes: ['AI 분석이 비활성화 상태예요.'],
      }, tokens: 0,
    };
  }

  const intent = classifyIntent(q);
  console.log(`[analyzeStock] 종목 없음 → 의도: ${intent}, 질문: ${q}`);

  // jp: 의도별 캐시 (30분)
  const intentCacheKey = `${CACHE_PREFIX}intent:${intent}:${encodeURIComponent(q).slice(0, 80)}`;
  try {
    const cached = await safeGet(intentCacheKey);
    if (cached) {
      const obj = JSON.parse(cached) as StockAnalysisResult;
      obj.cached = true; obj.tokens = 0;
      return obj;
    }
  } catch { /* 무시 */ }

  let result: StockAnalysisResult | null = null;
  if (intent === 'SCREENING') result = await analyzeScreening(q);
  else if (intent === 'SECTOR') result = await analyzeSector(q);
  else result = await analyzeGeneral(q);

  if (!result) return null;

  try { await safeSetEx(intentCacheKey, getCacheTTL(), JSON.stringify(result)); } catch { /* 무시 */ }
  return result;
}

function fallbackAnalysis(discs: DiscRow[]): StockAnalysisResult['analysis'] {
  return {
    summary: discs.length > 0 ? '최근 공시가 있었습니다. 자세한 내용은 확인해주세요.' : '최근 관련 공시·뉴스가 없어요.',
    detail: '',
    recentMoves: discs.length > 0 ? discs.slice(0, 3).map(d => d.report_name).join(', ') : '최근 관련 공시·뉴스가 없어요.',
    impact: 'unknown', impactLabel: '판단 유보', notes: [],
  };
}
