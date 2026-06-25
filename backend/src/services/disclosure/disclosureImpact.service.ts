// disclosureImpact.service.ts
// 공시 후 주가 반응 계산
// 각 공시의 공시일/+1거래일/+5거래일 종가를 KIS 일봉으로 구해 수익률 저장
// 통계(공시종류 → 주가반응)의 토대

import { query } from '../../config/db';
import { getDailyCandles } from '../kis/kisRest.service';

interface Candle { time: number; close: number; }

// jp: 계산할 거래일 시점 (공시 후 N거래일)
const DAY_OFFSETS = [1, 5, 10, 15, 20, 25, 30] as const;

interface ImpactResult {
  base: number | null;
  prices: Record<number, number | null>;   // 거래일 offset → 종가
  returns: Record<number, number | null>;  // 거래일 offset → 수익률 %
  status: string;
}

// jp: 공시일(YYYY-MM-DD) → 유닉스 초
function dateToUnix(dateStr: string): number {
  return Math.floor(new Date(dateStr + 'T00:00:00+09:00').getTime() / 1000);
}

// jp: 일봉 배열에서 "기준일 이상인 첫 거래일" 인덱스
function findBaseIndex(candles: Candle[], disclosedUnix: number): number {
  // jp: candles는 시간 오름차순. 공시일 당일 또는 직후 첫 거래일
  for (let i = 0; i < candles.length; i++) {
    if (candles[i].time >= disclosedUnix) return i;
  }
  return -1;
}

// jp: 단일 공시의 주가 반응 계산
async function computeOneImpact(
  receiptNo: string,
  stockCode: string,
  disclosedDate: string,
  candles: Candle[]
): Promise<ImpactResult> {
  const disclosedUnix = dateToUnix(disclosedDate);
  const baseIdx = findBaseIndex(candles, disclosedUnix);

  const empty: ImpactResult = {
    base: null,
    prices: {}, returns: {},
    status: 'pending',
  };

  if (baseIdx === -1 || baseIdx >= candles.length) {
    return empty;
  }

  const base = candles[baseIdx].close;
  if (!base || base <= 0) {
    return { ...empty, status: 'failed' };
  }

  // jp: 계산할 거래일 시점들 (d1, d5, d10, d15, d20, d25, d30)
  const prices: Record<number, number | null> = {};
  const returns: Record<number, number | null> = {};
  for (const d of DAY_OFFSETS) {
    const candle = candles[baseIdx + d];
    const close = candle?.close ?? null;
    prices[d] = close;
    returns[d] = close ? ((close - base) / base) * 100 : null;
  }

  // jp: 상태 판정 - 가장 긴 시점(d30)까지 있으면 complete, d1이라도 있으면 partial
  const lastDay = DAY_OFFSETS[DAY_OFFSETS.length - 1];
  let status = 'pending';
  if (prices[lastDay] !== null) status = 'complete';
  else if (prices[1] !== null) status = 'partial';

  return { base, prices, returns, status };
}

// jp: 미완료 공시들의 주가 반응을 일괄 계산
// jp: limit으로 한 번에 처리량 제한 (KIS rate limit 고려)
export async function computePendingImpacts(limit = 30, fromDate?: string): Promise<{
  processed: number; completed: number; failed: number; message: string;
}> {
  // jp: 1) 아직 complete 안 된 공시 가져오기 (종목코드 있는 것만)
  //     - disclosure_price_impact에 없거나 status가 complete가 아닌 것
  // jp: fromDate 있으면 그 이후 공시만 (예: '2026-01-01')
  const params: (string | number)[] = [limit];
  let dateFilter = '';
  if (fromDate) {
    params.push(fromDate);
    dateFilter = `AND (d.disclosed_at AT TIME ZONE 'Asia/Seoul')::date >= $2`;
  }

  const rows = await query<{ receipt_no: string; stock_code: string; disclosed_date: string }>(
    `SELECT d.receipt_no, d.stock_code,
            (d.disclosed_at AT TIME ZONE 'Asia/Seoul')::date::text AS disclosed_date
       FROM disclosures d
       LEFT JOIN disclosure_price_impact p ON p.receipt_no = d.receipt_no
       WHERE d.stock_code IS NOT NULL
         AND d.stock_code != ''
         AND (p.receipt_no IS NULL OR p.status != 'complete')
         ${dateFilter}
       ORDER BY d.disclosed_at ASC
       LIMIT $1`,
    params
  );

  if (rows.length === 0) {
    return { processed: 0, completed: 0, failed: 0, message: '처리할 공시가 없어요' };
  }

  // jp: 2) 종목별로 그룹 (같은 종목은 일봉 1번만 조회)
  const byStock: Record<string, typeof rows> = {};
  for (const r of rows) {
    if (!byStock[r.stock_code]) byStock[r.stock_code] = [];
    byStock[r.stock_code].push(r);
  }

  let processed = 0, completed = 0, failed = 0;

  for (const [stockCode, discList] of Object.entries(byStock)) {
    let candles: Candle[];
    try {
      candles = await getDailyCandles(stockCode);
    } catch (err) {
      console.error(`[공시반응] ${stockCode} 일봉 조회 실패:`, err instanceof Error ? err.message : err);
      continue;
    }
    if (candles.length === 0) {
      console.warn(`[공시반응] ${stockCode} 일봉 없음`);
      continue;
    }

    for (const disc of discList) {
      const r = await computeOneImpact(disc.receipt_no, stockCode, disc.disclosed_date, candles);
      processed++;
      if (r.status === 'complete') completed++;
      if (r.status === 'failed') failed++;

      try {
        await query(
          `INSERT INTO disclosure_price_impact
             (receipt_no, stock_code, disclosed_date, base_price,
              price_d1, price_d5, price_d10, price_d15, price_d20, price_d25, price_d30,
              return_d1, return_d5, return_d10, return_d15, return_d20, return_d25, return_d30,
              status, computed_at, updated_at)
           VALUES ($1, $2, $3, $4,
                   $5, $6, $7, $8, $9, $10, $11,
                   $12, $13, $14, $15, $16, $17, $18,
                   $19, now(), now())
           ON CONFLICT (receipt_no) DO UPDATE SET
             base_price = $4,
             price_d1 = $5, price_d5 = $6, price_d10 = $7, price_d15 = $8, price_d20 = $9, price_d25 = $10, price_d30 = $11,
             return_d1 = $12, return_d5 = $13, return_d10 = $14, return_d15 = $15, return_d20 = $16, return_d25 = $17, return_d30 = $18,
             status = $19, computed_at = now(), updated_at = now()`,
          [disc.receipt_no, stockCode, disc.disclosed_date, r.base,
           r.prices[1], r.prices[5], r.prices[10], r.prices[15], r.prices[20], r.prices[25], r.prices[30],
           r.returns[1], r.returns[5], r.returns[10], r.returns[15], r.returns[20], r.returns[25], r.returns[30],
           r.status]
        );
      } catch (dbErr) {
        console.error(`[공시반응] ${disc.receipt_no} 저장 실패:`, dbErr instanceof Error ? dbErr.message : dbErr);
      }
    }
  }

  const msg = `${processed}건 처리 (완료 ${completed}, 실패 ${failed})`;
  console.log(`[공시반응] ${msg}`);
  return { processed, completed, failed, message: msg };
}
