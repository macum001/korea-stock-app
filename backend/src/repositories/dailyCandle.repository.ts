// jp: 일봉 캔들 DB repository
// jp: minute_candles와 동일한 패턴 — upsert, 배치 저장, 기간별 조회

import { query, isDbReady } from '../config/db';

export interface DailyCandle {
  time: number;       // jp: unix timestamp (KST 00:00 기준)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tradeValue?: number; // jp: 거래대금
}

interface DailyCandleRow {
  candle_date: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: string;
  trade_value: string;
}

// jp: YYYYMMDD → unix timestamp (KST 00:00 = UTC 전날 15:00)
function dateIntToTimestamp(dateInt: number): number {
  const s = String(dateInt);
  const iso = `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T00:00:00+09:00`;
  return Math.floor(new Date(iso).getTime() / 1000);
}

// jp: unix timestamp → YYYYMMDD 정수
function timestampToDateInt(ts: number): number {
  const d = new Date((ts + 9 * 3600) * 1000); // jp: KST 변환
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return parseInt(`${y}${m}${day}`);
}

// jp: 일봉 배치 저장 (upsert)
export async function saveDailyCandles(
  stockCode: string,
  candles: DailyCandle[],
  period: 'D' | 'W' | 'M' | 'Y' = 'D'
): Promise<number> {
  if (!isDbReady() || candles.length === 0) return 0;

  try {
    const BATCH = 500;
    let saved = 0;

    for (let i = 0; i < candles.length; i += BATCH) {
      const chunk = candles.slice(i, i + BATCH);
      const values: string[] = [];
      const params: unknown[] = [];
      let p = 1;

      for (const c of chunk) {
        const dateInt = timestampToDateInt(c.time);
        values.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
        params.push(
          stockCode, dateInt, period,
          c.open, c.high, c.low, c.close,
          c.volume, c.tradeValue ?? 0
        );
      }

      await query(
        `INSERT INTO stock_daily_candles
           (stock_code, candle_date, period, open, high, low, close, volume, trade_value)
         VALUES ${values.join(',')}
         ON CONFLICT (stock_code, candle_date, period) DO UPDATE SET
           high        = GREATEST(stock_daily_candles.high, EXCLUDED.high),
           low         = LEAST(stock_daily_candles.low, EXCLUDED.low),
           close       = EXCLUDED.close,
           volume      = EXCLUDED.volume,
           trade_value = EXCLUDED.trade_value,
           updated_at  = now()`,
        params
      );
      saved += chunk.length;
    }

    console.log(`[DailyCandle] ${stockCode} ${period}봉 ${saved}개 저장`);
    return saved;
  } catch (err) {
    console.error('[DailyCandle] 저장 실패:', err instanceof Error ? err.message : err);
    return 0;
  }
}

// jp: 일봉 조회 (최근 N개 or 전체)
export async function getDailyCandlesFromDb(
  stockCode: string,
  period: 'D' | 'W' | 'M' | 'Y' = 'D',
  limit = 3000
): Promise<DailyCandle[]> {
  if (!isDbReady()) return [];

  try {
    const rows = await query<DailyCandleRow>(
      `SELECT candle_date, open, high, low, close, volume, trade_value
         FROM stock_daily_candles
        WHERE stock_code = $1 AND period = $2
        ORDER BY candle_date DESC
        LIMIT $3`,
      [stockCode, period, limit]
    );

    return rows
      .map(r => ({
        time:       dateIntToTimestamp(Number(r.candle_date)),
        open:       r.open,
        high:       r.high,
        low:        r.low,
        close:      r.close,
        volume:     Number(r.volume),
        tradeValue: Number(r.trade_value),
      }))
      .sort((a, b) => a.time - b.time);
  } catch (err) {
    console.error('[DailyCandle] 조회 실패:', err instanceof Error ? err.message : err);
    return [];
  }
}

// jp: 가장 오래된 캔들 날짜 확인 (백필 진행 상황 체크)
export async function getOldestDailyCandleDate(
  stockCode: string,
  period: 'D' | 'W' | 'M' | 'Y' = 'D'
): Promise<number | null> {
  if (!isDbReady()) return null;
  try {
    const rows = await query<{ min_date: number }>(
      `SELECT MIN(candle_date) AS min_date
         FROM stock_daily_candles
        WHERE stock_code = $1 AND period = $2`,
      [stockCode, period]
    );
    return rows[0]?.min_date ? Number(rows[0].min_date) : null;
  } catch {
    return null;
  }
}

// jp: 종목별 일봉 개수 (백필 상태 확인)
export async function getDailyCandleCount(
  stockCode: string,
  period: 'D' | 'W' | 'M' | 'Y' = 'D'
): Promise<number> {
  if (!isDbReady()) return 0;
  try {
    const rows = await query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt
         FROM stock_daily_candles
        WHERE stock_code = $1 AND period = $2`,
      [stockCode, period]
    );
    return parseInt(rows[0]?.cnt ?? '0', 10);
  } catch {
    return 0;
  }
}
