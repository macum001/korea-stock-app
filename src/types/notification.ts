// jp: 알림 관련 타입 정의 + 5종 공시 뱃지
export type NotificationType =
  | 'price_up'       // 가격 상승 알림
  | 'price_down'     // 가격 하락 알림
  | 'change_rate'    // 등락률 알림
  | 'volume_surge'   // 거래량 급증
  | 'disclosure'     // 공시 알림
  | 'important_disclosure' // 중요 공시
  | 'system';        // 시스템/공지 알림
export interface AppNotification {
  id: string;
  type: NotificationType;
  stockCode: string;
  stockName: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: number; // timestamp
  category?: DisclosureCategory; // jp: 공시 알림이면 유형 (뱃지용)
  receiptNo?: string; // jp: 공시 접수번호 (알림 클릭 → 공시 상세/AI분석용)
}
// jp: 알림 유형별 아이콘/색상 설정
export const NOTIFICATION_CONFIG: Record<
  NotificationType,
  { emoji: string; color: string }
> = {
  price_up:             { emoji: '📈', color: '#ff5252' },
  price_down:           { emoji: '📉', color: '#5c8aff' },
  change_rate:          { emoji: '⚡', color: '#f59e0b' },
  volume_surge:         { emoji: '🔥', color: '#f97316' },
  disclosure:           { emoji: '📋', color: '#ffffff' },
  important_disclosure: { emoji: '🚨', color: '#ff5252' },
  system:               { emoji: '🔔', color: '#9898a8' },
};
// ============================================================
// jp: 공시 5종 유형 뱃지
// ============================================================
export type DisclosureCategory = 'capital' | 'good' | 'bad' | 'important' | 'general';
// jp: 알림센터 탭 (공지 추가)
export type NotificationTab = 'all' | 'price' | 'disclosure' | 'notice';
// jp: 공시 유형 뱃지 설정
export const DISCLOSURE_BADGE: Record<
  DisclosureCategory,
  { label: string; color: string; bg: string }
> = {
  capital:   { label: '자본조달', color: '#ffffff', bg: 'rgba(255,255,255,0.15)' },
  good:      { label: '호재',     color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
  bad:       { label: '악재',     color: '#ff5252', bg: 'rgba(255,82,82,0.15)' },
  important: { label: '중요',     color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  general:   { label: '일반',     color: '#9898a8', bg: 'rgba(152,152,168,0.15)' },
};
// jp: 가격 알림 뱃지 (파랑 계열)
export const PRICE_BADGE = { label: '가격', color: '#5c8aff', bg: 'rgba(92,138,255,0.15)' };
// jp: 공지 알림 뱃지
export const NOTICE_BADGE = { label: '공지', color: '#6366f1', bg: 'rgba(99,102,241,0.15)' };
// jp: 백엔드 알림 → 뱃지 결정 (type + category로)
export function getNotificationBadge(
  type: string,
  category?: string | null
): { label: string; color: string; bg: string } {
  if (type === 'system') return NOTICE_BADGE;
  if (type === 'disclosure' || type === 'important_disclosure') {
    if (category && category in DISCLOSURE_BADGE) {
      return DISCLOSURE_BADGE[category as DisclosureCategory];
    }
    return DISCLOSURE_BADGE.important;
  }
  if (type === 'price' || type === 'price_up' || type === 'price_down' ||
      type === 'change_rate' || type === 'volume' || type === 'volume_surge') {
    return PRICE_BADGE;
  }
  return DISCLOSURE_BADGE.general;
}
// jp: 알림이 어느 탭에 속하는지
export function getNotificationTab(type: string): NotificationTab {
  if (type === 'disclosure' || type === 'important_disclosure') return 'disclosure';
  if (type === 'price' || type === 'price_up' || type === 'price_down' ||
      type === 'change_rate' || type === 'volume' || type === 'volume_surge') return 'price';
  if (type === 'system') return 'notice';
  return 'all';
}
