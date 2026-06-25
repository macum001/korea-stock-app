// jp: 관심종목 백엔드 동기화 서비스
// jp: 백엔드 DB에 반영(best-effort). 실패해도 store(localStorage)는 그대로 동작 → fallback
// jp: 프론트는 외부 API 직접 호출 금지, 오직 이 백엔드 API만 사용

import { apiClient, hasAuth } from '@/services/apiClient';

// jp: 백엔드 응답 타입
export interface BackendWatchlistGroup {
  id: string;
  name: string;
  sort_order: number;
  is_default: boolean;
}
export interface BackendWatchlistItem {
  stock_code: string;
  stock_name: string;
  group_id: string;
  sort_order: number;
  memo: string;
  memo_updated_at: string | null;
  price_alert: boolean;
  disclosure_alert: boolean;
}

// jp: 전체 조회 (DB 우선) - 실패 시 null (→ store 로컬 데이터 사용)
export async function fetchWatchlist(): Promise<{
  groups: BackendWatchlistGroup[];
  items: BackendWatchlistItem[];
} | null> {
  if (!hasAuth()) return null; // jp: 게스트는 서버 조회 안 함 (로컬 사용)
  try {
    return await apiClient.get('/api/watchlist');
  } catch {
    return null; // jp: DB 미연결/오류 → 로컬 fallback
  }
}

// jp: 아래는 전부 fire-and-forget (실패 무시) - UI는 store가 즉시 반영
// jp: 게스트(미인증)는 백엔드 동기화 스킵 → localStorage만 사용
function silent(makeP: () => Promise<unknown>): void {
  if (!hasAuth()) return; // jp: 로그인 안 했으면 서버 저장 안 함
  makeP().catch(() => { /* 백엔드 실패 시 무시, 로컬은 유지됨 */ });
}

export const watchlistSync = {
  addGroup: (id: string, name: string, sortOrder: number) =>
    silent(() => apiClient.post('/api/watchlist/groups', { id, name, sortOrder })),

  renameGroup: (id: string, name: string) =>
    silent(() => apiClient.patch(`/api/watchlist/groups/${id}`, { name })),

  reorderGroup: (id: string, sortOrder: number) =>
    silent(() => apiClient.patch(`/api/watchlist/groups/${id}`, { sortOrder })),

  deleteGroup: (id: string, mode: 'move_to_default' | 'delete_all') =>
    silent(() => apiClient.delete(`/api/watchlist/groups/${id}?mode=${mode}`)),

  addItem: (stockCode: string, stockName: string, groupId: string) =>
    silent(() => apiClient.post('/api/watchlist', { stockCode, stockName, groupId })),

  removeItem: (code: string) =>
    silent(() => apiClient.delete(`/api/watchlist/${code}`)),

  moveItem: (code: string, groupId: string) =>
    silent(() => apiClient.patch(`/api/watchlist/${code}`, { groupId })),

  setMemo: (code: string, memo: string) =>
    silent(() => apiClient.patch(`/api/watchlist/${code}`, { memo })),

  deleteMemo: (code: string) =>
    silent(() => apiClient.patch(`/api/watchlist/${code}`, { deleteMemo: true })),

  setPriceAlert: (code: string, on: boolean) =>
    silent(() => apiClient.patch(`/api/watchlist/${code}`, { priceAlert: on })),

  setDisclosureAlert: (code: string, on: boolean) =>
    silent(() => apiClient.patch(`/api/watchlist/${code}`, { disclosureAlert: on })),
};
