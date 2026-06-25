// jp: 호가 API 서비스 (REST 폴링)
// jp: 장중엔 2초마다 폴링. 추후 WS(H0STASP0)로 업그레이드 가능

import { apiClient } from './apiClient';
import { Orderbook } from '@/types/stock';

export const orderbookService = {
  // jp: 호가 1회 조회
  async getOrderbook(code: string): Promise<Orderbook | null> {
    try {
      const data = await apiClient.get<Orderbook | null>(`/api/stocks/${code}/orderbook`);
      return data;
    } catch {
      return null;
    }
  },
};
