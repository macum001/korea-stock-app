// jp: 관리자 시황 통계 API
import { api } from './api';

export interface StatValue {
  label: string;
  value: number | null;
}

export interface StatCorrelation {
  key: string;
  label: string;
  desc: string;
  sampleSize: number;
  hasEnoughData: boolean;
  values: StatValue[];
  hitInfo: string | null;
  isVisible: boolean;
}

export const briefingStatsApi = {
  // jp: 상관 통계 + 노출 설정
  getCorrelations(): Promise<StatCorrelation[]> {
    return api.get<StatCorrelation[]>('/api/admin/briefing/stats-correlation');
  },
  // jp: 노출 토글
  setVisibility(key: string, visible: boolean): Promise<{ success: boolean }> {
    return api.patch(`/api/admin/briefing/stats-visibility/${key}`, { visible });
  },
  detail(key: string): Promise<StatDetail> {
    return api.get<StatDetail>(`/api/admin/briefing/stats-detail/${key}`);
  },
};

// jp: 일자별 상세 (검증용)
export interface StatDetailRow {
  signalDate: string;
  targetDate: string;
  signalValue: number;
  targets: { label: string; value: number }[];
  hit: boolean;
}

export interface StatDetail {
  key: string;
  label: string;
  desc: string;
  rows: StatDetailRow[];
  sampleSize: number;
  hitCount: number;
  hitRate: number;
  averages: { label: string; mean: number; stdev: number }[];
}
