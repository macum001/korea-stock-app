// jp: 투자자별 수급 조회 스니펫 - 추후 투자자 수급 기능 구현 시 사용
// jp: 수정: getPool→db, rateLimitQueue→enqueueExternalApiRequest

import { ENV } from '../../config/env';
import { db } from '../../config/db';
import { enqueueExternalApiRequest } from '../performance/rateLimitQueue.service';

export type InvestorType = 'individual' | 'foreigner' | 'institution' | 'other';

export interface InvestorFlow {
  symbol: string;
  tradeDate: string;
  investorType: InvestorType;
  buyVolume: number;
  sellVolume: number;
  netBuyVolume: number;
  buyValue: number;
  sellValue: number;
  netBuyValue: number;
  dataStatus: 'ESTIMATED' | 'DELAYED' | 'CONFIRMED';
}

// jp: KIS 투자자별 매매동향 조회
export async function getInvestorFlow(
  symbol: string,
  date?: string
): Promise<InvestorFlow[]> {
  if (!ENV.KIS.APP_KEY || ENV.KIS.APP_KEY === 'your_app_key_here') return [];

  return enqueueExternalApiRequest(
    'KIS_PRICE',
    `investor-flow:${symbol}:${date ?? 'today'}`,
    async () => {
      try {
        // jp: TODO: KIS FHKST01010400 (투자자별 매매동향) API 연동
        const targetDate = date ?? new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const result = await db.query<InvestorFlow>(
          `SELECT * FROM stock_daily_investor_flows
           WHERE symbol = $1 AND trade_date = $2
           ORDER BY investor_type`,
          [symbol, targetDate]
        );
        return result.rows;
      } catch (err) {
        console.error('[InvestorFlow] 조회 실패:', err instanceof Error ? err.message : err);
        return [];
      }
    }
  );
}
