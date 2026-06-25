// jp: 시장 랭킹 API 서비스 (/api/ranking)
// jp: 서버 스캐너가 계산한 랭킹을 받아옴 (프론트는 계산 X)

import { apiClient } from './apiClient';

export interface RankingItem {
  code: string;
  name: string;
  price: number;
  change: number;
  changeRate: number;
  volume: number;
  tradingValue: number;
}

export interface AllRankings {
  topGainers: RankingItem[];
  topLosers: RankingItem[];
  topVolume: RankingItem[];
  topValue: RankingItem[];
  nearHigh: RankingItem[];
  nearLow: RankingItem[];
  updatedAt: string | null;
}

export type RankingType = 'top-gainers' | 'top-losers' | 'top-volume' | 'top-value' | 'near-high' | 'near-low';

export const rankingService = {
  // jp: 전체 랭킹 한 번에
  async getAll(): Promise<AllRankings | null> {
    try {
      return await apiClient.get<AllRankings>('/api/ranking');
    } catch {
      return null;
    }
  },

  // jp: 특정 랭킹만
  async getOne(type: RankingType): Promise<RankingItem[]> {
    try {
      const data = await apiClient.get<RankingItem[]>(`/api/ranking/${type}`);
      return data ?? [];
    } catch {
      return [];
    }
  },
};
