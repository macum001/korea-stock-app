// jp: Bootstrap 서비스 - 첫 화면 데이터 한 번에 (백엔드 API만 호출)

import { apiClient } from '@/services/apiClient';

export interface BootstrapData {
  marketIndices: unknown[];
  watchlistSummary: { groupCount: number; itemCount: number; groups: { id: string; name: string; count: number }[] };
  importantDisclosures: unknown[];
  featuredStocks: unknown[];
  discoverySummary: Record<string, unknown> | null;
  unreadNotificationCount: number;
  stale: boolean;
  updatedAt: string;
}

// jp: 첫 화면 부트스트랩 조회 (실패 시 null)
export async function fetchBootstrap(): Promise<BootstrapData | null> {
  try {
    return await apiClient.get<BootstrapData>('/api/bootstrap');
  } catch {
    return null;
  }
}
