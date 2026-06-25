// jp: 분봉 캔들 DB 저장/조회 repository
// jp: 1분봉 원본을 저장하고, 조회 시 시간 범위로 가져옴

import { query, isDbReady } from '../config/db';

export interface MinuteCandleRow {
  candle_time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// jp: ChartCandle 형식 (프론트/KIS와 동일)
export interface MinuteCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// jp: 분봉 일괄 저장 (upsert - 중복 시 갱신)
export async function saveMinuteCandles(stockCode: string, candles: MinuteCandle[]): Promise<number> {
  if (!isDbReady() || candles.length === 0) return 0;

  try {
    // jp: 다중 행 INSERT ... ON CONFLICT (배치)
    const BATCH = 500;
    let saved = 0;

    for (let i = 0; i < candles.length; i += BATCH) {
      const chunk = candles.slice(i, i + BATCH);
      // jp: VALUES ($1,$2,...) 동적 생성
      const values: string[] = [];
      const params: unknown[] = [];
      let p = 1;
      for (const c of chunk) {
        values.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
        params.push(stockCode, c.time, c.open, c.high, c.low, c.close, c.volume);
      }

      await query(
        `INSERT INTO minute_candles (stock_code, candle_time, open, high, low, close, volume)
         VALUES ${values.join(',')}
         ON CONFLICT (stock_code, candle_time) DO UPDATE SET
           high = GREATEST(minute_candles.high, EXCLUDED.high),
           low = LEAST(minute_candles.low, EXCLUDED.low),
           close = EXCLUDED.close,
           volume = EXCLUDED.volume`,
        params
      );
      saved += chunk.length;
    }
    return saved;
  } catch (err) {
    console.error('[MinuteCandle] 저장 실패:', err instanceof Error ? err.message : err);
    return 0;
  }
}

// jp: 분봉 조회 (최근 N개, 시간순)
export async function getMinuteCandlesFromDb(stockCode: string, limit = 500): Promise<MinuteCandle[]> {
  if (!isDbReady()) return [];

  try {
    // jp: 최근 limit개를 시간 역순으로 가져온 뒤 다시 정순 정렬
    const rows = await query<MinuteCandleRow>(
      `SELECT candle_time, open, high, low, close, volume
         FROM minute_candles
        WHERE stock_code = $1
        ORDER BY candle_time DESC
        LIMIT $2`,
      [stockCode, limit]
    );

    return rows
      .map(r => ({
        time:   Number(r.candle_time),
        open:   r.open,
        high:   r.high,
        low:    r.low,
        close:  r.close,
        volume: Number(r.volume),
      }))
      .sort((a, b) => a.time - b.time);
  } catch (err) {
    console.error('[MinuteCandle] 조회 실패:', err instanceof Error ? err.message : err);
    return [];
  }
}

// jp: 종목의 분봉 데이터 개수 (워밍 여부 판단용)
export async function getMinuteCandleCount(stockCode: string): Promise<number> {
  if (!isDbReady()) return 0;
  try {
    const rows = await query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM minute_candles WHERE stock_code = $1`,
      [stockCode]
    );
    return parseInt(rows[0]?.cnt ?? '0', 10);
  } catch {
    return 0;
  }
}

// jp: 오래된 분봉 정리 (예: 7일 이전 삭제 - DB 비대화 방지)
export async function cleanupOldMinuteCandles(daysToKeep = 7): Promise<void> {
  if (!isDbReady()) return;
  try {
    const cutoff = Math.floor(Date.now() / 1000) - daysToKeep * 86400;
    await query(`DELETE FROM minute_candles WHERE candle_time < $1`, [cutoff]);
  } catch { /* 무시 */ }
}
