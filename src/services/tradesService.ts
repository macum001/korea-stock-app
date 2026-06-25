// jp: 체결내역 API 서비스 - 초기 snapshot/과거조회용. 신규 체결은 WebSocket append 사용.

import { apiClient } from './apiClient';

export interface TradeTick {
  code?: string;
  time: string;
  price: number;
  volume: number;
  change: number;
  side: 'buy' | 'sell';
  strength?: number;  // jp: 체결강도 (실시간 WS에서만 제공)
  providerTimestamp?: number; // jp: KIS 체결 원본 timestamp(ms). 차트 bucket 기준으로 사용
  backendReceivedAt?: number;
  wsBroadcastAt?: number;
}

export const tradesService = {
  async getTrades(code: string, limit = 300): Promise<TradeTick[]> {
    try {
      const data = await apiClient.get<TradeTick[]>(`/api/stocks/${code}/trades?limit=${limit}`);
      return data ?? [];
    } catch {
      return [];
    }
  },
};
