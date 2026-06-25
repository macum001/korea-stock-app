// jp: 어드민 프롬프트 관리 API 함수

import { api } from './api';

export interface PromptItem {
  key: string;
  name: string;
  description: string;
  content: string;
  isCustom: boolean;          // jp: DB에 저장된 적 있음 (코드 기본값과 다를 수 있음)
  updatedAt: string | null;
  updatedBy: string | null;
}

export const promptApi = {
  // jp: 프롬프트 목록
  list(): Promise<PromptItem[]> {
    return api.get<PromptItem[]>('/api/admin/prompts');
  },
  // jp: 프롬프트 저장
  save(key: string, content: string): Promise<void> {
    return api.patch(`/api/admin/prompts/${key}`, { content });
  },
  // jp: 기본값으로 복원 (복원된 기본 content 반환)
  reset(key: string): Promise<{ content: string }> {
    return api.post<{ content: string }>(`/api/admin/prompts/${key}/reset`);
  },
};
