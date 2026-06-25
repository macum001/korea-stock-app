// globalIndex.service.ts (확장판)
// 기존: 다우/S&P500/나스닥 3개
// 추가: SOX, VIX, 환율 5종, 원자재 5종, 해외지수 6종, 미국금리 2종, 미국반도체주 3종
// 총 ~30개 항목 → 시황 브리핑 원본 데이터

import axios from 'axios';
import { MarketIndex } from './kisRest.service';

// ─────────────────────────────────────────────
// 기존 지수 (현재가 조회용 - 관심 탭)
// ─────────────────────────────────────────────
const YAHOO_DEFS = [
  { symbol: '^DJI',  code: 'DJI', name: '다우 존스' },
  { symbol: '^GSPC', code: 'SPX', name: 'S&P 500' },
  { symbol: '^IXIC', code: 'NDQ', name: '나스닥 종합' },
];

const CODE_TO_SYMBOL: Record<string, string> = {
  DJI: '^DJI',
  SPX: '^GSPC',
  NDQ: '^IXIC',
};

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  'Accept': 'application/json',
};

// ─────────────────────────────────────────────
// 시황 브리핑용 심볼 정의
// ─────────────────────────────────────────────

export interface BriefingSymbol {
  symbol: string;
  key: string;       // raw_data JSON에 저장될 키
  name: string;      // 한국어 표시명
  category: string;  // 카테고리
  unit?: string;     // 단위 (%, $, ₩ 등)
}

// 시황 브리핑에서 수집할 전체 심볼 목록
export const BRIEFING_SYMBOLS: BriefingSymbol[] = [
  // 미국 지수
  { symbol: '^DJI',   key: 'us_dow',    name: '다우 존스',     category: 'us_index' },
  { symbol: '^GSPC',  key: 'us_sp500',  name: 'S&P 500',       category: 'us_index' },
  { symbol: '^IXIC',  key: 'us_nasdaq', name: '나스닥',         category: 'us_index' },
  { symbol: '^SOX',   key: 'us_sox',    name: 'SOX 반도체',    category: 'us_index' },
  { symbol: '^VIX',   key: 'us_vix',    name: 'VIX 공포지수',  category: 'us_index', unit: 'pt' },

  // 미국 금리
  { symbol: '^TNX',   key: 'us_bond10', name: '미 10년물 금리', category: 'us_rate',  unit: '%' },
  { symbol: '^IRX',   key: 'us_bond2',  name: '미 2년물 금리',  category: 'us_rate',  unit: '%' },

  // 환율
  { symbol: 'USDKRW=X', key: 'fx_usdkrw', name: '원/달러',      category: 'forex', unit: '₩' },
  { symbol: 'DX-Y.NYB', key: 'fx_dxy',    name: '달러 인덱스',  category: 'forex' },
  { symbol: 'USDJPY=X', key: 'fx_usdjpy', name: '달러/엔',       category: 'forex' },
  { symbol: 'EURUSD=X', key: 'fx_eurusd', name: '유로/달러',     category: 'forex' },
  { symbol: 'USDCNY=X', key: 'fx_usdcny', name: '달러/위안',     category: 'forex' },

  // 원자재
  { symbol: 'CL=F',  key: 'com_wti',    name: 'WTI 원유',     category: 'commodity', unit: '$' },
  { symbol: 'BZ=F',  key: 'com_brent',  name: '브렌트유',      category: 'commodity', unit: '$' },
  { symbol: 'GC=F',  key: 'com_gold',   name: '금',            category: 'commodity', unit: '$' },
  { symbol: 'HG=F',  key: 'com_copper', name: '구리',          category: 'commodity', unit: '$' },
  { symbol: 'NG=F',  key: 'com_gas',    name: '천연가스',       category: 'commodity', unit: '$' },

  // 해외 지수
  { symbol: '000001.SS', key: 'asia_shanghai', name: '상해 종합',    category: 'global_index' },
  { symbol: '^HSI',      key: 'asia_hangseng', name: '항셍',          category: 'global_index' },
  { symbol: '^N225',     key: 'asia_nikkei',   name: '닛케이 225',    category: 'global_index' },
  { symbol: '^STOXX50E', key: 'eu_stoxx50',    name: '유로스톡스 50', category: 'global_index' },
  { symbol: '^GDAXI',    key: 'eu_dax',        name: 'DAX',           category: 'global_index' },
  { symbol: '^FTSE',     key: 'eu_ftse',       name: 'FTSE 100',      category: 'global_index' },

  // 미국 반도체주 (한국 직결)
  { symbol: 'NVDA', key: 'stock_nvda', name: '엔비디아',  category: 'us_stock', unit: '$' },
  { symbol: 'TSM',  key: 'stock_tsm',  name: 'TSMC',      category: 'us_stock', unit: '$' },
  { symbol: 'MU',   key: 'stock_mu',   name: '마이크론',   category: 'us_stock', unit: '$' },
];

// ─────────────────────────────────────────────
// Yahoo Finance v8 단일 심볼 조회
// ─────────────────────────────────────────────

export interface YahooQuoteResult {
  price: number;
  prevClose: number;
  change: number;
  changeRate: number;
  changeRateStr: string;  // "+1.23%" 형태 (AI에게 전달할 포맷)
}

interface YahooQuote {
  price: number;
  prevClose: number;
}

async function fetchYahooQuote(symbol: string): Promise<YahooQuote | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`;
    const res = await axios.get(url, {
      params: { interval: '1d', range: '1d' },
      headers: YAHOO_HEADERS,
      timeout: 8000,
    });

    const result = res.data?.chart?.result?.[0];
    if (!result) return null;
    const meta = result.meta;
    if (!meta) return null;

    const price = typeof meta.regularMarketPrice === 'number' ? meta.regularMarketPrice : null;
    const prevClose = typeof meta.chartPreviousClose === 'number'
      ? meta.chartPreviousClose
      : (typeof meta.previousClose === 'number' ? meta.previousClose : null);

    if (price === null || prevClose === null || prevClose === 0) return null;
    return { price, prevClose };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Yahoo] 조회 실패 (${symbol}):`, msg);
    return null;
  }
}

