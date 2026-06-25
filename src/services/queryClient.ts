// jp: React Query 클라이언트 - 금융앱 캐싱 정책

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // jp: 기본값 - 개별 훅에서 staleTime 오버라이드
      staleTime: 10_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false, // jp: 과한 refetch 방지
      placeholderData: (prev: unknown) => prev, // jp: keepPreviousData 대체 (v5)
    },
  },
});
