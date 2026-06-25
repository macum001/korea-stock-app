// jp: 공시 데이터 훅
import { useState, useEffect, useCallback } from 'react';
import { Disclosure, DisclosureFilter } from '@/types/disclosure';
import { disclosureService } from '@/services/disclosureService';

// jp: 피드 모드 - 'all'(전체 공시) | 'my'(내 관심종목 공시)
export type FeedMode = 'all' | 'my';

export function useDisclosures(stockCode?: string, filter?: DisclosureFilter, mode: FeedMode = 'all') {
  const [disclosures, setDisclosures] = useState<Disclosure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // jp: filter 객체를 문자열 키로 변환 (의존성 안정화)
  const filterKey = JSON.stringify(filter ?? {});
  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      let result: Disclosure[];
      if (stockCode) {
        result = await disclosureService.getDisclosuresByStock(stockCode, filter);
      } else if (mode === 'my') {
        // jp: 내 관심종목 피드
        result = await disclosureService.getMyFeed(filter);
      } else {
        result = await disclosureService.getAllDisclosures(filter);
      }
      setDisclosures(result);
    } catch (e) {
      setError('공시 정보를 불러오지 못했어요.');
      console.error(e);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockCode, filterKey, mode]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  return { disclosures, loading, error, refetch: load };
}
