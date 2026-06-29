// jp: 푸시 알림 켜기/끄기 토글
// jp: 디폴트: localStorage에 값 없으면 '켜짐'으로 표시 (첫 진입 시 켜진 상태)
// jp:   → 실제 끄면 localStorage에 '0' 저장, 이후 재진입 시 꺼짐 유지

import { useState, useEffect } from 'react';
import { Bell, BellOff } from 'lucide-react';
import {
  enablePushNotifications,
  disablePushNotifications,
  getNotificationPermission,
} from '@/services/fcm/fcmService';

const PUSH_OFF_KEY = 'push_disabled'; // jp: 끈 경우만 저장 (없으면 켜짐이 디폴트)

function isPushOn(): boolean {
  // jp: 명시적으로 끈 경우만 false, 그 외(첫 진입 포함)는 true
  return localStorage.getItem(PUSH_OFF_KEY) !== '1';
}

export function PushNotificationToggle() {
  const [on, setOn] = useState(true); // jp: 디폴트 켜짐
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    const perm = getNotificationPermission();
    setDenied(perm === 'denied');
    if (perm === 'denied') {
      localStorage.setItem(PUSH_OFF_KEY, '1');
      setOn(false);
    } else {
      setOn(isPushOn());
    }
  }, []);

  const handleEnable = async () => {
    setLoading(true); setMessage('');
    const res = await enablePushNotifications();
    if (res.ok) {
      localStorage.removeItem(PUSH_OFF_KEY);
      setOn(true);
      setMessage('푸시 알림이 켜졌어요!');
    } else {
      setMessage(res.reason || '실패했어요.');
      setDenied(getNotificationPermission() === 'denied');
    }
    setLoading(false);
  };

  const handleDisable = async () => {
    setLoading(true); setMessage('');
    await disablePushNotifications();
    localStorage.setItem(PUSH_OFF_KEY, '1');
    setOn(false);
    setMessage('푸시 알림이 꺼졌어요.');
    setLoading(false);
  };

  return (
    <div className="rounded-2xl p-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'var(--bg-primary)', color: on ? 'var(--accent)' : 'var(--text-tertiary)' }}>
          {on ? <Bell size={20} /> : <BellOff size={20} />}
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>푸시 알림</p>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {on ? '새 공시·알림을 즉시 받아요' : '새 공시·알림을 앱으로 전달받기'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {!on ? (
          <button onClick={handleEnable} disabled={loading || denied}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all active:opacity-70 disabled:opacity-50"
            style={{ background: 'var(--accent)', color: '#000' }}>
            {loading ? '설정 중..' : '알림 켜기'}
          </button>
        ) : (
          <button onClick={handleDisable} disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all active:opacity-70 disabled:opacity-50"
            style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
            {loading ? '설정 중..' : '알림 끄기'}
          </button>
        )}
      </div>

      {message && (
        <p className="text-xs mt-3 text-center" style={{ color: 'var(--text-secondary)' }}>{message}</p>
      )}

      {denied && (
        <p className="text-xs mt-3 text-center" style={{ color: 'var(--fall)' }}>
          기기에서 알림이 차단됐어요. 브라우저 설정에서 알림 허용으로 변경해주세요.
        </p>
      )}
    </div>
  );
}
