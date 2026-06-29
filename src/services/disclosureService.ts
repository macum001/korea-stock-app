// jp: 공시 서비스 - 백엔드 API 연결 (mock 완전 제거)
// jp: 백엔드 실패 시 빈 배열 반환 (가짜 공시 표시 금지)

import { Disclosure, DisclosureFilter } from '@/types/disclosure';
import { apiClient } from './apiClient';

// jp: filter 객체를 받아 공시 배열에 클라이언트 필터 적용 (플래그 기반)
// jp: 전체=필터없음, 중요=isImportant, 자본조달=isCapital, 호재=isGood, 악재=isBad
function applyDisclosureFilter(list: Disclosure[], filter?: DisclosureFilter): Disclosure[] {
  let result = list;
  if (filter?.flagImportant) result = result.filter(d => d.isImportant);
  if (filter?.flagCapital)   result = result.filter(d => d.isCapital);
  if (filter?.flagGood)      result = result.filter(d => d.isGood);
  if (filter?.flagBad)       result = result.filter(d => d.isBad);
  // jp: 구 필터 호환 (혹시 남아있으면)
  if (filter?.capitalRaising) result = result.filter(d => d.isCapital);
  if (filter?.importance?.length) {
    result = result.filter(d => filter.importance!.includes(d.importance));
  }
  if (filter?.sentiment?.length) {
    result = result.filter(d => filter.sentiment!.includes(d.sentiment));
  }
  if (filter?.keyword) {
    const kw = filter.keyword.toLowerCase();
    result = result.filter(d =>
      d.reportName.toLowerCase().includes(kw) ||
      d.stockName.toLowerCase().includes(kw)
    );
  }
  return result;
}

export interface IDisclosureService {
  getDisclosuresByStock(stockCode: string, filter?: DisclosureFilter): Promise<Disclosure[]>;
  getImportantDisclosures(): Promise<Disclosure[]>;
  getAllDisclosures(filter?: DisclosureFilter): Promise<Disclosure[]>;
  getMyFeed(filter?: DisclosureFilter, category?: string): Promise<Disclosure[]>;
  searchDisclosures(keyword: string): Promise<Disclosure[]>;
  getDisclosureDetail(id: string): Promise<Disclosure | null>;
  // jp: 페이지네이션 메서드 (무한스크롤용)
  getStockDisclosurePage(stockCode: string, limit?: number, offset?: number, category?: string): Promise<{ items: Disclosure[]; hasMore: boolean }>;
  getLatestPage(limit?: number, offset?: number): Promise<{ items: Disclosure[]; hasMore: boolean }>;
  getCategoryPage(category: string, limit?: number, offset?: number): Promise<{ items: Disclosure[]; hasMore: boolean }>;
}

class DisclosureService implements IDisclosureService {
  async getDisclosuresByStock(stockCode: string, filter?: DisclosureFilter): Promise<Disclosure[]> {
    try {
      const all = await apiClient.get<Disclosure[]>(`/api/disclosures/stock/${stockCode}?limit=200`);
      const result = applyDisclosureFilter(all, filter);
      return result.sort(
        (a, b) => new Date(b.disclosedAt).getTime() - new Date(a.disclosedAt).getTime()
      );
    } catch (err) {
      // jp: 백엔드 실패 시 빈 배열 (가짜 공시 금지)
      console.warn('[Disclosure] 백엔드 연결 실패 - 빈 목록:', err);
      return [];
    }
  }

  // jp: 종목별 공시 페이지 조회 (무한스크롤용) — { items, hasMore } 반환
  async getStockDisclosurePage(stockCode: string, limit = 50, offset = 0, category?: string): Promise<{ items: Disclosure[]; hasMore: boolean }> {
    try {
      const catParam = category && category !== 'all' ? `&category=${encodeURIComponent(category)}` : '';
      const items = await apiClient.get<Disclosure[]>(`/api/disclosures/stock/${stockCode}?limit=${limit}&offset=${offset}${catParam}`);
      return { items: items ?? [], hasMore: (items?.length ?? 0) >= limit };
    } catch {
      return { items: [], hasMore: false };
    }
  }

