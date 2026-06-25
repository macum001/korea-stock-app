// jp: 종목 특징 점수 서비스 - 백엔드 API만 호출 (외부 API 직접 호출 금지)

import { apiClient } from '@/services/apiClient';
import { StockFeatureScore, FeaturedStockSection } from '@/types/stockFeature';

// jp: 마지막 성공 결과 캐시 (깜빡임 방지)
// jp: 탭 재진입/30초 갱신 시 빈 결과가 와도 이전 데이터를 유지해서 화면이 사라지지 않게 함
let lastFeaturedSections: FeaturedStockSection[] | null = null;

// jp: 캐시된 특징주 (있으면 즉시 표시용). 최초엔 null
export function getCachedFeaturedSections(): FeaturedStockSection[] | null {
  return lastFeaturedSections;
}

// jp: 장중 특징주 섹션 조회 (실데이터 없으면 마지막 정상 데이터 유지 → 깜빡임 방지)
export async function fetchFeaturedSections(): Promise<FeaturedStockSection[] | null> {
  try {
    const data = await apiClient.get<FeaturedStockSection[]>('/api/discovery/featured');
    // jp: 유효한 데이터면 캐시 갱신. 빈/없음이면 이전 캐시 유지(화면 안 사라지게)
    if (data && data.length > 0) {
      lastFeaturedSections = data;
      return data;
    }
    return lastFeaturedSections; // jp: 새 데이터 없음 → 이전 것 유지
  } catch {
    return lastFeaturedSections; // jp: 오류 → 이전 것 유지 (null이면 최초라 '준비 중')
  }
}

// jp: 단일 종목 특징 조회
export async function fetchStockFeature(stockCode: string): Promise<StockFeatureScore | null> {
  try {
    return await apiClient.get<StockFeatureScore>(`/api/stocks/${stockCode}/features`);
  } catch {
    return null;
  }
}
