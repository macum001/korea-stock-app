// jp: FCM 서비스 (프론트) - 알림 권한 요청, 토큰 받기, 백엔드 등록
// jp: 사양 5번: 알림 조건 일치 시 푸시. 이 파일은 "푸시 받을 준비"를 담당

import { getToken, onMessage } from 'firebase/messaging';
import { getFcmMessaging, VAPID_KEY } from './firebaseConfig';
import { apiClient } from '../apiClient';

// jp: 현재 알림 권한 상태
export function getNotificationPermission(): NotificationPermission {
  if (typeof Notification === 'undefined') return 'denied';
  return Notification.permission;
}

// jp: 알림 켜기 - 권한 요청 → 토큰 받기 → 백엔드 등록
// jp: 반환: 성공 여부
export async function enablePushNotifications(): Promise<{ ok: boolean; reason?: string }> {
  // jp: 1. 브라우저 지원 확인
  if (typeof Notification === 'undefined') {
    return { ok: false, reason: '이 브라우저는 알림을 지원하지 않아요.' };
  }

  // jp: 2. 권한 요청
  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') {
    return { ok: false, reason: '알림 권한이 거부됐어요. 브라우저 설정에서 허용해주세요.' };
  }

  // jp: 3. Service Worker 등록
  let swRegistration: ServiceWorkerRegistration | undefined;
  try {
    if ('serviceWorker' in navigator) {
      swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    }
  } catch (err) {
    console.error('[FCM] Service Worker 등록 실패:', err);
    return { ok: false, reason: 'Service Worker 등록에 실패했어요.' };
  }

  // jp: 4. FCM 메시징 초기화
  const messaging = await getFcmMessaging();
  if (!messaging) {
    return { ok: false, reason: '이 브라우저는 푸시를 지원하지 않아요.' };
  }

  // jp: 5. 토큰 받기
  try {
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swRegistration,
    });
    if (!token) {
      return { ok: false, reason: '토큰을 받지 못했어요.' };
    }

    // jp: 6. 백엔드에 토큰 등록
    await apiClient.post('/api/fcm/token', { token });

    // jp: 7. 포그라운드(앱 열려있을 때) 메시지 수신 핸들러
    onMessage(messaging, (payload) => {
      console.log('[FCM] 포그라운드 메시지:', payload);
      // jp: 앱이 열려있을 때도 브라우저 알림 표시
      const title = payload.notification?.title || '공시탐정 AI';
      const body = payload.notification?.body || '';
      if (Notification.permission === 'granted') {
        new Notification(title, { body, icon: '/icon-192.png' });
      }
    });

    console.log('[FCM] 푸시 알림 활성화 완료');
    return { ok: true };
  } catch (err) {
    console.error('[FCM] 토큰 발급 실패:', err);
    return { ok: false, reason: '토큰 발급에 실패했어요.' };
  }
}

// jp: 알림 끄기 - 백엔드에서 토큰 제거
export async function disablePushNotifications(): Promise<void> {
  const messaging = await getFcmMessaging();
  if (!messaging) return;
  try {
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    if (token) {
      await apiClient.delete('/api/fcm/token', { token });
    }
  } catch (err) {
    console.error('[FCM] 토큰 해제 실패:', err);
  }
}

// jp: 테스트 푸시 발송 (개발용)
export async function sendTestPush(): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await apiClient.post<{ sent?: number; total?: number; error?: string }>('/api/fcm/test', {});
    if (res?.error) return { ok: false, message: res.error };
    return { ok: true, message: `${res?.sent ?? 0}개 기기로 발송했어요.` };
  } catch {
    return { ok: false, message: '테스트 푸시 발송 실패' };
  }
}
