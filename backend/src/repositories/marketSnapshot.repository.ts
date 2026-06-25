// jp: market_snapshots DB 저장소 - Redis 장애/재시작 후 장마감 화면 복구용

import { query, isDbReady } from '../config/db';
import { getKstParts } from '../utils/marketTime';

export interface MarketSnapshotRow {
  stock_code: string;
  trade_date: string;
  status: string;
  last_price: unknown;
  orderbook: unknown;
  trades: unknown[];
  updated_at: string;
}

export async function upsertMarketSnapshot(params: {
  stockCode: string;
  status: string;
  lastPrice?: unknown;
  orderbook?: unknown;
  trades?: unknown[];
}): Promise<void> {
  if (!isDbReady()) return;
  const tradeDate = getKstParts().ymd;
  try {
    await query(
      `INSERT INTO market_snapshots (stock_code, trade_date, status, last_price, orderbook, trades, updated_at)
       VALUES ($1, $2::date, $3, $4::jsonb, $5::jsonb, $6::jsonb, now())
       ON CONFLICT (stock_code) DO UPDATE SET
         trade_date = EXCLUDED.trade_date,
         status = EXCLUDED.status,
         last_price = COALESCE(EXCLUDED.last_price, market_snapshots.last_price),
         orderbook = COALESCE(EXCLUDED.orderbook, market_snapshots.orderbook),
         trades = CASE
           WHEN EXCLUDED.trades IS NULL OR EXCLUDED.trades = 'null'::jsonb THEN market_snapshots.trades
           ELSE EXCLUDED.trades
         END,
         updated_at = now()`,
      [
        params.stockCode,
        tradeDate,
        params.status,
        JSON.stringify(params.lastPrice ?? null),
        JSON.stringify(params.orderbook ?? null),
        JSON.stringify(params.trades ?? null),
      ]
    );
  } catch (err) {
    console.error('[MarketSnapshot] DB 저장 실패:', err instanceof Error ? err.message : err);
  }
}

export async function getMarketSnapshotFromDb(stockCode: string): Promise<MarketSnapshotRow | null> {
  if (!isDbReady()) return null;
  try {
    const rows = await query<MarketSnapshotRow>(
      `SELECT stock_code, trade_date::text, status, last_price, orderbook, trades, updated_at::text
         FROM market_snapshots
        WHERE stock_code = $1`,
      [stockCode]
    );
    return rows[0] ?? null;
  } catch {
    return null;
  }
}
