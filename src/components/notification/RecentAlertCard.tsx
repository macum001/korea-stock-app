// jp: 홈 최근 알림 카드 (목업 ①)
// jp: "최근 알림" + 전체보기 / 최대 3개 / 유형 뱃지 / 실데이터(notificationStore)
// jp: 빨간 종 헤더, 어두운 카드, 라운드, 뱃지

import { useEffect } from 'react';
import { useNotificationStore } from '@/store/notificationStore';
import { NotificationBadge } from '@/components/notification/NotificationBadge';
import { Bell, ChevronRight } from 'lucide-react';

interface RecentAlertCardProps {
  onViewAll: () => void; // jp: 전체보기 → 알림센터
}

function timeAgo(ts: number): string {
  const d = Date.now() - ts;
  const m = Math.floor(d / 60000);
  const h = Math.floor(d / 3600000);
  const day = Math.floor(d / 86400000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  if (h < 24) return `${h}시간 전`;
  return `${day}일 전`;
}

export function RecentAlertCard({ onViewAll }: RecentAlertCardProps) {
  const { notifications } = useNotificationStore();
  const loadFromServer = useNotificationStore(s => s.loadFromServer);

  // jp: 홈 진입 시 한 번 로드 (이미 로드돼 있으면 빠르게 갱신)
  useEffect(() => { loadFromServer(); }, [loadFromServer]);

  // jp: 알림 없으면 카드 자체를 숨김 (홈을 깔끔하게)
  if (notifications.length === 0) return null;

  const recent = notifications.slice(0, 3);

  return (
    <div className="px-4 pt-1 pb-2">
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        {/* jp: 헤더 - 빨간 종 + 최근 알림 + 전체보기 */}
        <button
          onClick={onViewAll}
          className="flex items-center justify-between w-full px-4 py-3"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2">
            <Bell size={15} style={{ color: 'var(--rise)' }} className="fill-current" />
            <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              최근 알림
            </span>
          </div>
          <div className="flex items-center gap-0.5">
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>전체보기</span>
            <ChevronRight size={14} style={{ color: 'var(--text-tertiary)' }} />
          </div>
        </button>

        {/* jp: 최근 3개 */}
        <div>
          {recent.map((n, i) => (
            <button
              key={n.id}
              onClick={onViewAll}
              className="flex items-center gap-2.5 w-full px-4 py-2.5 text-left"
              style={{ borderBottom: i < recent.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}
            >
              <NotificationBadge type={n.type} category={n.category} size="sm" />
              <span className="text-xs font-bold flex-shrink-0" style={{ color: 'var(--text-primary)' }}>
                {n.stockName || ''}
              </span>
              <span className="text-xs flex-1 min-w-0 truncate" style={{ color: 'var(--text-secondary)' }}>
                {n.message || n.title}
              </span>
              <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>
                {timeAgo(n.createdAt)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
