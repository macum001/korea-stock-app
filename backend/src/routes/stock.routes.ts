// jp: 증권 API 라우터
// jp: 변경: /candles 라우트가 DB(stock_daily_candles)를 먼저 조회 후 KIS fallback
// jp:       DB에 데이터 있으면 KIS API 호출 없음 → 빠르고 rate limit 절약

import { Router, Request, Response } from 'express';
import { getStockPrice, getStockInfo, getChartCandles, getInvestorFlow, getMemberFlow, KisPeriodCode } from '../services/kis/kisRest.service';
import { getCachedStockPrice } from '../services/cache/stockCache.service';
import { getBatchPrices, getBatchPricesFromDbOnly } from '../services/stock/stockBatchPrice.service';
import { logPerf, startTimer } from '../services/performance/performanceLogger.service';
import { getDisclosuresByStockCode } from '../repositories/disclosure.repository';
import { searchStockMaster, getStocksByCodes } from '../repositories/stockMaster.repository';
import { getDailyCandlesFromDb, saveDailyCandles } from '../repositories/dailyCandle.repository';
import { getInvestorFlowsFromDb, saveInvestorFlows } from '../repositories/investorFlow.repository';
import { MAJOR_STOCK_CODES_UNIQUE } from '../data/majorStocks';
import { isDbReady } from '../config/db';
import { safeGet, safeSetEx } from '../config/redis';
import { validateStockCodeParam } from '../middleware/validateInput';
import { ApiResponse } from '../types';

const router = Router();

const MOCK_LIST = [
  { code: '000660', name: 'SK하이닉스',    market: 'KOSPI',  sector: '반도체' },
  { code: '005930', name: '삼성전자',       market: 'KOSPI',  sector: '반도체' },
  { code: '042700', name: '한미반도체',     market: 'KOSDAQ', sector: '반도체' },
  { code: '196170', name: '알테오젠',       market: 'KOSDAQ', sector: '바이오' },
  { code: '034020', name: '두산에너빌리티', market: 'KOSPI',  sector: '에너지' },
  { code: '035720', name: '카카오',         market: 'KOSDAQ', sector: 'IT'     },
  { code: '035420', name: 'NAVER',          market: 'KOSPI',  sector: 'IT'     },
  { code: '207940', name: '삼성바이오로직스', market: 'KOSPI', sector: '바이오' },
];

// jp: 종목 목록
router.get('/', async (_req: Request, res: Response) => {
  try {
    const major = await getStocksByCodes(MAJOR_STOCK_CODES_UNIQUE);
    if (major.length > 0) {
      const data = major.map(s => ({
        code: s.code, name: s.name, market: s.market, sector: s.sector ?? '',
      }));
      return res.json({ success: true, data } as ApiResponse);
    }
  } catch { /* fallthrough to mock */ }
  res.json({ success: true, data: MOCK_LIST } as ApiResponse);
});

// jp: 배치 주가 조회
router.get('/prices', async (req: Request, res: Response) => {
  const codesParam = (req.query.codes as string) || '';
  const codes = codesParam.split(',').map(c => c.trim()).filter(Boolean).slice(0, 30);

  if (codes.length === 0) return res.json({ success: true, data: [] } as ApiResponse);

  const done = startTimer();
  try {
    const data = await getBatchPrices(codes);
    const anyStale = data.some(d => d.stale);
    logPerf({ api: 'batchPrices', totalMs: done(), stale: anyStale });
    res.json({ success: true, data, stale: anyStale } as ApiResponse);
  } catch {
    const fallback = await getBatchPricesFromDbOnly(codes);
    logPerf({ api: 'batchPrices', totalMs: done(), stale: true, fallback: true });
    res.json({ success: true, data: fallback, stale: true, staleReason: 'EXTERNAL_UNAVAILABLE' } as ApiResponse);
  }
});

// jp: 종목 검색
router.get('/search', async (req: Request, res: Response) => {
  const q = ((req.query.q as string) || (req.query.query as string) || '').trim();
  if (!q) return res.json({ success: true, data: [] } as ApiResponse);
  try {
    const results = await searchStockMaster(q, 30);
    res.json({ success: true, data: results } as ApiResponse);
  } catch {
    res.json({ success: true, data: [] } as ApiResponse);
  }
});

