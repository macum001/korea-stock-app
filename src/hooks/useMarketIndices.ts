// jp: 시장지수 서비스 + 훅 - 백엔드 /api/market/indices, /index-history
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/services/apiClient';

export interface MarketIndex {
  code: string;
  name: string;
  value: number;
  change: number;
  changeRate: number;
  updatedAt: string;
}

export async function fetchMarketIndices(): Promise<{ data: MarketIndex[]; stale: boolean }> {
  try {
    const res = await apiClient.getRaw<MarketIndex[]>('/api/market/indices');
    return { data: res.data ?? [], stale: !!res.stale };
  } catch {
    return { data: [], stale: true };
  }
}

export function useMarketIndices() {
  return useQuery({
    queryKey: ['marketIndices'],
    queryFn: fetchMarketIndices,
    staleTime: 10_000,        // jp: 10초
    refetchInterval: 15_000,  // jp: 15초마다 갱신
    refetchIntervalInBackground: false,
  });
}

// jp: ===== 지수 일자별 과거 데이터 =====

export interface IndexHistoryItem {
  date: string;        // jp: YYYY-MM-DD
  close: number;       // jp: 종가
  change: number;      // jp: 등락폭
  changeRate: number;  // jp: 등락률
}

export async function fetchIndexHistory(code: string, range = '10y'): Promise<IndexHistoryItem[]> {
  try {
    const res = await apiClient.getRaw<IndexHistoryItem[]>(
      `/api/market/index-history?code=${encodeURIComponent(code)}&range=${encodeURIComponent(range)}`
    );
    return res.data ?? [];
  } catch {
    return [];
  }
}

// jp: 지수 일자별 데이터 훅 (시트 열릴 때만 - enabled로 제어)
export function useIndexHistory(code: string | null, range = '10y') {
  return useQuery({
    queryKey: ['indexHistory', code, range],
    queryFn: () => fetchIndexHistory(code!, range),
    enabled: !!code,          // jp: code 있을 때만 호출
    staleTime: 6 * 60 * 60_000, // jp: 6시간 (일봉은 거의 안 바뀜)
  });
}
