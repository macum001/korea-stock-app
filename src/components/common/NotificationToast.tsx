// jp: 알림 토스트 - 알림 발생 시 화면 상단에 잠깐 표시

import { useEffect, useState } from 'react';
import { onNotificationToast } from '@/store/notificationStore';
import { AppNotification, NOTIFICATION_CONFIG } from '@/types/notification';

interface ToastItem extends AppNotification {
  _key: string;
}

export function NotificationToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    // jp: 알림 발생 리스너 등록
    const unsubscribe = onNotificationToast((n) => {
      const item: ToastItem = { ...n, _key: `${n.id}-${Date.now()}` };
      setToasts(prev => [...prev, item]);
      // jp: 4초 후 자동 제거
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t._key !== item._key));
      }, 4000);
    });
    return unsubscribe;
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top) + 12px)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 100,
        width: '100%',
        maxWidth: 420,
        padding: '0 16px',
        pointerEvents: 'none',
      }}
    >
      {toasts.map(t => {
        const config = NOTIFICATION_CONFIG[t.type];
        return (
          <div
            key={t._key}
            className="flex items-center gap-3 mb-2 px-4 py-3 rounded-2xl shadow-lg"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              animation: 'toastIn 0.3s ease',
            }}
          >
            <span style={{ fontSize: 20 }}>{config.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                {t.title}
              </p>
              <p className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>
                {t.message}
              </p>
            </div>
          </div>
        );
      })}
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(-12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
