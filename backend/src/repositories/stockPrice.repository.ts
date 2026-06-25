// jp: 현재가 DB 저장소 - 마지막 정상 데이터(stale fallback)용
// jp: 외부 API 성공 시 저장, 실패 시 여기서 마지막 정상 가격 조회

import { query, isDbReady } from '../config/db';
import { StockPrice } from '../types';

// jp: 정상 가격 저장 (외부 API 성공 시) - 종목당 1행 UPSERT (무한 증가 방지)
export async function saveStockPrice(p: StockPrice): Promise<void> {
  if (!isDbReady()) return;
  try {
    await query(
      `INSERT INTO stock_prices (stock_code, price, change, change_rate, volume, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (stock_code) DO UPDATE SET
         price = EXCLUDED.price,
         change = EXCLUDED.change,
         change_rate = EXCLUDED.change_rate,
         volume = EXCLUDED.volume,
         updated_at = NOW()`,
      [p.code, p.price, p.change, p.changeRate, p.volume ?? 0]
    );
  } catch { /* 저장 실패는 무시 (조회에 영향 없음) */ }
}

// jp: 마지막 정상 가격 조회 (외부 실패 시 fallback)
export async function getLastGoodPrice(code: string): Promise<{ data: StockPrice; updatedAt: string } | null> {
  if (!isDbReady()) return null;
  try {
    const rows = await query<{
      stock_code: string; price: number; change: number; change_rate: string;
      volume: string; updated_at: string;
    }>(
      `SELECT stock_code, price, change, change_rate, volume, updated_at
         FROM stock_prices WHERE stock_code = $1 LIMIT 1`,
      [code]
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      data: {
        code: r.stock_code,
        name: '',
        price: r.price,
        change: r.change,
        changeRate: Number(r.change_rate),
        volume: Number(r.volume),
        high: 0, low: 0, open: 0, prevClose: 0,
        updatedAt: r.updated_at,
      },
      updatedAt: r.updated_at,
    };
  } catch {
    return null;
  }
}

// jp: 여러 종목 마지막 정상 가격 일괄 조회 (종목당 1행이라 DISTINCT 불필요)
export async function getLastGoodPrices(codes: string[]): Promise<Map<string, { data: StockPrice; updatedAt: string }>> {
  const out = new Map<string, { data: StockPrice; updatedAt: string }>();
  if (!isDbReady() || codes.length === 0) return out;
  try {
    const rows = await query<{
      stock_code: string; price: number; change: number; change_rate: string;
      volume: string; updated_at: string;
    }>(
      `SELECT stock_code, price, change, change_rate, volume, updated_at
         FROM stock_prices WHERE stock_code = ANY($1)`,
      [codes]
    );
    for (const r of rows) {
      out.set(r.stock_code, {
        data: {
          code: r.stock_code, name: '', price: r.price, change: r.change,
          changeRate: Number(r.change_rate), volume: Number(r.volume),
          high: 0, low: 0, open: 0, prevClose: 0, updatedAt: r.updated_at,
        },
        updatedAt: r.updated_at,
      });
    }
  } catch { /* 무시 */ }
  return out;
}
