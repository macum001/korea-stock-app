// jp: 공시 알림 백엔드 API 서비스 (5종 플래그)
// jp: 백엔드 /api/stocks/:code/disclosure-alert (POST 설정 / GET 조회 / DELETE 해제)

import { apiClient } from './apiClient';

// jp: 5종 공시 알림 설정
export interface DisclosureAlertPrefs {
  alertAll: boolean;
  alertImportant: boolean;
  alertCapital: boolean;
  alertGood: boolean;
  alertBad: boolean;
}

export const disclosureAlertService = {
  // jp: 5종 플래그로 설정
  async setPrefs(stockCode: string, prefs: DisclosureAlertPrefs): Promise<boolean> {
    try {
      await apiClient.post(`/api/stocks/${stockCode}/disclosure-alert`, prefs);
      return true;
    } catch {
      return false;
    }
  },

  // jp: 현재 설정 조회
  async getPrefs(stockCode: string): Promise<(DisclosureAlertPrefs & { isEnabled: boolean }) | null> {
    try {
      const data = await apiClient.get<(DisclosureAlertPrefs & { isEnabled: boolean }) | null>(
        `/api/stocks/${stockCode}/disclosure-alert`
      );
      return data ?? null;
    } catch {
      return null;
    }
  },

  // jp: 해제
  async disable(stockCode: string): Promise<boolean> {
    try {
      await apiClient.delete(`/api/stocks/${stockCode}/disclosure-alert`);
      return true;
    } catch {
      return false;
    }
  },

  // jp: 기존 호환 (단일 ON - 중요/호재/악재/자본조달 다 켜기)
  async enable(stockCode: string): Promise<boolean> {
    return this.setPrefs(stockCode, {
      alertAll: true,
      alertImportant: true,
      alertCapital: true,
      alertGood: true,
      alertBad: true,
    });
  },
};
