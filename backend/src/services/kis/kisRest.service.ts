// jp: 한국투자증권 REST API 서비스 - 실제 API 연결

import axios, { AxiosInstance } from 'axios';
import { ENV } from '../../config/env';
import { getKisToken } from './kisAuth.service';
import { getStockMasterByCode } from '../../repositories/stockMaster.repository';
import { StockPrice, StockInfo } from '../../types';

// jp: API 호출 제한 대응 - 초당 15건
class RateLimiter {
  private queue: (() => void)[] = [];
  private running = 0;
  // jp: KIS는 "초당" 거래건수 제한(EGW00201). 동시 실행이 아니라 호출 "간격"이 핵심
  // jp: 동시 1건만 + 호출 간 300ms 강제 → 초당 약 3건으로 엄격 직렬화 (안전)
  private readonly max = 1;
  private lastStart = 0;
  private readonly minIntervalMs = 300;

  acquire(): Promise<void> {
    return new Promise(resolve => {
      this.queue.push(resolve);
      this.process();
    });
  }

  private process(): void {
    if (this.running >= this.max) return;
    const next = this.queue.shift();
    if (!next) return;

    // jp: 직전 호출과 최소 간격 보장
    const now = Date.now();
    const wait = Math.max(0, this.lastStart + this.minIntervalMs - now);
    this.lastStart = now + wait;
    this.running++;

    setTimeout(() => {
      next();
      // jp: 호출 시작 후 minInterval 뒤에 다음 처리 (간격 보장)
      setTimeout(() => { this.running--; this.process(); }, this.minIntervalMs);
    }, wait);
  }
}

const limiter = new RateLimiter();

// jp: KIS API 클라이언트 생성
async function createClient(): Promise<AxiosInstance> {
  const token = await getKisToken();
  return axios.create({
    baseURL: ENV.KIS.BASE_URL,
    headers: {
      'Content-Type':  'application/json',
      'authorization': `Bearer ${token}`,
      'appkey':        ENV.KIS.APP_KEY,
      'appsecret':     ENV.KIS.APP_SECRET,
    },
    timeout: 5000,
  });
}

// jp: mock 데이터 (API 실패 시 fallback)
function getMockPrice(code: string): StockPrice {
  const prices: Record<string, number> = {
    '000660':198500,'005930':74800,'042700':128000,
    '196170':312000,'034020':21450,'035720':38500,
    '035420':182500,'207940':876000,
  };
  const base = prices[code] || 50000;
  const change = Math.floor((Math.random() - 0.5) * base * 0.04);
  return {
    code, name: code,
    price:      base + change,
    change,
    changeRate: parseFloat(((change / base) * 100).toFixed(2)),
    volume:     Math.floor(Math.random() * 5000000),
    high:       base + Math.abs(change) + 1000,
    low:        base - Math.abs(change) - 1000,
    open:       base, prevClose: base,
    updatedAt:  new Date().toISOString(),
  };
}