function calcChange(price: number, prevClose: number): YahooQuoteResult {
  const change = price - prevClose;
  const changeRate = prevClose > 0 ? (change / prevClose) * 100 : 0;
  const sign = changeRate >= 0 ? '+' : '';
  return {
    price: parseFloat(price.toFixed(4)),
    prevClose: parseFloat(prevClose.toFixed(4)),
    change: parseFloat(change.toFixed(4)),
    changeRate: parseFloat(changeRate.toFixed(2)),
    changeRateStr: `${sign}${changeRate.toFixed(2)}%`,
  };
}

// ─────────────────────────────────────────────
// 기존 함수 (관심 탭용 - 변경 없음)
// ─────────────────────────────────────────────

export async function getGlobalIndices(): Promise<MarketIndex[]> {
  const results = await Promise.allSettled(
    YAHOO_DEFS.map(def => fetchYahooQuote(def.symbol).then(q => ({ def, q })))
  );

  const out: MarketIndex[] = [];
  for (const result of results) {
    if (result.status !== 'fulfilled' || !result.value.q) continue;
    const { def, q } = result.value;
    const change = q.price - q.prevClose;
    const changeRate = q.prevClose > 0 ? (change / q.prevClose) * 100 : 0;
    out.push({
      code: def.code,
      name: def.name,
      value:      parseFloat(q.price.toFixed(2)),
      change:     parseFloat(change.toFixed(2)),
      changeRate: parseFloat(changeRate.toFixed(2)),
      updatedAt:  new Date().toISOString(),
    });
  }
  return out;
}

// ─────────────────────────────────────────────
// 신규: 시황 브리핑용 전체 데이터 수집
// ─────────────────────────────────────────────

export interface BriefingDataItem {
  key: string;
  name: string;
  category: string;
  unit?: string;
  price: number;
  prevClose: number;
  change: number;
  changeRate: number;
  changeRateStr: string;
  fetchedAt: string;
}

export interface BriefingRawData {
  items: BriefingDataItem[];
  fetchedCount: number;     // 성공한 항목 수
  totalCount: number;       // 전체 시도 항목 수
  fetchedAt: string;        // 수집 시각 (ISO)
}

// 배치 크기: Yahoo는 동시 요청이 많으면 429 → 5개씩 나눠서 요청
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 300;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function collectBriefingData(): Promise<BriefingRawData> {
  console.log(`[Briefing] 시황 데이터 수집 시작 (${BRIEFING_SYMBOLS.length}개 항목)`);
  const fetchedAt = new Date().toISOString();
  const items: BriefingDataItem[] = [];

  // 배치 단위로 처리
  for (let i = 0; i < BRIEFING_SYMBOLS.length; i += BATCH_SIZE) {
    const batch = BRIEFING_SYMBOLS.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(sym => fetchYahooQuote(sym.symbol).then(q => ({ sym, q })))
    );

    for (const result of results) {
      if (result.status !== 'fulfilled' || !result.value.q) {
        if (result.status === 'fulfilled') {
          console.warn(`[Briefing] 데이터 없음: ${result.value.sym.key}`);
        }
        continue;
      }
      const { sym, q } = result.value;
      const calc = calcChange(q.price, q.prevClose);
      items.push({
        key:           sym.key,
        name:          sym.name,
        category:      sym.category,
        unit:          sym.unit,
        ...calc,
        fetchedAt,
      });
    }

    // 배치 사이 딜레이 (마지막 배치 제외)
    if (i + BATCH_SIZE < BRIEFING_SYMBOLS.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  console.log(`[Briefing] 수집 완료: ${items.length}/${BRIEFING_SYMBOLS.length}개`);
  return {
    items,
    fetchedCount: items.length,
    totalCount:   BRIEFING_SYMBOLS.length,
    fetchedAt,
  };
}

// ─────────────────────────────────────────────
// 히스토리 (기존 - 변경 없음)
// ─────────────────────────────────────────────

export interface IndexHistoryItem {
  date: string;
  close: number;
  change: number;
  changeRate: number;
}

export async function getGlobalIndexHistory(code: string, range = '10y'): Promise<IndexHistoryItem[]> {
  const symbol = CODE_TO_SYMBOL[code];
  if (!symbol) return [];

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`;
    const res = await axios.get(url, {
      params: { interval: '1d', range },
      headers: YAHOO_HEADERS,
      timeout: 10000,
    });

    const result = res.data?.chart?.result?.[0];
    if (!result) return [];
    const timestamps: number[] = result.timestamp || [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close || [];
    if (timestamps.length === 0 || closes.length === 0) return [];

    const out: IndexHistoryItem[] = [];
    let prevClose: number | null = null;

    for (let i = 0; i < timestamps.length; i++) {
      const close = closes[i];
      if (typeof close !== 'number' || isNaN(close)) continue;
      const date = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);
      const change = prevClose !== null ? close - prevClose : 0;
      const changeRate = prevClose !== null && prevClose > 0 ? (change / prevClose) * 100 : 0;
      out.push({
        date,
        close:      parseFloat(close.toFixed(2)),
        change:     parseFloat(change.toFixed(2)),
        changeRate: parseFloat(changeRate.toFixed(2)),
      });
      prevClose = close;
    }

    out.reverse();
    return out;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Yahoo] 히스토리 조회 실패 (${code}):`, msg);
    return [];
  }
}
