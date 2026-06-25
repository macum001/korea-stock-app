// jp: 알림페이지 - 공시/관리자공지 탭 + 날짜그룹 + 펼침 UX
// jp: 탭 스타일 AI인사이트와 동일한 박스형으로 변경
import { useEffect, useMemo, useState } from 'react';
import { useNotificationStore } from '@/store/notificationStore';
import { getNotificationTab, getNotificationBadge, NotificationTab } from '@/types/notification';
import { NotificationBadge } from '@/components/notification/NotificationBadge';
import { AlertBell } from '@/components/common/AlertBell';
import { CheckCheck, Trash2, Sparkles } from 'lucide-react';

interface NotificationPageProps {
  onBack?: () => void;
  onGoToStock?: (stockCode: string, stockName?: string) => void;
  onOpenDisclosure?: (receiptNo: string, stockCode: string, stockName?: string) => void;
}

function timeLabel(ts: number): string {
  const d = Date.now() - ts;
  const m = Math.floor(d / 60000);
  const h = Math.floor(d / 3600000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  if (h < 24) return `${h}시간 전`;
  const date = new Date(ts);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function dateGroup(ts: number): string {
  const now = new Date();
  const d = new Date(ts);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((today - target) / 86400000);
  if (diffDays <= 0) return '오늘';
  if (diffDays === 1) return '어제';
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

const TABS: { key: NotificationTab; label: string }[] = [
  { key: 'disclosure', label: '공시' },
  { key: 'notice',     label: '관리자 공지' },
];

export function NotificationPage({ onBack, onGoToStock, onOpenDisclosure }: NotificationPageProps) {
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification, clearAll, loading } =
    useNotificationStore();
  const loadFromServer = useNotificationStore(s => s.loadFromServer);
  const [tab, setTab] = useState<NotificationTab>('disclosure');

  useEffect(() => { loadFromServer(); }, [loadFromServer]);

  const filtered = useMemo(() => {
    if (tab === 'all') return notifications;
    return notifications.filter(n => getNotificationTab(n.type) === tab);
  }, [notifications, tab]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const n of filtered) {
      const key = dateGroup(n.createdAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(n);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const tabUnread = useMemo(() => {
    const c: Record<string, number> = { all: 0, price: 0, disclosure: 0, notice: 0 };
    for (const n of notifications) {
      if (n.isRead) continue;
      c.all++;
      const t = getNotificationTab(n.type);
      if (t === 'price') c.price++;
      else if (t === 'disclosure') c.disclosure++;
      else if (t === 'notice') c.notice++;
    }
    return c;
  }, [notifications]);

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg-primary)' }}>

      {/* jp: 헤더 — 그라데이션 + 컴팩트 (알림 텍스트 제거) */}
      <div style={{ background: 'linear-gradient(135deg,#7F77DD,#DB2877)', padding: '8px 10px' }}>
        {/* jp: 뒤로가기 + 액션버튼 한 줄 */}
        <div className="flex items-center justify-between mb-[7px]">
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <span className="text-[10px] px-2 py-[3px] rounded-full" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}>
                안읽음 {unreadCount}개
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {unreadCount > 0 && (
              <button onClick={markAllAsRead}
                className="flex items-center gap-1 px-2.5 h-7 rounded-full text-[11px] font-semibold"
                style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}>
                <CheckCheck size={13} /> 모두 읽음
              </button>
            )}
            {notifications.length > 0 && (
              <button onClick={clearAll}
                className="w-7 h-7 flex items-center justify-center rounded-full"
                style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}>
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>

        {/* jp: 탭 한 줄 */}
        <div className="flex gap-[5px]">
          {TABS.map(({ key, label }) => {
            const on = tab === key;
            const cnt = tabUnread[key];
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className="flex-1 flex items-center justify-center gap-1 text-[10px] font-bold py-[9px] rounded-[10px] transition-all"
                style={{
                  color: on ? '#fff' : 'rgba(255,255,255,0.5)',
                  background: on ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)',
                  border: on ? '1px solid rgba(255,255,255,0.55)' : '1px solid rgba(255,255,255,0.12)',
                }}
              >
                {label}
                {cnt > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[14px] h-[14px] px-1 rounded-full text-[8px] font-bold"
                    style={{ background: on ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.25)', color: '#fff' }}>
                    {cnt}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* jp: 콘텐츠 */}
      {loading && notifications.length === 0 ? (
        <div className="py-24 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>불러오는 중..</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center px-8">
          <div className="w-[120px] h-[120px] rounded-[36px] flex items-center justify-center mb-5"
            style={{ background: 'linear-gradient(135deg, rgba(127,119,221,0.12), rgba(219,39,119,0.10))', border: '1px solid rgba(219,39,119,0.22)' }}>
            <AlertBell on={true} size={60} shake={true} tone="gradient" />
          </div>
          <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>알림이 없어요</p>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>공시·가격 알림이 여기 표시돼요</p>
        </div>
      ) : (
        <div className="pb-28">
          {groups.map(([groupKey, items]) => (
            <div key={groupKey}>
              <p className="px-4 pt-4 pb-2 text-xs font-bold" style={{ color: 'var(--text-tertiary)' }}>{groupKey}</p>
              {items.map(n => {
                const tabType = getNotificationTab(n.type);
                const badge = getNotificationBadge(n.type, n.category);
                const isDisclosure = tabType === 'disclosure';
                const canOpen = isDisclosure && !!n.receiptNo && !!onOpenDisclosure;

                const handleClick = () => {
                  if (!n.isRead) markAsRead(n.id);
                  if (canOpen) onOpenDisclosure!(n.receiptNo!, n.stockCode, n.stockName);
                };

                return (
                  <div key={n.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <div
                      onClick={handleClick}
                      className={`w-full flex items-start gap-3 px-4 py-3.5 text-left transition-all ${canOpen ? 'cursor-pointer active:scale-[0.99]' : ''}`}
                      style={{ background: n.isRead ? 'transparent' : 'var(--bg-elevated)' }}
                    >
                      <div className="pt-0.5">
                        <NotificationBadge type={n.type} category={n.category} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                              {n.stockName || n.title}
                            </p>
                            <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold"
                              style={{ background: badge.bg, color: badge.color }}>
                              {badge.label}
                            </span>
                          </div>
                          <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>
                            {timeLabel(n.createdAt)}
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed mt-0.5 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                          {n.message || n.title}
                        </p>
                        {canOpen && (
                          <p className="text-[11px] font-bold mt-1.5 flex items-center gap-1" style={{ color: 'var(--pink2, #F9A8D4)' }}>
                            <Sparkles size={11} /> 탭하면 AI 분석 보기
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-center gap-2 flex-shrink-0 pt-1">
                        {!n.isRead && <span className="w-2 h-2 rounded-full" style={{ background: '#A78BFA' }} />}
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteNotification(n.id); }}
                          className="w-6 h-6 flex items-center justify-center rounded-full"
                          style={{ background: 'var(--bg-card)', color: 'var(--text-tertiary)' }}
                          aria-label="알림 삭제">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          <p className="text-center text-[10px] py-6" style={{ color: 'var(--text-tertiary)' }}>최근 50개까지 표시돼요</p>
        </div>
      )}
    </div>
  );
}
