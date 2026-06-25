// jp: 관리자 시황 브리핑 API
import { api } from './api';

export interface BriefingListItem {
  id: number;
  date: string;
  slot: string;
  status: string;
  summary: string | null;
  ai_model: string | null;
  ai_tokens: number | null;
  error_message: string | null;
  collected_at: string | null;
  analyzed_at: string | null;
  created_at: string;
  analysis_status: string | null;   // 좋음/보통/나쁨
  is_important: boolean | null;
  fetched_count: number | null;
}

export interface BriefingListResult {
  items: BriefingListItem[];
  total: number;
  page: number;
  size: number;
}

export interface BriefingDetail {
  id: number;
  date: string;
  slot: string;
  status: string;
  summary: string | null;
  analysis: Record<string, unknown> | null;
  raw_data: { items?: Array<Record<string, unknown>>; fetchedCount?: number; totalCount?: number } | null;
  ai_model: string | null;
  ai_tokens: number | null;
  error_message: string | null;
  collected_at: string | null;
  analyzed_at: string | null;
  created_at: string;
}

export interface BriefingStats {
  total: number;
  today: number;
  byStatus: { status: string; count: number }[];
  byMarketStatus: { status: string; count: number }[];
  totalTokens: number;
}

export const briefingApi = {
  list(page = 1, size = 20, status = ''): Promise<BriefingListResult> {
    const sp = new URLSearchParams();
    sp.set('page', String(page));
    sp.set('size', String(size));
    if (status) sp.set('status', status);
    return api.get<BriefingListResult>(`/api/admin/briefing/list?${sp.toString()}`);
  },
  detail(id: number): Promise<BriefingDetail> {
    return api.get<BriefingDetail>(`/api/admin/briefing/detail/${id}`);
  },
  stats(): Promise<BriefingStats> {
    return api.get<BriefingStats>('/api/admin/briefing/stats');
  },
};