  // jp: 전체 공시 페이지 조회 (무한스크롤용) — { items, hasMore } 반환
  async getLatestPage(limit = 50, offset = 0): Promise<{ items: Disclosure[]; hasMore: boolean }> {
    try {
      const items = await apiClient.get<Disclosure[]>(`/api/disclosures?limit=${limit}&offset=${offset}`);
      return { items: items ?? [], hasMore: (items?.length ?? 0) >= limit };
    } catch {
      return { items: [], hasMore: false };
    }
  }

  // jp: 종류 축 카테고리 페이지 조회 (7개 탭 무한스크롤) — 백엔드 ?category= 필터
  async getCategoryPage(category: string, limit = 50, offset = 0): Promise<{ items: Disclosure[]; hasMore: boolean }> {
    try {
      const items = await apiClient.get<Disclosure[]>(`/api/disclosures?category=${encodeURIComponent(category)}&limit=${limit}&offset=${offset}`);
      return { items: items ?? [], hasMore: (items?.length ?? 0) >= limit };
    } catch {
      return { items: [], hasMore: false };
    }
  }

  async getImportantDisclosures(): Promise<Disclosure[]> {
    try {
      return await apiClient.get<Disclosure[]>('/api/disclosures/important');
    } catch {
      return [];
    }
  }

  async getAllDisclosures(filter?: DisclosureFilter): Promise<Disclosure[]> {
    try {
      // jp: 키워드 검색
      if (filter?.keyword) {
        return await apiClient.get<Disclosure[]>(
          `/api/disclosures/search?keyword=${encodeURIComponent(filter.keyword)}`
        );
      }

      // jp: 탭 플래그는 백엔드에서 직접 필터 (전체 10만건 중 해당 플래그만 최신순)
      let flag = '';
      if (filter?.flagImportant) flag = 'important';
      else if (filter?.flagCapital) flag = 'capital';
      else if (filter?.flagGood) flag = 'good';
      else if (filter?.flagBad) flag = 'bad';

      const url = flag ? `/api/disclosures?flag=${flag}&limit=200` : '/api/disclosures';
      const all = await apiClient.get<Disclosure[]>(url);

      // jp: 백엔드에서 이미 플래그 필터됨. 그 외엔 클라이언트 보정
      const result = flag ? all : applyDisclosureFilter(all, filter);

      return result.sort(
        (a, b) => new Date(b.disclosedAt).getTime() - new Date(a.disclosedAt).getTime()
      );
    } catch (err) {
      // jp: 백엔드 실패 시 빈 배열 (가짜 공시 금지)
      console.warn('[Disclosure] 백엔드 연결 실패 - 빈 목록:', err);
      return [];
    }
  }

  // jp: ★ 내 관심종목 공시 피드 - /api/disclosures/feed/my
  // jp: 백엔드 응답이 { success, data } 형식이라 apiClient.get<Disclosure[]>가 data를 풀어줌
  async getMyFeed(filter?: DisclosureFilter, category?: string): Promise<Disclosure[]> {
    try {
      const catParam = category && category !== 'all' ? `?category=${encodeURIComponent(category)}` : '';
      const list = await apiClient.get<Disclosure[]>(`/api/disclosures/feed/my${catParam}`);
      const result = applyDisclosureFilter(list ?? [], filter);
      return result.sort(
        (a, b) => new Date(b.disclosedAt).getTime() - new Date(a.disclosedAt).getTime()
      );
    } catch (err) {
      console.warn('[Disclosure] 내 피드 연결 실패 - 빈 목록:', err);
      return [];
    }
  }

  async searchDisclosures(keyword: string): Promise<Disclosure[]> {
    return this.getAllDisclosures({ keyword });
  }

  async getDisclosureDetail(id: string): Promise<Disclosure | null> {
    // jp: 백엔드 단건 조회 엔드포인트가 생기면 연결. 현재는 목록에서 받은 데이터 사용
    void id;
    return null;
  }
}

export const disclosureService: IDisclosureService = new DisclosureService();
