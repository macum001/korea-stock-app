// jp: 투자자별 일별 수급 DB repository
// jp: 체결 tick에는 개인/외국인/기관 구분이 없으므로 별도 API/백필 데이터만 저장한다.

import { query, isDbReady } from '../config/db';

export type InvestorType = 'individual' | 'foreigner' | 'institution' | 'other_corporation';
export type InvestorDataStatus = 'ESTIMATED' | 'DELAYED' | 'CONFIRMED';

export interface InvestorFlowDbRow {
  stock_code: string;
  trade_date: string;
  investor_type: InvestorType;
  buy_volume: string;
  sell_volume: string;
  net_buy_volume: string;
  buy_value: string;
  sell_value: string;
  net_buy_value: string;
  data_status: InvestorDataStatus;
}

export interface InvestorFlowAggregate {
  date: string;
  individual: number;
  foreign: number;
  institution: number;
  other: number;
  individualValue: number;
  foreignValue: number;
  institutionValue: number;
  otherValue: number;
  dataStatus: InvestorDataStatus;
}

export interface InvestorFlowUpsertItem {
  stockCode: string;
  tradeDate: string; // jp: YYYY-MM-DD
  investorType: InvestorType;
  buyVolume?: number;
  sellVolume?: number;
  netBuyVolume: number;
  buyValue?: number;
  sellValue?: number;
  netBuyValue?: number;
  dataStatus?: InvestorDataStatus;
}

function normalizeDate(date: string): string {
  if (/^\d{8}$/.test(date)) return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
  return date.slice(0, 10);
}

export async function saveInvestorFlows(items: InvestorFlowUpsertItem[]): Promise<number> {
  if (!isDbReady() || items.length === 0) return 0;
  try {
    const BATCH = 300;
    let saved = 0;
    for (let i = 0; i < items.length; i += BATCH) {
      const chunk = items.slice(i, i + BATCH);
      const values: string[] = [];
      const params: unknown[] = [];
      let p = 1;
      for (const item of chunk) {
        values.push(`($${p++}, $${p++}::date, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
        params.push(
          item.stockCode,
          normalizeDate(item.tradeDate),
          item.investorType,
          item.buyVolume ?? 0,
          item.sellVolume ?? 0,
          item.netBuyVolume,
          item.buyValue ?? 0,
          item.sellValue ?? 0,
          item.netBuyValue ?? 0,
          item.dataStatus ?? 'DELAYED'
        );
      }
      await query(
        `INSERT INTO stock_daily_investor_flows
          (stock_code, trade_date, investor_type, buy_volume, sell_volume, net_buy_volume,
           buy_value, sell_value, net_buy_value, data_status)
         VALUES ${values.join(',')}
         ON CONFLICT (stock_code, trade_date, investor_type) DO UPDATE SET
           buy_volume = EXCLUDED.buy_volume,
           sell_volume = EXCLUDED.sell_volume,
           net_buy_volume = EXCLUDED.net_buy_volume,
           buy_value = EXCLUDED.buy_value,
           sell_value = EXCLUDED.sell_value,
           net_buy_value = EXCLUDED.net_buy_value,
           data_status = EXCLUDED.data_status,
           updated_at = now()`,
        params
      );
      saved += chunk.length;
    }
    return saved;
  } catch (err) {
    console.error('[InvestorFlow] 저장 실패:', err instanceof Error ? err.message : err);
    return 0;
  }
}

export async function getInvestorFlowsFromDb(stockCode: string, days = 20): Promise<InvestorFlowAggregate[]> {
  if (!isDbReady()) return [];
  const limit = Math.min(Math.max(days, 1), 3650);
  try {
    const rows = await query<InvestorFlowDbRow>(
      `SELECT stock_code, trade_date::text, investor_type,
              buy_volume::text, sell_volume::text, net_buy_volume::text,
              buy_value::text, sell_value::text, net_buy_value::text, data_status
         FROM stock_daily_investor_flows
        WHERE stock_code = $1
          AND trade_date IN (
            SELECT trade_date
              FROM stock_daily_investor_flows
             WHERE stock_code = $1
             GROUP BY trade_date
             ORDER BY trade_date DESC
             LIMIT $2
          )
        ORDER BY trade_date ASC, investor_type ASC`,
      [stockCode, limit]
    );

    const byDate = new Map<string, InvestorFlowAggregate>();
    for (const r of rows) {
      const date = normalizeDate(r.trade_date);
      const prev = byDate.get(date) ?? {
        date,
        individual: 0,
        foreign: 0,
        institution: 0,
        other: 0,
        individualValue: 0,
        foreignValue: 0,
        institutionValue: 0,
        otherValue: 0,
        dataStatus: 'CONFIRMED' as InvestorDataStatus,
      };
      const qty = Number(r.net_buy_volume ?? 0);
      const value = Number(r.net_buy_value ?? 0);
      if (r.investor_type === 'individual') { prev.individual = qty; prev.individualValue = value; }
      else if (r.investor_type === 'foreigner') { prev.foreign = qty; prev.foreignValue = value; }
      else if (r.investor_type === 'institution') { prev.institution = qty; prev.institutionValue = value; }
      else { prev.other = qty; prev.otherValue = value; }
      if (r.data_status !== 'CONFIRMED') prev.dataStatus = r.data_status;
      byDate.set(date, prev);
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  } catch (err) {
    console.error('[InvestorFlow] 조회 실패:', err instanceof Error ? err.message : err);
    return [];
  }
}
