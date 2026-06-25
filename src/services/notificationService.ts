// jp: 알림 백엔드 API 서비스
// jp: GET 목록 / POST 읽음 / DELETE 삭제 등 데이터 연결
import { apiClient } from './apiClient';
import { AppNotification, NotificationType } from '@/types/notification';

// jp: 백엔드 알림 row 형태
interface ServerNotification {
  id: string;
  type: string;
  stockCode: string | null;
  stockName: string | null;
  title: string;
  body: string | null;
  category: string | null;
  receiptNo: string | null;  // jp: 공시 접수번호
  isRead: boolean;
  createdAt: string;
}

function mapType(type: string, title: string): NotificationType {
  if (type === 'system') return 'system';
  if (type === 'disclosure') {
    if (title.includes('악재')) return 'important_disclosure';
    return 'disclosure';
  }
  if (type === 'important_disclosure') return 'important_disclosure';
  if (type === 'price' || type === 'price_up' || type === 'price_down') return 'price_up';
  if (type === 'change_rate') return 'change_rate';
  if (type === 'volume' || type === 'volume_surge') return 'volume_surge';
  return 'system';
}

function extractStockName(title: string, stockCode: string | null): string {
  const m = title.match(/^(.+?)\s+(자본조달|호재|악재|중요|공시)/);
  if (m) return m[1];
  return stockCode || '';
}

function toAppNotification(s: ServerNotification): AppNotification {
  return {
    id: s.id,
    type: mapType(s.type, s.title),
    stockCode: s.stockCode || '',
    stockName: s.stockName || extractStockName(s.title, s.stockCode),
    title: s.title,
    message: s.body || '',
    isRead: s.isRead,
    createdAt: new Date(s.createdAt).getTime(),
    category: (s.category as AppNotification['category']) || inferCategory(s.title),
    receiptNo: s.receiptNo || undefined, // jp: 공시 접수번호 (클릭 시 AI분석)
  };
}

function inferCategory(title: string): AppNotification['category'] {
  if (title.includes('자본조달')) return 'capital';
  if (title.includes('호재')) return 'good';
  if (title.includes('악재')) return 'bad';
  if (title.includes('중요')) return 'important';
  return undefined;
}

export const notificationService = {
  async list(limit = 50): Promise<AppNotification[]> {
    try {
      const data = await apiClient.get<ServerNotification[]>(`/api/notifications?limit=${limit}`);
      return (data || []).map(toAppNotification);
    } catch {
      return [];
    }
  },
  async unreadCount(): Promise<number> {
    try {
      const data = await apiClient.get<{ count: number }>('/api/notifications/unread-count');
      return data?.count ?? 0;
    } catch {
      return 0;
    }
  },
  async markRead(id: string): Promise<void> {
    try { await apiClient.post(`/api/notifications/${id}/read`, {}); } catch { /* ignore */ }
  },
  async markAllRead(): Promise<void> {
    try { await apiClient.post('/api/notifications/read-all', {}); } catch { /* ignore */ }
  },
  async remove(id: string): Promise<void> {
    try { await apiClient.delete(`/api/notifications/${id}`); } catch { /* ignore */ }
  },
  async clear(): Promise<void> {
    try { await apiClient.delete('/api/notifications'); } catch { /* ignore */ }
  },
};
