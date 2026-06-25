// jp: 종목분석 스트리밍 서비스
// jp: Claude API stream:true 활용 → SSE로 프론트에 실시간 전송
import Anthropic from '@anthropic-ai/sdk';
import { Response } from 'express';
import { ENV } from '../../config/env';
import { query } from '../../config/db';
import { getStockPrice } from '../kis/kisRest.service';
import { getPrompt } from './promptStore.service';
import { searchStockNews } from '../naverNews.service';
import { safeGet, safeSetEx } from '../../config/redis';

const anthropic = new Anthropic();
const CACHE_PREFIX = 'ai:stock:';
const CACHE_TTL = 60 * 30;

interface StockRow { code: string; name: string; market: string | null; sector: string | null; }
interface DiscRow { receipt_no: string; report_name: string; category: string | null; disclosed_at: string; is_capital: boolean; is_bad: boolean; is_good: boolean; is_important: boolean; }

function resolveCategory(d: DiscRow): string {
  if (d.category) return d.category;
  if (d.is_capital) return 'capital';
  if (d.is_bad) return 'bad';
  if (d.is_good) return 'good';
  if (d.is_important) return 'important';
  return 'general';
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

// jp: SSE 헬퍼 함수
function sendSSE(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// jp: 타임아웃 래퍼 - ms 안에 안 끝나면 reject (KIS 현재가 지연 방지)
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

// jp: 스트리밍 종목 분석 메인 함수
export async function streamStockAnalysis(q: string, res: Response, userId = 'default-user', prevContext = ''): Promise<void> {
  // jp: SSE 헤더 설정
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  try {
    // jp: 1. 캐시 확인
    const cacheKey = `${CACHE_PREFIX}stream:${encodeURIComponent(q).slice(0, 80)}`;
    try {
      const cached = await safeGet(cacheKey);
      if (cached) {
        const obj = JSON.parse(cached);
        sendSSE(res, 'meta', { stockCode: obj.stockCode, stockName: obj.stockName, price: obj.price, recentDisclosures: obj.recentDisclosures, cached: true });
        sendSSE(res, 'text', { text: obj.analysis?.summary || '' });
        sendSSE(res, 'done', { analysis: obj.analysis, tokens: 0, cached: true });
        res.end();
        return;
      }
    } catch { /* 캐시 실패 무시 */ }

    // jp: 2. 종목 검색
    sendSSE(res, 'status', { message: '종목 정보 조회 중...' });

    let stock: StockRow | null = null;
    try {
      let qTrim = q.trim();
      const qLower = qTrim.toLowerCase();

      // jp: 한글↔영문 별칭 (정확/줄임/대표그룹)
      const ALIAS: Record<string, string> = {
        '네이버': 'NAVER', '네이바': 'NAVER',
        '엘지전자': 'LG전자', '엘지화학': 'LG화학', '엘지엔솔': 'LG에너지솔루션',
        '엘지에너지솔루션': 'LG에너지솔루션', '엘지이노텍': 'LG이노텍', '엘지생활건강': 'LG생활건강',
        '엘지유플러스': 'LG유플러스', '엘지디스플레이': 'LG디스플레이',
        '포스코홀딩스': 'POSCO홀딩스', '포스코': 'POSCO홀딩스', '포스코퓨처엠': '포스코퓨처엠',
        '에스케이하이닉스': 'SK하이닉스', '에스케이텔레콤': 'SK텔레콤', '에스케이이노베이션': 'SK이노베이션',
        '에스케이이터닉스': 'SK이터닉스', '케이비금융': 'KB금융', '케이티': 'KT',
        '삼전': '삼성전자', '삼바': '삼성바이오로직스', '하이닉스': 'SK하이닉스', '이터닉': 'SK이터닉스',
        'lg엔솔': 'LG에너지솔루션', 'lg엔설': 'LG에너지솔루션', '기아차': '기아', '현차': '현대차',
        '삼성': '삼성전자',
      };
      // jp: 한글발음 → 영문약자 자동변환
      const PHONETIC: [string, string][] = [
        ['엘지', 'LG'], ['에스케이', 'SK'], ['케이비', 'KB'], ['케이티', 'KT'],
        ['지에스', 'GS'], ['엘에스', 'LS'], ['씨제이', 'CJ'], ['디엘', 'DL'],
        ['에이치엠엠', 'HMM'], ['포스코', 'POSCO'],
      ];

      // jp: 0. 정식 종목명 우선 (별칭/변환 부작용 방지)
      {
        const rows = await query<StockRow>(`SELECT code, name, market, sector FROM stock_master WHERE name = $1 AND is_etf = false LIMIT 1`, [qTrim]);
        stock = rows[0] ?? null;
      }

      // jp: 1. 별칭 적용
      let aliasApplied = false;
      if (!stock) {
        if (ALIAS[qLower]) { qTrim = ALIAS[qLower]; aliasApplied = true; }
        else {
          for (const [a, r] of Object.entries(ALIAS)) {
            // jp: 더 긴 정식 종목명이 이미 질문에 있으면 별칭 건너뜀 (삼성→삼성바이오로직스 오염 방지)
            const longer = await query<{ x: number }>(
              `SELECT 1 AS x FROM stock_master WHERE is_etf=false AND char_length(name)>char_length($1) AND strpos(LOWER($2),LOWER(name))>0 LIMIT 1`,
              [a, qTrim]
            );
            if (longer[0]) continue;
            if (qLower.includes(a.toLowerCase())) { qTrim = qTrim.toLowerCase().replace(a.toLowerCase(), r); aliasApplied = true; break; }
          }
        }
      }

      // jp: 2. 한글발음 자동변환 (별칭 안 됐고, 원본이 종목명에 없을 때만)
      if (!stock && !aliasApplied) {
        for (const [ko, en] of PHONETIC) {
          if (qTrim.includes(ko)) {
            const origExists = await query<{ x: number }>(
              `SELECT 1 AS x FROM stock_master WHERE is_etf=false AND char_length(name)>=3 AND strpos(LOWER($1),LOWER(name))>0 LIMIT 1`, [qTrim]
            );
            if (origExists[0]) break;
            const converted = qTrim.replace(ko, en);
            const check = await query<{ x: number }>(
              `SELECT 1 AS x FROM stock_master WHERE is_etf=false AND (name=$1 OR strpos(LOWER($1),LOWER(name))>0) LIMIT 1`, [converted]
            );
            if (check[0]) { qTrim = converted; break; }
          }
        }
      }

      // jp: 3. 6자리 코드
      if (!stock) {
        const codeMatch = qTrim.match(/\d{6}/);
        if (codeMatch) {
          const rows = await query<StockRow>(`SELECT code, name, market, sector FROM stock_master WHERE code = $1 LIMIT 1`, [codeMatch[0]]);
          stock = rows[0] ?? null;
        }
      }
      // jp: 4. 정확한 이름
      if (!stock) {
        const rows = await query<StockRow>(`SELECT code, name, market, sector FROM stock_master WHERE name = $1 AND is_etf = false LIMIT 1`, [qTrim]);
        stock = rows[0] ?? null;
      }
      // jp: 5. 대소문자 무시 정확매칭
      if (!stock) {
        const rows = await query<StockRow>(`SELECT code, name, market, sector FROM stock_master WHERE LOWER(name) = LOWER($1) AND is_etf = false LIMIT 1`, [qTrim]);
        stock = rows[0] ?? null;
      }
      // jp: 6. 질문에 종목명 포함 (긴 것 우선, 3글자+)
      if (!stock) {
        const rows = await query<StockRow>(
          `SELECT code, name, market, sector FROM stock_master WHERE is_etf=false AND char_length(name)>=3 AND strpos(LOWER($1),LOWER(name))>0 ORDER BY char_length(name) DESC LIMIT 1`, [qTrim]);
        stock = rows[0] ?? null;
      }
      // jp: 7. 종목명이 질문에 LIKE (긴 것 우선)
      if (!stock) {
        const rows = await query<StockRow>(
          `SELECT code, name, market, sector FROM stock_master WHERE is_etf=false AND LOWER($1) LIKE '%' || LOWER(name) || '%' AND char_length(name)>=3 ORDER BY char_length(name) DESC LIMIT 1`, [qTrim]);
        stock = rows[0] ?? null;
      }
      // jp: 8. 첫 단어 부분검색
      if (!stock) {
        const fw = qTrim.split(/[\s,?!]/)[0];
        if (fw && fw.length >= 2) {
          const rows = await query<StockRow>(
            `SELECT code, name, market, sector FROM stock_master WHERE is_etf=false AND name LIKE $1 ORDER BY char_length(name) ASC LIMIT 1`, [`%${fw}%`]);
          stock = rows[0] ?? null;
        }
      }
      // jp: 9. 오타 대응 - pg_trgm 유사도
      if (!stock) {
        const fw = qTrim.split(/[\s,?!]/)[0];
        if (fw && fw.length >= 3) {
          const rows = await query<StockRow & { sim: number }>(
            `SELECT code, name, market, sector, similarity(name,$1) AS sim FROM stock_master WHERE is_etf=false AND char_length(name)>=3 AND similarity(name,$1)>0.4 ORDER BY sim DESC LIMIT 1`, [fw]);
          stock = rows[0] ?? null;
        }
      }
    } catch (err) {
      console.error('[스트리밍] 종목검색 오류:', err instanceof Error ? err.message : err);
    }

    if (!stock) {
      sendSSE(res, 'error', { message: '종목을 찾을 수 없어요. 종목명이나 코드를 확인해주세요.' });
      res.end();
      return;
    }

    // jp: 3. 병렬로 데이터 수집
    sendSSE(res, 'status', { message: '공시·뉴스 수집 중...' });
    sendSSE(res, 'meta', { stockCode: stock.code, stockName: stock.name });

    const [discs, price, news] = await Promise.allSettled([
      query<DiscRow>(
        `SELECT receipt_no, report_name, category, disclosed_at, is_capital, is_bad, is_good, is_important
           FROM disclosures WHERE stock_code = $1
          ORDER BY disclosed_at DESC LIMIT 8`,
        [stock.code]
      ),
      // jp: 현재가 - DB 캐시(stock_prices) 우선, 없으면 KIS API (3초 타임아웃)
      (async () => {
        try {
          const cached = await query<{ price: number; change: number; change_rate: number }>(
            `SELECT price, change, change_rate FROM stock_prices WHERE stock_code = $1 LIMIT 1`,
            [stock!.code]
          );
          if (cached[0]) {
            return { current: cached[0].price, change: cached[0].change, changeRate: cached[0].change_rate };
          }
        } catch { /* 무시 */ }
        // jp: DB에 없으면 KIS API (3초 제한)
        const p = await withTimeout(getStockPrice(stock!.code), 3000);
        return { current: p.price, change: p.change, changeRate: p.changeRate };
      })(),
      // jp: 뉴스 5초 타임아웃
      withTimeout(searchStockNews(stock.name, 5), 5000),
    ]);

    const discList = discs.status === 'fulfilled' ? discs.value : [];
    const priceData = price.status === 'fulfilled' ? price.value : null;
    const newsList = news.status === 'fulfilled' ? news.value : [];

    // jp: 메타 정보 전송 (종목 기본정보 + 공시목록)
    sendSSE(res, 'meta', {
      stockCode: stock.code,
      stockName: stock.name,
      price: priceData,
      recentDisclosures: discList.map(d => ({
        receiptNo: d.receipt_no,
        reportName: d.report_name,
        category: resolveCategory(d),
        disclosedAt: d.disclosed_at,
      })),
    });

    // jp: 4. AI 프롬프트 구성
    const systemPrompt = await getPrompt('stock_system');
    if (!systemPrompt) {
      sendSSE(res, 'error', { message: '프롬프트 설정 오류' });
      res.end();
      return;
    }

    const discText = discList.length > 0
      ? discList.map((d, i) => `${i + 1}.[${categoryLabel(resolveCategory(d))}] ${d.report_name} (${new Date(d.disclosed_at).toLocaleDateString('ko-KR')})`).join('\n')
      : '최근 공시 없음';

    const newsText = newsList.length > 0
      ? newsList.map((n, i) => `${i + 1}. ${n.title} (${n.source})`).join('\n')
      : '뉴스 없음';

    const priceText = priceData
      ? `현재가: ${priceData.current.toLocaleString()}원 (${priceData.changeRate > 0 ? '+' : ''}${priceData.changeRate}%)`
      : '현재가 조회 불가';

    // jp: 멀티턴 - 이전 대화 맥락이 있으면 프롬프트에 포함
    const contextBlock = prevContext
      ? `[이전 대화 맥락]\n${prevContext}\n\n위 맥락을 참고해서 후속 질문에 답해주세요. 이전에 분석한 종목과 비교하거나 연결해서 설명하면 좋아요.\n\n`
      : '';

    const userMessage = `${contextBlock}종목: ${stock.name} (${stock.code}) | 시장: ${stock.market ?? '?'} | 섹터: ${stock.sector ?? '?'}
${priceText}
최근공시:
${discText}
최근뉴스:
${newsText}

질문: ${q}`;

    // jp: 5. Claude 스트리밍
    sendSSE(res, 'status', { message: 'AI 분석 중...' });

    let fullText = '';
    let tokens = 0;

    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    // jp: 원본 청크를 그대로 전송 (프론트에서 누적 + summary 파싱)
    stream.on('text', (text) => {
      fullText += text;
      sendSSE(res, 'text', { text });
    });

    // jp: 완료 시 JSON 파싱 후 done 이벤트
    stream.on('finalMessage', async (msg) => {
      tokens = (msg.usage?.input_tokens ?? 0) + (msg.usage?.output_tokens ?? 0);

      let analysis = null;
      try {
        const clean = fullText.replace(/```json|```/g, '').trim();
        analysis = JSON.parse(clean);
      } catch {
        // jp: JSON 파싱 실패 시 텍스트로 summary만 사용
        analysis = {
          companyInfo: '',
          summary: fullText.slice(0, 100),
          detail: fullText,
          recentMoves: '',
          impact: 'unknown',
          impactLabel: '판단 불가',
          notes: [],
        };
      }

      // jp: impact 라벨 변환
      const impactMap: Record<string, string> = {
        positive: '긍정적', negative: '부정적', neutral: '중립', unknown: '판단 불가'
      };
      if (analysis) {
        analysis.impactLabel = impactMap[analysis.impact] ?? '판단 불가';
      }

      const result = {
        stockCode: stock!.code,
        stockName: stock!.name,
        price: priceData,
        recentDisclosures: discList.map(d => ({
          receiptNo: d.receipt_no,
          reportName: d.report_name,
          category: resolveCategory(d),
          disclosedAt: d.disclosed_at,
        })),
        analysis,
        tokens,
      };

      // jp: 캐시 저장
      try { await safeSetEx(cacheKey, CACHE_TTL, JSON.stringify(result)); } catch { /* 무시 */ }

      // jp: 히스토리 저장 (비동기)
      try {
        const { saveHistory } = await import('../../repositories/aiHistory.repository');
        const { ENV } = await import('../../config/env');
        void saveHistory(userId, {
          kind: 'stock',
          question: q,
          stockCode: stock!.code,
          stockName: stock!.name,
          answer: result,
          tokens,
          model: ENV.AI_DISCLOSURE.MODEL,
        });
      } catch { /* 무시 */ }

      sendSSE(res, 'done', { analysis, tokens });
      res.end();
    });

    stream.on('error', (err) => {
      console.error('[스트리밍] 오류:', err.message);
      sendSSE(res, 'error', { message: 'AI 분석 중 오류가 발생했어요.' });
      res.end();
    });

  } catch (err) {
    console.error('[스트리밍] 예외:', err instanceof Error ? err.message : err);
    sendSSE(res, 'error', { message: '분석 중 오류가 발생했어요. 다시 시도해주세요.' });
    res.end();
  }
}
