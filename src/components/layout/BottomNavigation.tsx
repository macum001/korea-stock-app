// jp: 하단 고정 내비게이션 - 아이콘만 (AI인사이트/알림/설정)
// jp: 알림 탭은 AlertBell 컴포넌트 사용 — 미읽음 있으면 종이 흔들림
import { Sparkles, Settings } from 'lucide-react';
import { useNotificationStore } from '@/store/notificationStore';
import { AlertBell } from '@/components/common/AlertBell';

export type NavTab = 'stocks' | 'notifications' | 'settings';

interface BottomNavigationProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
}

export function BottomNavigation({ activeTab, onTabChange }: BottomNavigationProps) {
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const hasUnread = unreadCount > 0;

  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full z-40"
      style={{
        maxWidth: 430,
        background: 'var(--bg-primary)',
        backdropFilter: 'blur(28px)',
        WebkitBackdropFilter: 'blur(28px)',
        borderTop: '1px solid var(--border)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="flex items-stretch" style={{ height: 60 }}>

        {/* AI인사이트 */}
        {(['stocks', 'notifications', 'settings'] as NavTab[]).map((id) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className="flex-1 flex flex-col items-center justify-center relative transition-all active:scale-95"
              aria-label={id === 'stocks' ? 'AI인사이트' : id === 'notifications' ? '알림' : '설정'}
            >
              {isActive && (
                <span
                  className="absolute top-0 w-9 h-[3px] rounded-b-[5px]"
                  style={{ background: 'linear-gradient(135deg,#7F77DD,#DB2877)', boxShadow: '0 0 12px rgba(219,39,119,0.7)' }}
                />
              )}

              {id === 'notifications' ? (
                // jp: 알림 탭 — AlertBell (미읽음 있으면 흔들림 + 그라데이션)
                <span
                  className="w-[44px] h-[34px] rounded-[12px] flex items-center justify-center transition-all"
                  style={{
                    background: isActive ? 'linear-gradient(135deg,#7F77DD,#DB2877)' : 'transparent',
                    boxShadow: isActive ? '0 5px 16px rgba(219,39,119,0.4)' : 'none',
                  }}
                >
                  <AlertBell
                    on={hasUnread}
                    size={22}
                    shake={hasUnread}
                    tone={isActive ? 'muted' : hasUnread ? 'gradient' : 'muted'}
                  />
                </span>
              ) : (
                // jp: 나머지 탭 — 일반 아이콘
                <span
                  className="w-[44px] h-[34px] rounded-[12px] flex items-center justify-center transition-all"
                  style={{
                    background: isActive ? 'linear-gradient(135deg,#7F77DD,#DB2877)' : 'transparent',
                    boxShadow: isActive ? '0 5px 16px rgba(219,39,119,0.4)' : 'none',
                  }}
                >
                  {id === 'stocks' && (
                    <Sparkles size={22} strokeWidth={isActive ? 2.4 : 1.9} color={isActive ? '#fff' : 'var(--text-tertiary)'} fill="none" />
                  )}
                  {id === 'settings' && (
                    <Settings size={22} strokeWidth={isActive ? 2.4 : 1.9} color={isActive ? '#fff' : 'var(--text-tertiary)'} fill="none" />
                  )}
                </span>
              )}
            </button>
          );
        })}

      </div>
    </nav>
  );
}
