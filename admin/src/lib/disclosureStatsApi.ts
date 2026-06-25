// jp: 관리자 공시 통계 API
import { api } from './api';

export interface DisclosureStatItem {
  key: string;
  label: string;
  group: string;        // 'basic' | 'subtype'
  sampleSize: number;
  avg: Record<string, number>;    // d1/d5/d10/d15/d20/d25/d30
  upRate: Record<string, number>;
  stdevD30: number;
  hasEnoughData: boolean;
  isVisible: boolean;
}

export interface DisclosureStatsResponse {
  basic: DisclosureStatItem[];
  subtype: DisclosureStatItem[];
  totalSamples: number;
}

export interface DisclosureStatDetailRow {
  receiptNo: string;
  stockCode: string;
  stockName: string;
  disclosedDate: string;
  reportName: string;
  returns: Record<string, number | null>;
}

export const disclosureStatsApi = {
  getStats(): Promise<DisclosureStatsResponse> {
    return api.get<DisclosureStatsResponse>('/api/admin/briefing/disclosure-stats');
  },
  getDetail(group: string, type: string): Promise<DisclosureStatDetailRow[]> {
    return api.get<DisclosureStatDetailRow[]>(`/api/admin/briefing/disclosure-stat-detail?group=${encodeURIComponent(group)}&type=${encodeURIComponent(type)}`);
  },
  setVisibility(statType: string, isVisible: boolean): Promise<{ statType: string; isVisible: boolean }> {
    return api.patch('/api/admin/briefing/disclosure-stat-visibility', { statType, isVisible });
  },
};


// jp: 자동 재계산 실행 기록
export interface ImpactJobLog {
  ran_at: string;
  trigger_type: string;
  processed: number;
  completed: number;
  failed: number;
  total_samples: number;
  pending_left: number;
  success: boolean;
  error_message: string | null;
  duration_ms: number | null;
}

export const impactMonitorApi = {
  getStatus(): Promise<{ logs: ImpactJobLog[] }> {
    return api.get<{ logs: ImpactJobLog[] }>('/api/admin/briefing/impact-status');
  },
  runNow(): Promise<{ processed: number; completed: number; failed: number; success: boolean; message: string }> {
    return api.post('/api/admin/briefing/impact-run');
  },
};

// jp: 시점 라벨
export const DAY_LABELS: { key: string; label: string }[] = [
  { key: 'd1', label: '1일' },
  { key: 'd5', label: '5일' },
  { key: 'd10', label: '10일' },
  { key: 'd15', label: '15일' },
  { key: 'd20', label: '20일' },
  { key: 'd25', label: '25일' },
  { key: 'd30', label: '30일' },
];
