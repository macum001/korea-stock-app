// jp: 우측 상단 종 아이콘 - ★ 박스/테두리 완전 제거, 그라데이션 라인 종만 (C타입)
// jp: 안읽음 있으면 그라데이션 + 딸랑 흔들림 + 빨강 숫자 배지 / 없으면 라인 종
import { AlertBell } from '@/components/common/AlertBell';
interface BellButtonProps {
  unreadCount?: number;
  onClick: () => void;
}
export function BellButton({ unreadCount = 0, onClick }: BellButtonProps) {
  const hasUnread = unreadCount > 0;
  return (
    <button
      onClick={onClick}
      className="relative w-[42px] h-[42px] flex items-center justify-center active:scale-90 transition-all"
      style={{ background: 'transparent', border: 'none' }}
      aria-label={`알림${hasUnread ? ` ${unreadCount}개` : ''}`}
    >
      {/* jp: 박스 없이 그라데이션 라인 종만 - 항상 그라데이션(잘 보이게) */}
      <AlertBell on={hasUnread} size={25} tone="gradient" shake={hasUnread} />
      {hasUnread && (
        <span
          className="absolute -top-[3px] -right-[3px] min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full text-[10px] font-extrabold"
          style={{ background: 'var(--danger)', color: '#fff', border: '2px solid var(--bg-primary)' }}
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
}
