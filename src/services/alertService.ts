// jp: 알림 조건 백엔드 API 서비스
// jp: alertStore가 이걸 통해 백엔드 DB(stock_alert_conditions)와 동기화

import { apiClient } from './apiClient';
import { StockAlertCondition, StockAlertType } from '@/types/alert';

// jp: 백엔드 응답 형식
interface BackendAlertCondition {
  id: string;
  stockCode: string;
  stockName: string;
  type: StockAlertType;
  value: number | null;
  keyword: string | null;
  isEnabled: boolean;
  cooldownMinutes: number;
  lastTriggeredAt: string | null;
}

// jp: 백엔드 → 프론트 타입 변환
function toFrontend(b: BackendAlertCondition): StockAlertCondition {
  return {
    id: b.id,
    stockCode: b.stockCode,
    stockName: b.stockName,
    type: b.type,
    value: b.value ?? undefined,
    keyword: b.keyword ?? undefined,
    isEnabled: b.isEnabled,
    cooldownMinutes: b.cooldownMinutes,
    lastTriggeredAt: b.lastTriggeredAt ? new Date(b.lastTriggeredAt).getTime() : undefined,
    createdAt: Date.now(),  // jp: 백엔드에 createdAt 없으면 현재시각
    updatedAt: Date.now(),
  };
}

export const alertService = {
  // jp: 전체 알림 조건 조회
  async getAll(): Promise<StockAlertCondition[]> {
    try {
      const data = await apiClient.get<BackendAlertCondition[]>('/api/alerts');
      return data.map(toFrontend);
    } catch {
      return [];
    }
  },

  // jp: 종목별 알림 조건 조회
  async getByStock(stockCode: string): Promise<StockAlertCondition[]> {
    try {
      const data = await apiClient.get<BackendAlertCondition[]>(`/api/alerts?stockCode=${stockCode}`);
      return data.map(toFrontend);
    } catch {
      return [];
    }
  },

  // jp: 알림 조건 생성
  async create(input: {
    id: string;
    stockCode: string;
    stockName: string;
    type: StockAlertType;
    value?: number;
    keyword?: string;
    cooldownMinutes: number;
  }): Promise<boolean> {
    try {
      await apiClient.post('/api/alerts', input);
      return true;
    } catch {
      return false;
    }
  },

  // jp: 알림 조건 삭제
  async remove(id: string): Promise<boolean> {
    try {
      await apiClient.delete(`/api/alerts/${id}`);
      return true;
    } catch {
      return false;
    }
  },

  // jp: 알림 발생시각 저장
  async updateLastTriggered(id: string, triggeredAt: number): Promise<boolean> {
    try {
      await apiClient.patch(`/api/alerts/${id}/triggered`, { triggeredAt });
      return true;
    } catch {
      return false;
    }
  },

  // jp: 알림 조건 켜기/끄기
  async toggle(id: string): Promise<boolean> {
    try {
      await apiClient.patch(`/api/alerts/${id}/toggle`, {});
      return true;
    } catch {
      return false;
    }
  },
};