// jp: 종목 상세 정보
router.get('/:code', validateStockCodeParam, async (req: Request, res: Response) => {
  try {
    const info = await getStockInfo(req.params.code);
    res.json({ success: true, data: info } as ApiResponse);
  } catch {
    res.status(500).json({ success: false, error: '종목 정보를 불러오지 못했습니다.' } as ApiResponse);
  }
});

// jp: 현재가
router.get('/:code/price', validateStockCodeParam, async (req: Request, res: Response) => {
  const { code } = req.params;
  try {
    const cached = await getCachedStockPrice(code);
    if (cached) return res.json({ success: true, data: cached, fromCache: true });

    const batch = await getBatchPrices([code]);
    if (batch.length > 0) {
      const item = batch[0];
      return res.json({ success: true, data: item, stale: item.stale });
    }
    res.json({ success: true, data: null, stale: true } as ApiResponse);
  } catch {
    res.json({ success: true, data: null, stale: true } as ApiResponse);
  }
});

// jp: 종목 상세 부트스트랩 (현재가+차트+공시 한번에)
router.get('/:code/detail-bootstrap', validateStockCodeParam, async (req: Request, res: Response) => {
  const { code } = req.params;
  const done = startTimer();
  try {
    let price = await getCachedStockPrice(code);
    if (!price) {
      try { price = await getStockPrice(code); } catch { price = null; }
    }

    let candles: unknown[] = [];
    try {
      // jp: DB 먼저 조회 (백필 데이터 있으면 즉시 반환)
      if (isDbReady()) {
        const dbCandles = await getDailyCandlesFromDb(code, 'D', 1000);
        if (dbCandles.length > 0) {
          candles = dbCandles;
        } else {
          // jp: DB 없으면 KIS + 백그라운드 저장
          const fresh = await getChartCandles(code, 'D', false);
          candles = fresh;
          if (fresh.length > 0) void saveDailyCandles(code, fresh, 'D');
        }
      } else {
        const candleKey = `chart:${code}:D:recent`;
        const cached = await safeGet(candleKey);
        if (cached) candles = JSON.parse(cached);
        else {
          const fresh = await getChartCandles(code, 'D', false);
          candles = fresh;
          if (fresh.length > 0) void safeSetEx(candleKey, 180, JSON.stringify(fresh));
        }
      }
    } catch { /* 차트 실패 시 빈 배열 */ }

    let disclosures: unknown[] = [];
    if (isDbReady()) {
      try { disclosures = await getDisclosuresByStockCode(code, 3); } catch { /* 빈 배열 */ }
    }

    logPerf({ api: 'detailBootstrap', totalMs: done(), stale: !price });
    res.json({ success: true, data: { price, candles, disclosures, stale: !price } } as ApiResponse);
  } catch {
    logPerf({ api: 'detailBootstrap', totalMs: done(), stale: true, fallback: true });
    res.json({ success: true, data: { price: null, candles: [], disclosures: [], stale: true } } as ApiResponse);
  }
});

// jp: 일/주/월/년봉 조회
// jp: 변경: DB(stock_daily_candles) 먼저 → 없으면 KIS API + 백그라운드 저장
router.get('/:code/candles', validateStockCodeParam, async (req: Request, res: Response) => {
  const { code } = req.params;
  const periodParam = (req.query.period as string)?.toUpperCase() || 'D';
  const full = req.query.full === 'true';

  const validPeriods: KisPeriodCode[] = ['D', 'W', 'M', 'Y'];
  const period = (validPeriods.includes(periodParam as KisPeriodCode) ? periodParam : 'D') as KisPeriodCode;

  try {
    // jp: 1. DB 조회 (백필 데이터 있으면 즉시 반환 — KIS API 호출 없음)
    if (isDbReady()) {
      const limit = period === 'D' ? 3000 : 1000; // jp: 일봉 최대 3000개(약 12년)
      const dbCandles = await getDailyCandlesFromDb(code, period, limit);
      if (dbCandles.length > 0) {
        console.log(`[candles] ${code} ${period} DB에서 ${dbCandles.length}개 반환`);
        return res.json({ success: true, data: dbCandles, fromDb: true } as ApiResponse);
      }
    }

    // jp: 2. DB 없으면 Redis 캐시 확인
    const cacheKey = `chart:${code}:${period}:${full ? 'full' : 'recent'}`;
    const cached = await safeGet(cacheKey);
    if (cached) {
      return res.json({ success: true, data: JSON.parse(cached), fromCache: true } as ApiResponse);
    }

    // jp: 3. KIS API 조회 + DB 저장 (백그라운드)
    const candles = await getChartCandles(code, period, full);

    if (candles.length > 0) {
      // jp: Redis 캐시 (일봉 3분, 주/월/년봉 1시간)
      const ttl = period === 'D' ? 180 : 3600;
      await safeSetEx(cacheKey, ttl, JSON.stringify(candles));

      // jp: DB 백그라운드 저장 (다음 요청부터 DB에서 빠르게 반환)
      if (isDbReady()) {
        void saveDailyCandles(code, candles, period).then(n => {
          console.log(`[candles] ${code} ${period} DB 저장 ${n}개`);
        });
      }
    }

    res.json({ success: true, data: candles } as ApiResponse);
  } catch {
    res.status(500).json({ success: false, error: '차트 데이터를 불러오지 못했습니다.' } as ApiResponse);
  }
});

