// jp: 알림 상태 관리 스토어 - 백엔드 실데이터 연결 (mock 제거)
// jp: 기존 액션 시그니처 유지 (markAsRead/markAllAsRead/deleteNotification/clearAll)
// jp: + loadFromServer 추가. 변경은 낙관적 업데이트(화면 먼저) 후 서버 반영.

import { create } from 'zustand';
import { AppNotification } from '@/types/notification';
import { notificationService } from '@/services/notificationService';

// jp: 토스트 리스너 - notification 발생 시 UI에 토스트 표시용
type ToastListener = (n: AppNotification) => void;
const toastListeners = new Set<ToastListener>();

export function onNotificationToast(fn: ToastListener): () => void {
  toastListeners.add(fn);
  return () => { toastListeners.delete(fn); };
}

function _emitToast(n: AppNotification): void {
  toastListeners.forEach(fn => {
    try { fn(n); } catch { /* ignore */ }
  });
}

interface NotificationStore {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;

  // jp: 서버에서 알림 로드 (앱 시작/알림화면 진입 시)
  loadFromServer: () => Promise<void>;

  // jp: 실시간 수신 (WS) - 로컬에 추가 + 토스트
  addNotification: (n: Omit<AppNotification, 'id' | 'createdAt' | 'isRead'>) => void;

  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  deleteNotification: (id: string) => void;
  clearAll: () => void;
}

export const useNotificationStore = create<NotificationStore>()((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,

  // jp: 서버에서 목록 + 안읽음 개수 로드
  loadFromServer: async () => {
    set({ loading: true });
    const [list, unread] = await Promise.all([
      notificationService.list(50),
      notificationService.unreadCount(),
    ]);
    set({ notifications: list, unreadCount: unread, loading: false });
  },

  // jp: 실시간 알림 도착 (WS 브로드캐스트 수신 시)
  addNotification: (n) => {
    const newOne: AppNotification = {
      ...n,
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      isRead: false,
      createdAt: Date.now(),
    };
    set(state => ({
      notifications: [newOne, ...state.notifications].slice(0, 50),
      unreadCount: state.unreadCount + 1,
    }));
    _emitToast(newOne);
  },

  // jp: 1건 읽음 (낙관적 + 서버)
  markAsRead: (id) => {
    set(state => {
      const updated = state.notifications.map(n =>
        n.id === id ? { ...n, isRead: true } : n
      );
      return { notifications: updated, unreadCount: updated.filter(n => !n.isRead).length };
    });
    void notificationService.markRead(id);
  },

  // jp: 전체 읽음
  markAllAsRead: () => {
    set(state => ({
      notifications: state.notifications.map(n => ({ ...n, isRead: true })),
      unreadCount: 0,
    }));
    void notificationService.markAllRead();
  },

  // jp: 1건 삭제
  deleteNotification: (id) => {
    set(state => {
      const updated = state.notifications.filter(n => n.id !== id);
      return { notifications: updated, unreadCount: updated.filter(n => !n.isRead).length };
    });
    void notificationService.remove(id);
  },

  // jp: 전체 삭제
  clearAll: () => {
    set({ notifications: [], unreadCount: 0 });
    void notificationService.clear();
  },
}));
