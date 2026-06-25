// jp: 증권 서비스 - 백엔드 API 연결
// jp: 변경: 15min/120min/240min 분봉 단위 매핑 추가

import { Stock, StockPrice, Candle, InvestorFlow, PeriodType } from '@/types/stock';
import { apiClient } from './apiClient';

// jp: 거래원 정보 타입
export interface MemberRow {
  name: string;
  qty: number;
  rlim: number;
  isGlobal: boolean;
}
export interface MemberFlow {
  sell: MemberRow[];
  buy: MemberRow[];
  globalSellQty: number;
  globalBuyQty: number;
  globalNetQty: number;
  globalSellRlim: number;
  accVolume: number;
}


export interface IStockService {
  getStockList(): Promise<Stock[]>;
  getStock(code: string): Promise<Stock | null>;
  getStockPrice(code: string): Promise<StockPrice | null>;
  getCandles(code: string, period: PeriodType, count?: number): Promise<Candle[]>;
  getInvestorFlow(code: string, days?: number): Promise<InvestorFlow[]>;
  getMemberFlow(code: string): Promise<MemberFlow | null>;
  searchStocks(keyword: string): Promise<Stock[]>;
}

interface BackendStock {
  code: string;
  name: string;
  market: 'KOSPI' | 'KOSDAQ';
  sector: string;
  marketCap?: number;
  per?: number;
  pbr?: number;
  eps?: number;
  volume?: number;
  high52w?: number;
  low52w?: number;
  high52wDate?: string;
  low52wDate?: string;
  upperLimit?: number;
  lowerLimit?: number;
  tradingValue?: number;
}

interface BackendPrice {
  code: string;
  name?: string;
  price: number;
  change: number;
  changeRate: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
  updatedAt: string;
}

interface BackendInvestorFlow {
  date: string;
  individual: number;
  foreign: number;
  institution: number;
  other?: number;
  individualValue?: number;
  foreignValue?: number;
  institutionValue?: number;
  otherValue?: number;
  dataStatus?: 'ESTIMATED' | 'DELAYED' | 'CONFIRMED';
  financial?: number;
  insurance?: number;
  trust?: number;
  bank?: number;
  pension?: number;
  etc?: number;
}

// jp: 분봉 PeriodType → minute-candles unit 매핑 (15/120/240 추가)
const MINUTE_UNITS: Partial<Record<PeriodType, number>> = {
  '1min':   1,
  '3min':   3,
  '5min':   5,
  '10min':  10,
  '15min':  15,
  '30min':  30,
  '60min':  60,
  '120min': 120,
  '240min': 240,
};

class StockService implements IStockService {
  async getStockList(): Promise<Stock[]> {
    const backendStocks = await apiClient.get<BackendStock[]>('/api/stocks');
    return backendStocks.map(bs => ({
      code: bs.code, name: bs.name, market: bs.market, sector: bs.sector,
      price: 0, change: 0, changeRate: 0, volume: 0, isFavorite: false,
    }));
  }

  async getStock(code: string): Promise<Stock | null> {
    try {
      const info = await apiClient.get<BackendStock>(`/api/stocks/${code}`);
      let price = 0, change = 0, changeRate = 0;
      try {
        const p = await apiClient.get<BackendPrice>(`/api/stocks/${code}/price`);
        if (p && typeof p.price === 'number' && p.price > 0) {
          price = p.price; change = p.change; changeRate = p.changeRate;
        }
      } catch { /* 현재가 없으면 0 */ }
      return {
        code: info.code, name: info.name, market: info.market, sector: info.sector,
        price, change, changeRate,
        volume: info.volume ?? 0, marketCap: info.marketCap,
        per: info.per, pbr: info.pbr, eps: info.eps,
        high52w: info.high52w, low52w: info.low52w,
        high52wDate: info.high52wDate, low52wDate: info.low52wDate,
        upperLimit: info.upperLimit, lowerLimit: info.lowerLimit, tradingValue: info.tradingValue,
        isFavorite: false,
      };
    } catch {
      return null;
    }
  }