// jp: 거래원 정보 (증권사별 매도/매수 상위 5 + 외국계 추정) - 당일 실시간
router.get('/:code/member-flow', validateStockCodeParam, async (req, res) => {
  try {
    const code = req.params.code;
    const cacheKey = 'member:' + code;
    const cached = await safeGet(cacheKey);
    if (cached) return res.json({ success: true, data: JSON.parse(cached), cached: true });

    const data = await getMemberFlow(code);
    if (data) {
      await safeSetEx(cacheKey, 60, JSON.stringify(data));
      return res.json({ success: true, data });
    }
    res.json({ success: true, data: null });
  } catch (err) {
    console.error('[MemberFlow] 라우트 실패:', err instanceof Error ? err.message : err);
    res.status(500).json({ success: false, error: '거래원 정보를 불러오지 못했어요.' });
  }
});

// jp: 투자자별 수급 (개인/외국인/기관)
// jp: 체결 tick 계산 금지. DB 백필/저장 데이터 먼저 → 부족하면 KIS 투자자 API fallback.
router.get('/:code/investor-flow', validateStockCodeParam, async (req: Request, res: Response) => {
  const { code } = req.params;
  const days = Math.min(Math.max(parseInt((req.query.days as string) || '20', 10) || 20, 1), 3650);
  const cacheKey = `investor:${code}:${days}`;
  try {
    const cached = await safeGet(cacheKey);
    if (cached) return res.json({ success: true, data: JSON.parse(cached), fromCache: true } as ApiResponse);

    const dbFlow = await getInvestorFlowsFromDb(code, days);
    // jp: 10년치/장마감 확정 수급은 DB가 source of truth. 요청 기간의 80% 이상 있으면 DB 반환.
    if (dbFlow.length >= Math.min(days, 20) || (days > 30 && dbFlow.length >= Math.floor(days * 0.8))) {
      await safeSetEx(cacheKey, 600, JSON.stringify(dbFlow));
      return res.json({ success: true, data: dbFlow, fromDb: true } as ApiResponse);
    }

    const flow = await getInvestorFlow(code, Math.min(days, 100));
    if (flow.length > 0) {
      void saveInvestorFlows(flow.flatMap(f => [
        { stockCode: code, tradeDate: f.date, investorType: 'individual' as const, netBuyVolume: f.individual, netBuyValue: f.individualValue ?? 0, dataStatus: f.dataStatus ?? 'DELAYED' as const },
        { stockCode: code, tradeDate: f.date, investorType: 'foreigner' as const, netBuyVolume: f.foreign, netBuyValue: f.foreignValue ?? 0, dataStatus: f.dataStatus ?? 'DELAYED' as const },
        { stockCode: code, tradeDate: f.date, investorType: 'institution' as const, netBuyVolume: f.institution, netBuyValue: f.institutionValue ?? 0, dataStatus: f.dataStatus ?? 'DELAYED' as const },
        { stockCode: code, tradeDate: f.date, investorType: 'other_corporation' as const, netBuyVolume: f.other ?? 0, netBuyValue: f.otherValue ?? 0, dataStatus: f.dataStatus ?? 'DELAYED' as const },
      ]));
      await safeSetEx(cacheKey, 300, JSON.stringify(flow));
      return res.json({ success: true, data: flow, source: 'kis_fallback' } as ApiResponse);
    }

    res.json({ success: true, data: dbFlow, fromDb: dbFlow.length > 0 } as ApiResponse);
  } catch (err) {
    console.error('[InvestorFlow] 라우트 실패:', err instanceof Error ? err.message : err);
    res.json({ success: true, data: [] } as ApiResponse);
  }
});

export default router;
