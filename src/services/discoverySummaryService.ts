// jp: 발견 요약 서비스 - 사전 계산된 백엔드 데이터 (요청마다 재계산 금지)

import { apiClient } from '@/services/apiClient';

export interface DiscoverySummary {
  todayImportantDisclosures: unknown[];
  themes: unknown[];
  volumeSpikes: unknown[];
  featuredStocks: unknown[];
  stockFeatureRankings: { stockCode: string; stockName: string; featuredScore: number; riskLevel: string }[];
  updatedAt: string;
}

// jp: 발견 요약 조회 (사전계산 전이면 null + stale)
export async function fetchDiscoverySummary(): Promise<{ data: DiscoverySummary | null; stale: boolean }> {
  try {
    const res = await apiClient.getRaw<DiscoverySummary | null>('/api/discovery/summary');
    return { data: res.data, stale: !!res.stale };
  } catch {
    return { data: null, stale: true };
  }
}