// jp: 현재가 조회
// jp: 실제 KIS API: /uapi/domestic-stock/v1/quotations/inquire-price
export async function getStockPrice(code: string): Promise<StockPrice> {
  // jp: 상용 모드(USE_MOCK_DATA=false)에서는 가짜 가격 절대 금지 → 실패 시 throw (상위에서 DB fallback)
  const allowMock = ENV.USE_MOCK_DATA;

  // jp: mock 모드 체크 (키 없음)
  if (!ENV.KIS.APP_KEY || ENV.KIS.APP_KEY === 'your_app_key_here') {
    if (allowMock) return getMockPrice(code);
    throw new Error('KIS_AUTH_ERROR: API 키 미설정');
  }

  await limiter.acquire();

  try {
    const client = await createClient();
    const res = await client.get(
      '/uapi/domestic-stock/v1/quotations/inquire-price',
      {
        params: {
          fid_cond_mrkt_div_code: 'J',
          fid_input_iscd: code,
        },
        headers: { tr_id: 'FHKST01010100' },
      }
    );

    if (res.data.rt_cd !== '0') {
      console.error(`[KIS] 현재가 오류 (${code}):`, res.data.msg1);
      if (allowMock) return getMockPrice(code);
      throw new Error('KIS_API_ERROR');
    }

    const d = res.data.output;
    return {
      code,
      name:       d.hts_kor_isnm,
      price:      parseInt(d.stck_prpr),
      change:     parseInt(d.prdy_vrss),
      changeRate: parseFloat(d.prdy_ctrt),
      volume:     parseInt(d.acml_vol),
      high:       parseInt(d.stck_hgpr),
      low:        parseInt(d.stck_lwpr),
      open:       parseInt(d.stck_oprc),
      prevClose:  parseInt(d.stck_sdpr),
      updatedAt:  new Date().toISOString(),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[KIS] 현재가 조회 실패 (${code}):`, msg);
    // jp: 상용 모드는 가짜 데이터 금지 → throw (batch 서비스가 DB 마지막 정상 데이터로 fallback)
    if (allowMock) return getMockPrice(code);
    throw err;
  }
}

// jp: 종목 기본정보 조회 - 시가총액/섹터/거래량/PER 등 정확한 데이터
// jp: inquire-price 응답에 시가총액(hts_avls), 거래량, PER/PBR/EPS가 모두 들어있어 이걸 우선 사용
export async function getStockInfo(code: string): Promise<StockInfo> {
  if (!ENV.KIS.APP_KEY || ENV.KIS.APP_KEY === 'your_app_key_here') {
    return { code, name: code, market: 'KOSPI', sector: '기타', marketCap: 0, per: 0, pbr: 0, eps: 0 };
  }

  await limiter.acquire();

  try {
    const client = await createClient();
    // jp: 현재가 API에서 시가총액/거래량/PER/PBR/EPS/업종 한 번에 조회
    const res = await client.get(
      '/uapi/domestic-stock/v1/quotations/inquire-price',
      {
        params: { fid_cond_mrkt_div_code: 'J', fid_input_iscd: code },
        headers: { tr_id: 'FHKST01010100' },
      }
    );

    if (res.data.rt_cd !== '0') {
      console.error(`[KIS-종목정보] 거부 (${code}): rt_cd=${res.data.rt_cd} msg=${res.data.msg1}`);
      return { code, name: code, market: 'KOSPI', sector: '기타', marketCap: 0, per: 0, pbr: 0, eps: 0 };
    }

    const d = res.data.output;
    // jp: inquire-price 응답에는 종목명(hts_kor_isnm)이 없음 → 종목 마스터 DB에서 조회
    const master = await getStockMasterByCode(code);
    const name = master?.name || code;
    return {
      code,
      name,
      // jp: rprs_mrkt_kor_name 예: "KOSPI" / "KOSDAQ" / "KOSPI200"
      market:    (master?.market === 'KOSDAQ' || (d.rprs_mrkt_kor_name || '').includes('KOSDAQ')) ? 'KOSDAQ' : 'KOSPI',
      // jp: 업종명 (bstp_kor_isnm = 업종 한글명)
      sector:    d.bstp_kor_isnm || master?.sector || '기타',
      // jp: hts_avls = 시가총액(억원 단위) → 원 단위로 환산
      marketCap: (parseInt(d.hts_avls || '0') || 0) * 100000000,
      per:       parseFloat(d.per || '0'),
      pbr:       parseFloat(d.pbr || '0'),
      eps:       parseFloat(d.eps || '0'),
      // jp: 추가 정보
      volume:    parseInt(d.acml_vol || '0') || 0,
      high52w:   parseInt(d.w52_hgpr || '0') || 0,
      low52w:    parseInt(d.w52_lwpr || '0') || 0,
      upperLimit: parseInt(d.stck_mxpr || '0') || 0,   // jp: 상한가
      lowerLimit: parseInt(d.stck_llam || '0') || 0,   // jp: 하한가
      high52wDate: d.w52_hgpr_date || '',              // jp: 52주 최고 날짜(YYYYMMDD)
      low52wDate: d.w52_lwpr_date || '',               // jp: 52주 최저 날짜
      tradingValue: parseInt(d.acml_tr_pbmn || '0') || 0, // jp: 거래대금
    };
  } catch (err) {
    console.error(`[KIS] 종목정보 조회 실패 (${code}):`, err instanceof Error ? err.message : err);
    return { code, name: code, market: 'KOSPI', sector: '기타', marketCap: 0, per: 0, pbr: 0, eps: 0 };
  }
}

// jp: 투자자별 매매동향 (일별 개인/외국인/기관 순매수)
export interface InvestorFlowItem {
  date: string;       // jp: YYYY-MM-DD
  individual: number; // jp: 개인 순매수(주)
  foreign: number;    // jp: 외국인 순매수(주)
  institution: number;// jp: 기관 순매수(주)
  other?: number;     // jp: 기타법인/기타 순매수(주)
  individualValue?: number;
  foreignValue?: number;
  institutionValue?: number;
  otherValue?: number;
  dataStatus?: 'ESTIMATED' | 'DELAYED' | 'CONFIRMED';
}

export async function getInvestorFlow(code: string, days = 100): Promise<InvestorFlowItem[]> {
  if (!ENV.KIS.APP_KEY || ENV.KIS.APP_KEY === 'your_app_key_here') return [];
  await limiter.acquire();
  try {
    const client = await createClient();
    // jp: 종목별 외국인/기관 매매동향 (tr_id FHKST01010900)
    const res = await client.get(
      '/uapi/domestic-stock/v1/quotations/inquire-investor',
      {
        params: { fid_cond_mrkt_div_code: 'J', fid_input_iscd: code },
        headers: { tr_id: 'FHKST01010900' },
      }
    );
    if (res.data.rt_cd !== '0') return [];
    const out: InvestorFlowItem[] = (res.data.output || []).slice(0, Math.max(days, 100)).map((d: Record<string, string>) => ({
      // jp: stck_bsop_date = 영업일자, prsn_ntby_qty=개인, frgn_ntby_qty=외국인, orgn_ntby_qty=기관
      date: (d.stck_bsop_date || '').replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
      individual:  parseInt(d.prsn_ntby_qty || '0') || 0,
      foreign:     parseInt(d.frgn_ntby_qty || '0') || 0,
      institution: parseInt(d.orgn_ntby_qty || '0') || 0,
      other:       parseInt(d.etc_ntby_qty || d.etc_corp_ntby_qty || '0') || 0,
      // jp: KIS inquire-investor 응답에 금액 필드가 없는 계정/상품이 있어 기본 0으로 보관.
      // jp: 금액 기준 수급은 별도 투자자 매매동향 금액 API/거래소 백필로 채운다.
      individualValue:  parseInt(d.prsn_ntby_tr_pbmn || '0') || 0,
      foreignValue:     parseInt(d.frgn_ntby_tr_pbmn || '0') || 0,
      institutionValue: parseInt(d.orgn_ntby_tr_pbmn || '0') || 0,
      otherValue:       parseInt(d.etc_ntby_tr_pbmn || d.etc_corp_ntby_tr_pbmn || '0') || 0,
      dataStatus: 'DELAYED',
    }));
    return out;
  } catch (err) {
    console.error(`[KIS] 투자자 매매동향 실패 (${code}):`, err instanceof Error ? err.message : err);
    return [];
  }
}

// jp: 거래원 정보 (증권사별 매도/매수 상위 5 + 외국계 추정)
// jp: KIS inquire-member (tr_id FHKST01010600). 당일 현재 기준 데이터.
export interface MemberRow {
  name: string;        // jp: 거래원(증권사)명
  qty: number;         // jp: 누적 수량
  rlim: number;        // jp: 거래 비중(%)
  isGlobal: boolean;   // jp: 외국계 여부
}
export interface MemberFlowItem {
  sell: MemberRow[];   // jp: 매도 상위 5
  buy: MemberRow[];    // jp: 매수 상위 5
  globalSellQty: number;   // jp: 외국계 매도 합
  globalBuyQty: number;    // jp: 외국계 매수 합
  globalNetQty: number;    // jp: 외국계 순매수(매수-매도)
  globalSellRlim: number;  // jp: 외국계 매도 비중(%)
  accVolume: number;       // jp: 누적 거래량
}

export async function getMemberFlow(code: string): Promise<MemberFlowItem | null> {
  if (!ENV.KIS.APP_KEY || ENV.KIS.APP_KEY === "your_app_key_here") return null;
  await limiter.acquire();
  try {
    const client = await createClient();
    const res = await client.get(
      "/uapi/domestic-stock/v1/quotations/inquire-member",
      {
        params: { fid_cond_mrkt_div_code: "J", fid_input_iscd: code },
        headers: { tr_id: "FHKST01010600" },
      }
    );
    if (res.data.rt_cd !== "0") return null;
    const o = (res.data.output || [])[0] || res.data.output;
    if (!o) return null;

    const num = (v: unknown) => parseInt(String(v ?? "0"), 10) || 0;
    const flt = (v: unknown) => parseFloat(String(v ?? "0")) || 0;

    const sell: MemberRow[] = [];
    const buy: MemberRow[] = [];
    for (let i = 1; i <= 5; i++) {
      const sName = o[`seln_mbcr_name${i}`];
      if (sName) sell.push({
        name: String(sName).trim(),
        qty: num(o[`total_seln_qty${i}`]),
        rlim: flt(o[`seln_mbcr_rlim${i}`]),
        isGlobal: o[`seln_mbcr_glob_yn_${i}`] === "Y",
      });
      const bName = o[`shnu_mbcr_name${i}`];
      if (bName) buy.push({
        name: String(bName).trim(),
        qty: num(o[`total_shnu_qty${i}`]),
        rlim: flt(o[`shnu_mbcr_rlim${i}`]),
        isGlobal: o[`shnu_mbcr_glob_yn_${i}`] === "Y",
      });
    }

    return {
      sell, buy,
      globalSellQty: num(o.glob_total_seln_qty),
      globalBuyQty: num(o.glob_total_shnu_qty),
      globalNetQty: num(o.glob_ntby_qty),
      globalSellRlim: flt(o.glob_seln_rlim),
      accVolume: num(o.acml_vol),
    };
  } catch (err) {
    console.error(`[KIS] 거래원 정보 실패 (${code}):`, err instanceof Error ? err.message : err);
    return null;
  }
}

// jp: 차트 캔들 타입
export interface ChartCandle {
  time: number; open: number; high: number; low: number; close: number; volume: number;
}

// jp: 기간 코드 - D(일) W(주) M(월) Y(년)
export type KisPeriodCode = 'D' | 'W' | 'M' | 'Y';

// jp: YYYYMMDD 포맷
function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

// jp: 기간별 시세 1페이지 조회 (최대 100건)
// jp: 실제 KIS API: /uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice
async function fetchChartPage(
  code: string,
  periodCode: KisPeriodCode,
  startDate: string,
  endDate: string,
  retry: number = 2
): Promise<ChartCandle[]> {
  await limiter.acquire();
  const client = await createClient();

  let res;
  try {
    res = await client.get(
      '/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice',
      {
        params: {
          fid_cond_mrkt_div_code: 'J',
          fid_input_iscd:         code,
          fid_input_date_1:       startDate,
          fid_input_date_2:       endDate,
          fid_period_div_code:    periodCode,
          fid_org_adj_prc:        '0',
        },
        headers: { tr_id: 'FHKST03010100' },
      }
    );
  } catch (err) {
    // jp: 초당 거래건수 초과(EGW00201)면 잠깐 쉬고 재시도
    if (axios.isAxiosError(err) && err.response?.data?.msg_cd === 'EGW00201' && retry > 0) {
      await new Promise(r => setTimeout(r, 600));
      return fetchChartPage(code, periodCode, startDate, endDate, retry - 1);
    }
    throw err;
  }

  // jp: 응답 본문에 rate limit 거부가 담겨오는 경우도 재시도
  if (res.data.rt_cd !== '0') {
    if (res.data.msg_cd === 'EGW00201' && retry > 0) {
      await new Promise(r => setTimeout(r, 600));
      return fetchChartPage(code, periodCode, startDate, endDate, retry - 1);
    }
    console.error(`[KIS-차트] 거부 (${code} ${periodCode} ${startDate}~${endDate}): rt_cd=${res.data.rt_cd} msg=${res.data.msg1}`);
    return [];
  }

  // jp: output2 가 시세 배열
  const list = res.data.output2 || [];
  return list
    .filter((d: Record<string, string>) => d.stck_bsop_date && d.stck_clpr)
    .map((d: Record<string, string>) => ({
      time:   Math.floor(
        new Date(d.stck_bsop_date.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')).getTime() / 1000
      ),
      open:   parseInt(d.stck_oprc) || 0,
      high:   parseInt(d.stck_hgpr) || 0,
      low:    parseInt(d.stck_lwpr) || 0,
      close:  parseInt(d.stck_clpr) || 0,
      volume: parseInt(d.acml_vol) || 0,
    }));
}

// jp: 중복 제거 + 시간순 정렬
function dedupeSort(candles: ChartCandle[]): ChartCandle[] {
  const map = new Map<number, ChartCandle>();
  candles.forEach(c => map.set(c.time, c));
  return Array.from(map.values()).sort((a, b) => a.time - b.time);
}

// jp: 기간별 차트 조회 - 상장일부터 전체 조회 지원
export async function getChartCandles(
  code: string,
  periodCode: KisPeriodCode = 'D',
  fullHistory: boolean = false
): Promise<ChartCandle[]> {
  if (!ENV.KIS.APP_KEY || ENV.KIS.APP_KEY === 'your_app_key_here') return [];

  try {
    const today = new Date();

    // jp: 일봉 + 전체 아님 → 최근 1년 (rate limit 부담↓, 빠른 로딩). 약 250거래일
    if (!fullHistory && periodCode === 'D') {
      const start = new Date(today);
      start.setFullYear(start.getFullYear() - 1);
      const result = dedupeSort(await fetchChartPage(code, 'D', fmtDate(start), fmtDate(today)));
      console.log(`[KIS-차트] ${code} 일봉(1년) ${result.length}건`);
      return result;
    }

    // jp: 주/월/년 → 상장일부터 (넓은 범위 1회)
    if (periodCode !== 'D') {
      const start = new Date('1996-01-01');
      const result = dedupeSort(await fetchChartPage(code, periodCode, fmtDate(start), fmtDate(today)));
      console.log(`[KIS-차트] ${code} ${periodCode}봉(전체) ${result.length}건`);
      return result;
    }

    // jp: 일봉 전체 - 100건씩 과거로 페이지네이션
    const all: ChartCandle[] = [];
    let endDate = new Date(today);
    const MAX_PAGES = 40; // jp: 약 16년치 안전장치

    for (let page = 0; page < MAX_PAGES; page++) {
      const start = new Date(endDate);
      start.setDate(start.getDate() - 140);

      const candles = await fetchChartPage(code, 'D', fmtDate(start), fmtDate(endDate));
      if (candles.length === 0) break;
      all.push(...candles);

      if (candles.length < 30) break; // jp: 상장일 도달

      const oldest = candles.reduce((min, c) => (c.time < min ? c.time : min), candles[0].time);
      endDate = new Date(oldest * 1000);
      endDate.setDate(endDate.getDate() - 1);
      if (endDate.getFullYear() < 1990) break;
    }

    return dedupeSort(all);
  } catch (err) {
    // jp: axios 에러면 KIS 응답 본문까지 출력 (진단용)
    if (axios.isAxiosError(err)) {
      console.error(`[KIS] 차트 조회 실패 (${code}): status=${err.response?.status} data=${JSON.stringify(err.response?.data)}`);
    } else {
      console.error(`[KIS] 차트 조회 실패 (${code}):`, err instanceof Error ? err.message : err);
    }
    return [];
  }
}

// jp: 하위호환
export async function getDailyCandles(code: string): Promise<ChartCandle[]> {
  return getChartCandles(code, 'D', false);
}

// jp: 시장지수 조회 (KOSPI/KOSDAQ/KOSPI200)
// jp: 실제 KIS API: /uapi/domestic-stock/v1/quotations/inquire-index-price (tr_id FHPUP02100000)
// jp: 가짜 데이터 생성 금지 - 실패 시 null 반환
export interface MarketIndex {
  code: string;
  name: string;
  value: number;
  change: number;
  changeRate: number;
  updatedAt: string;
}

// jp: 업종 코드: 0001=KOSPI, 1001=KOSDAQ, 2001=KOSPI200
const INDEX_DEFS = [
  { code: '0001', name: 'KOSPI' },
  { code: '1001', name: 'KOSDAQ' },
  { code: '2001', name: 'KOSPI200' },
];

async function fetchOneIndex(code: string, name: string): Promise<MarketIndex | null> {
  await limiter.acquire();
  try {
    const client = await createClient();
    const res = await client.get(
      '/uapi/domestic-stock/v1/quotations/inquire-index-price',
      {
        params: { fid_cond_mrkt_div_code: 'U', fid_input_iscd: code },
        headers: { tr_id: 'FHPUP02100000' },
      }
    );
    if (res.data.rt_cd !== '0') {
      console.error(`[KIS] 지수 오류 (${name}):`, res.data.msg1);
      return null; // jp: 가짜 데이터 금지
    }
    const d = res.data.output;
    return {
      code, name,
      value:      parseFloat(d.bstp_nmix_prpr),
      change:     parseFloat(d.bstp_nmix_prdy_vrss),
      changeRate: parseFloat(d.bstp_nmix_prdy_ctrt),
      updatedAt:  new Date().toISOString(),
    };
  } catch (err: unknown) {
    // jp: axios 에러면 KIS 응답 본문까지 (진단용)
    if (axios.isAxiosError(err)) {
      console.error(`[KIS] 지수 조회 실패 (${name} ${code}): status=${err.response?.status} data=${JSON.stringify(err.response?.data)}`);
    } else {
      console.error(`[KIS] 지수 조회 실패 (${name} ${code}):`, err instanceof Error ? err.message : String(err));
    }
    return null; // jp: 실패 시 null (마지막 정상 데이터는 상위에서 처리)
  }
}

// jp: 전체 시장지수 조회 (순차 호출로 rate limit 회피, 실패한 것은 제외)
export async function getMarketIndices(): Promise<MarketIndex[]> {
  // jp: 키 없으면 빈 배열 (가짜 데이터 금지)
  if (!ENV.KIS.APP_KEY || ENV.KIS.APP_KEY === 'your_app_key_here') {
    return [];
  }
  const out: MarketIndex[] = [];
  for (const i of INDEX_DEFS) {
    const r = await fetchOneIndex(i.code, i.name);
    if (r) out.push(r);
  }
  return out;
}

// ============================================================
// jp: 순위분석 API - 전 종목 기반 발견 (모의투자에서도 단일 조회로 작동)
// jp: 실시간 구독(3종목 한도)과 무관하게 KIS가 계산한 순위를 REST로 받음
// ============================================================

// jp: 순위 종목 공통 타입
export interface RankedStock {
  code: string;
  name: string;
  rank: number;
  price: number;
  changeRate: number;
  volume: number;
  tradingValue: number;   // jp: 거래대금 (acml_tr_pbmn)
  volumeIncreaseRate: number; // jp: 거래량 증가율 (vol_inrt) - 거래량순위에만 있음
}

// jp: 거래량 순위 (거래대금/거래량증가율 포함) - 장중특징주/거래량급증용
// jp: 공식 스펙 FID_COND_SCR_DIV_CODE=20171, tr_id=FHPST01710000
export async function getVolumeRank(limit = 30): Promise<RankedStock[]> {
  if (!ENV.KIS.APP_KEY || ENV.KIS.APP_KEY === 'your_app_key_here') {
    throw new Error('KIS_AUTH_ERROR: API 키 미설정');
  }
  await limiter.acquire();
  try {
    const client = await createClient();
    const res = await client.get(
      '/uapi/domestic-stock/v1/quotations/volume-rank',
      {
        params: {
          FID_COND_MRKT_DIV_CODE: 'J',
          FID_COND_SCR_DIV_CODE:  '20171',
          FID_INPUT_ISCD:         '0000',  // jp: 0000=전체
          FID_DIV_CLS_CODE:       '0',
          FID_BLNG_CLS_CODE:      '0',     // jp: 0=평균거래량 기준
          FID_TRGT_CLS_CODE:      '111111111',
          FID_TRGT_EXLS_CLS_CODE: '000000',
          FID_INPUT_PRICE_1:      '0',
          FID_INPUT_PRICE_2:      '0',
          FID_VOL_CNT:            '0',
          FID_INPUT_DATE_1:       '0',
        },
        headers: { tr_id: 'FHPST01710000' },
      }
    );
    if (res.data.rt_cd !== '0') {
      console.error('[KIS] 거래량순위 오류:', res.data.msg1);
      throw new Error(`KIS_RANK_ERROR: ${res.data.msg1}`);
    }
    const list = (res.data.output || []) as Record<string, string>[];
    return list.slice(0, limit).map(d => ({
      code:               d.mksc_shrn_iscd,
      name:               d.hts_kor_isnm,
      rank:               parseInt(d.data_rank) || 0,
      price:              parseInt(d.stck_prpr) || 0,
      changeRate:         parseFloat(d.prdy_ctrt) || 0,
      volume:             parseInt(d.acml_vol) || 0,
      tradingValue:       parseInt(d.acml_tr_pbmn) || 0,
      volumeIncreaseRate: parseFloat(d.vol_inrt) || 0,
    }));
  } catch (err) {
    console.error('[KIS] 거래량순위 조회 실패:', err instanceof Error ? err.message : err);
    throw err;
  }
}

// jp: 등락률 순위 (상승률 상위) - 오늘의 급등용
// jp: 공식 스펙 fid_cond_scr_div_code=20170, tr_id=FHPST01700000
export async function getFluctuationRank(limit = 30): Promise<RankedStock[]> {
  if (!ENV.KIS.APP_KEY || ENV.KIS.APP_KEY === 'your_app_key_here') {
    throw new Error('KIS_AUTH_ERROR: API 키 미설정');
  }
  await limiter.acquire();
  try {
    const client = await createClient();
    const res = await client.get(
      '/uapi/domestic-stock/v1/ranking/fluctuation',
      {
        params: {
          fid_cond_mrkt_div_code: 'J',
          fid_cond_scr_div_code:  '20170',
          fid_input_iscd:         '0000',  // jp: 0000=전체
          fid_rank_sort_cls_code: '0',     // jp: 0=상승률순
          fid_input_cnt_1:        '0',
          fid_prc_cls_code:       '0',
          fid_input_price_1:      '',
          fid_input_price_2:      '',
          fid_vol_cnt:            '',
          fid_trgt_cls_code:      '0',
          fid_trgt_exls_cls_code: '0',
          fid_div_cls_code:       '0',
          fid_rsfl_rate1:         '',
          fid_rsfl_rate2:         '',
        },
        headers: { tr_id: 'FHPST01700000' },
      }
    );
    if (res.data.rt_cd !== '0') {
      console.error('[KIS] 등락률순위 오류:', res.data.msg1);
      throw new Error(`KIS_RANK_ERROR: ${res.data.msg1}`);
    }
    const list = (res.data.output || []) as Record<string, string>[];
    return list.slice(0, limit).map(d => ({
      code:               d.stck_shrn_iscd,
      name:               d.hts_kor_isnm,
      rank:               parseInt(d.data_rank) || 0,
      price:              parseInt(d.stck_prpr) || 0,
      changeRate:         parseFloat(d.prdy_ctrt) || 0,
      volume:             parseInt(d.acml_vol) || 0,
      tradingValue:       0,  // jp: 등락률순위 응답엔 거래대금 없음
      volumeIncreaseRate: 0,
    }));
  } catch (err) {
    console.error('[KIS] 등락률순위 조회 실패:', err instanceof Error ? err.message : err);
    throw err;
  }
}


// ============================================================
// jp: 당일 분봉 (1/3/5/10/30/60분) - getChartCandles 아래에 추가됨
// ============================================================

async function fetchMinutePage(code: string, baseTime: string, retry = 2): Promise<ChartCandle[]> {
  await limiter.acquire();
  const client = await createClient();
  let res;
  try {
    res = await client.get(
      '/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice',
      {
        params: {
          fid_etc_cls_code: '',
          fid_cond_mrkt_div_code: 'J',
          fid_input_iscd: code,
          fid_input_hour_1: baseTime || '',
          fid_pw_data_incu_yn: 'Y',
        },
        headers: { tr_id: 'FHKST03010200' },
      }
    );
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.data?.msg_cd === 'EGW00201' && retry > 0) {
      await new Promise(r => setTimeout(r, 600));
      return fetchMinutePage(code, baseTime, retry - 1);
    }
    throw err;
  }
  if (res.data.rt_cd !== '0') {
    if (res.data.msg_cd === 'EGW00201' && retry > 0) {
      await new Promise(r => setTimeout(r, 600));
      return fetchMinutePage(code, baseTime, retry - 1);
    }
    console.error(`[KIS-minute] reject (${code} ${baseTime}): ${res.data.msg1}`);
    return [];
  }
  const list = res.data.output2 || [];
  return list
    .filter((d: Record<string, string>) => d.stck_cntg_hour && d.stck_prpr)
    .map((d: Record<string, string>) => {
      const dateStr = d.stck_bsop_date || new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const timeStr = d.stck_cntg_hour;
      const iso = `${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}T${timeStr.slice(0,2)}:${timeStr.slice(2,4)}:${timeStr.slice(4,6)}+09:00`;
      return {
        time:   Math.floor(new Date(iso).getTime() / 1000),
        open:   parseInt(d.stck_oprc) || 0,
        high:   parseInt(d.stck_hgpr) || 0,
        low:    parseInt(d.stck_lwpr) || 0,
        close:  parseInt(d.stck_prpr) || 0,
        volume: parseInt(d.cntg_vol) || 0,
      };
    });
}

export async function getMinuteCandles(code: string): Promise<ChartCandle[]> {
  if (!ENV.KIS.APP_KEY || ENV.KIS.APP_KEY === 'your_app_key_here') return [];
  try {
    const all: ChartCandle[] = [];
    const seen = new Set<number>();
    let baseTime = '';
    const MAX_PAGES = 4;
    for (let page = 0; page < MAX_PAGES; page++) {
      const candles = await fetchMinutePage(code, baseTime);
      if (candles.length === 0) break;
      let added = 0;
      for (const c of candles) {
        if (!seen.has(c.time)) { seen.add(c.time); all.push(c); added++; }
      }
      if (added === 0) break;
      const oldest = candles.reduce((min, c) => (c.time < min ? c.time : min), candles[0].time);
      const oldestDate = new Date((oldest - 60) * 1000);
      // jp: KIS 분봉 조회 baseTime은 한국장 시간(HHMMSS)이어야 함. 서버가 UTC/Render여도 KST로 계산.
      const kstParts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      }).formatToParts(oldestDate);
      const part = (type: string) => kstParts.find(p => p.type === type)?.value ?? '00';
      const hh = part('hour');
      const mm = part('minute');
      const ss = part('second');
      baseTime = `${hh}${mm}${ss}`;
      if (Number(hh) < 9) break;
    }
    all.sort((a, b) => a.time - b.time);
    console.log(`[KIS-minute] ${code} today 1min ${all.length} candles`);
    return all;
  } catch (err) {
    console.error(`[KIS-minute] fail (${code}):`, err instanceof Error ? err.message : err);
    return [];
  }
}

export function aggregateMinuteCandles(candles: ChartCandle[], unit: number): ChartCandle[] {
  if (unit <= 1) return candles;
  const buckets = new Map<number, ChartCandle>();
  const unitSec = unit * 60;

  for (const c of candles) {
    // jp: 한국장 09:00 KST 기준 bucket. Unix epoch 기준으로 자르면 120/240분봉이 장 시작과 어긋남.
    const utc = new Date(c.time * 1000);
    const kstMs = utc.getTime() + 9 * 60 * 60 * 1000;
    const kst = new Date(kstMs);
    const y = kst.getUTCFullYear();
    const m = kst.getUTCMonth();
    const d = kst.getUTCDate();
    const sessionStartUtcSec = Math.floor((Date.UTC(y, m, d, 9, 0, 0) - 9 * 60 * 60 * 1000) / 1000);
    const elapsed = Math.max(0, c.time - sessionStartUtcSec);
    const bucketTime = sessionStartUtcSec + Math.floor(elapsed / unitSec) * unitSec;

    const existing = buckets.get(bucketTime);
    if (!existing) {
      buckets.set(bucketTime, { ...c, time: bucketTime });
    } else {
      existing.high = Math.max(existing.high, c.high);
      existing.low = Math.min(existing.low, c.low);
      existing.close = c.close;
      existing.volume += c.volume;
    }
  }
  return Array.from(buckets.values()).sort((a, b) => a.time - b.time);
}


// ============================================================
// jp: 매수/매도 10호가 조회 (FHKST01010200)
// ============================================================

export interface OrderbookLevel {
  price: number;   // jp: 호가
  volume: number;  // jp: 잔량
}

export interface Orderbook {
  code: string;
  ask: OrderbookLevel[];   // jp: 매도호가 (높은 가격 → 낮은 가격, 10개)
  bid: OrderbookLevel[];   // jp: 매수호가 (높은 가격 → 낮은 가격, 10개)
  totalAskVolume: number;  // jp: 매도 총잔량
  totalBidVolume: number;  // jp: 매수 총잔량
  updatedAt: string;
}

export async function getOrderbook(code: string): Promise<Orderbook | null> {
  if (!ENV.KIS.APP_KEY || ENV.KIS.APP_KEY === 'your_app_key_here') return null;

  await limiter.acquire();
  try {
    const client = await createClient();
    const res = await client.get(
      '/uapi/domestic-stock/v1/quotations/inquire-asking-price-exp-ccn',
      {
        params: {
          fid_cond_mrkt_div_code: 'J',
          fid_input_iscd: code,
        },
        headers: { tr_id: 'FHKST01010200' },
      }
    );

    if (res.data.rt_cd !== '0') {
      console.error(`[KIS-호가] 오류 (${code}):`, res.data.msg1);
      return null;
    }

    const d = res.data.output1;
    if (!d) return null;

    // jp: 매도호가 1~10 (askp1=1호가, askp10=10호가)
    const ask: OrderbookLevel[] = [];
    const bid: OrderbookLevel[] = [];
    for (let i = 1; i <= 10; i++) {
      ask.push({
        price:  parseInt(d[`askp${i}`]) || 0,
        volume: parseInt(d[`askp_rsqn${i}`]) || 0,
      });
      bid.push({
        price:  parseInt(d[`bidp${i}`]) || 0,
        volume: parseInt(d[`bidp_rsqn${i}`]) || 0,
      });
    }

    // jp: 매도호가는 보통 낮은가격(1호가)부터 → 화면 표시 위해 높은가격이 위로 오도록 역순
    ask.reverse();

    return {
      code,
      ask,  // jp: [10호가(최고)...1호가(최저, 현재가 근처)]
      bid,  // jp: [1호가(최고, 현재가 근처)...10호가(최저)]
      totalAskVolume: parseInt(d.total_askp_rsqn) || 0,
      totalBidVolume: parseInt(d.total_bidp_rsqn) || 0,
      updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error(`[KIS-호가] 조회 실패 (${code}):`, err instanceof Error ? err.message : err);
    return null;
  }
}



// ============================================================
// jp: 아래 코드를 kisRest.service.ts 파일 맨 아래에 그대로 복사해 붙여넣으세요.
// jp: 실시간 체결내역 조회 (FHKST01010300)
// ============================================================

export interface TradeTick {
  time: string;     // jp: 체결시각 HH:MM:SS
  price: number;    // jp: 체결가
  volume: number;   // jp: 체결량
  change: number;   // jp: 전일 대비
  side: 'buy' | 'sell';  // jp: 매수/매도 구분
}

export async function getTradeTicks(code: string): Promise<TradeTick[]> {
  if (!ENV.KIS.APP_KEY || ENV.KIS.APP_KEY === 'your_app_key_here') return [];

  await limiter.acquire();
  try {
    const client = await createClient();
    const res = await client.get(
      '/uapi/domestic-stock/v1/quotations/inquire-ccnl',
      {
        params: {
          fid_cond_mrkt_div_code: 'J',
          fid_input_iscd: code,
        },
        headers: { tr_id: 'FHKST01010300' },
      }
    );

    if (res.data.rt_cd !== '0') {
      console.error(`[KIS-체결] 오류 (${code}):`, res.data.msg1);
      return [];
    }

    // jp: output = 최근 체결 배열 (보통 30건)
    const list = res.data.output || [];
    return list
      .filter((d: Record<string, string>) => d.stck_cntg_hour && d.stck_prpr)
      .map((d: Record<string, string>) => {
        // jp: 시각 HHMMSS → HH:MM:SS
        const t = d.stck_cntg_hour;
        const time = `${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}`;
        const change = parseInt(d.prdy_vrss) || 0;
        // jp: 전일 대비 부호로 매수/매도 추정 (정확한 구분은 실시간 WS 필요)
        // jp: cntg_vrss_sign: 1/2=상승(매수세), 4/5=하락(매도세)
        const sign = d.prdy_vrss_sign || d.cntg_vrss_sign || '3';
        const side: 'buy' | 'sell' = (sign === '1' || sign === '2') ? 'buy' : 'sell';
        return {
          time,
          price:  parseInt(d.stck_prpr) || 0,
          volume: parseInt(d.cntg_vol) || 0,
          change,
          side,
        };
      });
  } catch (err) {
    console.error(`[KIS-체결] 조회 실패 (${code}):`, err instanceof Error ? err.message : err);
    return [];
  }
}
