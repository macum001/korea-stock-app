// jp: 알림 유형 뱃지 (공통) - 호재/악재/자본조달/중요/가격/일반
// jp: 이미지 ①⑦의 좌측 색상 뱃지 ("호재" 초록, "악재" 빨강, "가격" 파랑 등)

import { getNotificationBadge } from '@/types/notification';

interface NotificationBadgeProps {
  type: string;
  category?: string | null;
  size?: 'sm' | 'md';
}

export function NotificationBadge({ type, category, size = 'md' }: NotificationBadgeProps) {
  const badge = getNotificationBadge(type, category);
  const pad = size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]';

  return (
    <span
      className={`inline-flex items-center justify-center rounded-md font-bold flex-shrink-0 ${pad}`}
      style={{ color: badge.color, background: badge.bg }}
    >
      {badge.label}
    </span>
  );
}
