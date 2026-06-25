// jp: 배치 현재가 서비스 - 여러 종목 한 번에 (종목마다 호출 금지)

import { apiClient } from '@/services/apiClient';

export interface BatchPriceItem {
  code: string;
  name: string;
  price: number;
  change: number;
  changeRate: number;
  volume: number;
  stale: boolean;
  staleReason?: string;
  updatedAt?: string;
}

// jp: 여러 종목 현재가 일괄 조회. stale 메타 포함
export async function fetchBatchPrices(codes: string[]): Promise<{ items: BatchPriceItem[]; stale: boolean }> {
  if (codes.length === 0) return { items: [], stale: false };
  try {
    const joined = codes.join(',');
    const res = await apiClient.getRaw<BatchPriceItem[]>(`/api/stocks/prices?codes=${joined}`);
    return { items: res.data ?? [], stale: !!res.stale };
  } catch {
    return { items: [], stale: true };
  }
}