  async getStockPrice(code: string): Promise<StockPrice | null> {
    try {
      const price = await apiClient.get<BackendPrice>(`/api/stocks/${code}/price`);
      if (!price || typeof price.price !== 'number' || price.price <= 0) return null;
      return {
        code: price.code, price: price.price, change: price.change,
        changeRate: price.changeRate, volume: price.volume,
        high: price.high, low: price.low, open: price.open,
        prevClose: price.prevClose, updatedAt: price.updatedAt,
      };
    } catch {
      return null;
    }
  }

  // jp: 분봉이면 minute-candles API, 일봉+이면 candles API
  // jp: 120min/240min은 백엔드 aggregateMinuteCandles가 처리
  async getCandles(code: string, period: PeriodType): Promise<Candle[]> {
    const minuteUnit = MINUTE_UNITS[period];
    if (minuteUnit !== undefined) {
      try {
        const candles = await apiClient.get<Candle[]>(
          `/api/stocks/${code}/minute-candles?unit=${minuteUnit}`
        );
        return candles && candles.length > 0 ? candles : [];
      } catch {
        return [];
      }
    }

    // jp: 일/주/월/년봉
    const periodMap: Partial<Record<PeriodType, { kis: string; full: boolean }>> = {
      day:   { kis: 'D', full: true  },
      week:  { kis: 'W', full: true  },
      month: { kis: 'M', full: true  },
      year:  { kis: 'Y', full: true  },
    };
    const mapped = periodMap[period] ?? { kis: 'D', full: false };
    try {
      const candles = await apiClient.get<Candle[]>(
        `/api/stocks/${code}/candles?period=${mapped.kis}&full=${mapped.full}`
      );
      return candles && candles.length > 0 ? candles : [];
    } catch {
      return [];
    }
  }

  async getInvestorFlow(code: string, days: number = 20): Promise<InvestorFlow[]> {
    try {
      const flow = await apiClient.get<BackendInvestorFlow[]>(
        `/api/stocks/${code}/investor-flow?days=${days}`
      );
      if (!flow || flow.length === 0) return [];
      return flow.map(f => ({
        date: f.date,
        individual: f.individual ?? 0,
        foreign: f.foreign ?? 0,
        institution: f.institution ?? 0,
        other: f.other ?? 0,
        individualValue: f.individualValue ?? 0,
        foreignValue: f.foreignValue ?? 0,
        institutionValue: f.institutionValue ?? 0,
        otherValue: f.otherValue ?? 0,
        dataStatus: f.dataStatus ?? 'DELAYED',
        financial: f.financial ?? 0,
        insurance: f.insurance ?? 0,
        trust: f.trust ?? 0,
        bank: f.bank ?? 0,
        pension: f.pension ?? 0,
        etc: f.etc ?? 0,
      }));
    } catch {
      return [];
    }
  }

  // jp: 거래원 정보 (증권사별 매도/매수 상위 5 + 외국계 추정)
  async getMemberFlow(code: string): Promise<MemberFlow | null> {
    try {
      const data = await apiClient.get<MemberFlow | null>('/api/stocks/' + code + '/member-flow');
      return data ?? null;
    } catch {
      return null;
    }
  }

  async searchStocks(keyword: string): Promise<Stock[]> {
    if (!keyword.trim()) return [];
    try {
      const results = await apiClient.get<Array<{
        code: string; name: string; market: 'KOSPI' | 'KOSDAQ'; sector: string | null;
      }>>(`/api/stocks/search?q=${encodeURIComponent(keyword)}`);
      return results.map(r => ({
        code: r.code, name: r.name, market: r.market, sector: r.sector ?? '',
        price: 0, change: 0, changeRate: 0, volume: 0, isFavorite: false,
      }));
    } catch {
      return [];
    }
  }
}

export const stockService: IStockService = new StockService();
