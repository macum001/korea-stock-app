// jp: 앱 전체 래퍼 컴포넌트 - WebSocket 상태 표시 + 알림 토스트 + 공통 헤더
// jp: 공통 헤더 구성 = 테마 토글 (종 버튼 제거 → 하단 탭으로 이동)
import { useEffect } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useStockSocket } from '@/hooks/useStockSocket';
import { useStockStore } from '@/store/stockStore';
import { useWatchlistStore } from '@/store/watchlistStore';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
import { websocketService } from '@/services/websocketService';
import { DEFAULT_STOCK_CODES } from '@/data/defaultStocks';
import { NotificationToast } from '@/components/common/NotificationToast';
import { AuthButton } from '@/components/auth/AuthButton';
import { ThemeToggle } from '@/components/common/ThemeToggle';

interface AppShellProps {
  children: React.ReactNode;
  showHeader?: boolean;
}

export function AppShell({ children, showHeader = true }: AppShellProps) {
  useTheme();
  const connectionStatus = useStockStore((s) => s.connectionStatus);
  const watchItems = useWatchlistStore((s) => s.items);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hydrateFromServer = useWatchlistStore((s) => s.hydrateFromServer);
  const addNotification = useNotificationStore((s) => s.addNotification);

  useEffect(() => {
    if (isAuthenticated) hydrateFromServer();
  }, [isAuthenticated, hydrateFromServer]);

  const codes = Array.from(new Set([
    ...DEFAULT_STOCK_CODES,
    ...watchItems.map((i) => i.code),
  ]));
  useStockSocket(codes);

  useEffect(() => {
    const off = websocketService.onNotification((payload) => {
      const p = (payload || {}) as Record<string, unknown>;
      const stockCode = typeof p.stockCode === 'string' ? p.stockCode
                      : typeof p.stock_code === 'string' ? p.stock_code : '';

      if (!isAuthenticated) return;
      const myCodes = useWatchlistStore.getState().items.map((i) => i.code);
      if (stockCode && !myCodes.includes(stockCode)) return;

      addNotification({
        type: String(p.type ?? 'disclosure'),
        title: String(p.title ?? '새 알림'),
        message: typeof p.message === 'string' ? p.message
               : typeof p.body === 'string' ? p.body : '',
        stockCode,
        stockName: typeof p.stockName === 'string' ? p.stockName
                 : typeof p.stock_name === 'string' ? p.stock_name : undefined,
        category: typeof p.category === 'string' ? p.category : undefined,
        receiptNo: typeof p.receiptNo === 'string' ? p.receiptNo
                 : typeof p.receipt_no === 'string' ? p.receipt_no : undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    });
    return off;
  }, [addNotification, isAuthenticated]);

  return (
    <div style={{ backgroundColor: 'var(--bg-primary)', minHeight: '100dvh' }}>
      {connectionStatus === 'disconnected' && (
        <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full z-50 text-center py-1.5 text-xs font-medium"
          style={{ maxWidth: 430, backgroundColor: 'var(--fall)', color: 'white' }}>
          서버와 연결이 끊겼어요. 다시 연결 중..
        </div>
      )}
      {connectionStatus === 'connecting' && (
        <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full z-50 text-center py-1.5 text-xs font-medium"
          style={{ maxWidth: 430, backgroundColor: '#f59e0b', color: 'white' }}>
          연결 중..
        </div>
      )}

      {showHeader && (
        <header
          className="sticky top-0 z-30 flex items-center justify-between px-4 py-2.5"
          style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--border-subtle)' }}
        >
          <AuthButton size="lg" />
          <ThemeToggle size="sm" />
        </header>
      )}

      {children}
      <NotificationToast />
    </div>
  );
}
