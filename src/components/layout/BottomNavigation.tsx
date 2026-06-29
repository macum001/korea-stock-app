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
                  style={{ background: '#ffffff', boxShadow: '0 0 10px rgba(255,255,255,0.6)' }}
                />
              )}

              {id === 'notifications' ? (
                // jp: 알림 탭 — AlertBell (미읽음 있으면 흔들림 + 그라데이션)
                <span
                  className="w-[60px] h-[46px] rounded-[14px] flex items-center justify-center transition-all"
                  style={{
                    background: isActive ? '#ffffff' : 'transparent',
                    boxShadow: isActive ? '0 4px 14px rgba(255,255,255,0.35)' : 'none',
                  }}
                >
                  <AlertBell
                    on={hasUnread}
                    size={26}
                    shake={hasUnread}
                    tone={isActive ? 'muted' : hasUnread ? 'gradient' : 'muted'}
                  />
                </span>
              ) : (
                // jp: 나머지 탭 — 일반 아이콘
                <span
                  className="w-[60px] h-[46px] rounded-[14px] flex items-center justify-center transition-all"
                  style={{
                    background: isActive ? '#ffffff' : 'transparent',
                    boxShadow: isActive ? '0 4px 14px rgba(255,255,255,0.35)' : 'none',
                  }}
                >
                  {id === 'stocks' && (
                    <Sparkles size={26} strokeWidth={isActive ? 2.4 : 1.9} color={isActive ? '#000000' : 'var(--text-tertiary)'} fill="none" />
                  )}
                  {id === 'settings' && (
                    <Settings size={26} strokeWidth={isActive ? 2.4 : 1.9} color={isActive ? '#000000' : 'var(--text-tertiary)'} fill="none" />
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
