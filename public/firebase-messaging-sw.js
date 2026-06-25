// jp: Firebase Cloud Messaging Service Worker (백그라운드 수신)
// jp: 앱(탭)이 닫혀있거나 백그라운드일 때 푸시를 받아 알림 표시
// jp: 이 파일은 반드시 public 폴더 최상위에 있어야 함 (/firebase-messaging-sw.js)
// jp: SW는 ES모듈 import가 제약적이라 compat 버전을 CDN으로 로드

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// jp: config (공개값 - 비밀 아님)
firebase.initializeApp({
  apiKey: 'AIzaSyAlOGsLymyHMSRT9M6Wv4kA2Y_h-naeGco',
  authDomain: 'gongsi-app.firebaseapp.com',
  projectId: 'gongsi-app',
  storageBucket: 'gongsi-app.firebasestorage.app',
  messagingSenderId: '775841765576',
  appId: '1:775841765576:web:73b94b9886331e924badfd',
});

const messaging = firebase.messaging();

// jp: 백그라운드 메시지 수신 → 알림 표시
messaging.onBackgroundMessage((payload) => {
  console.log('[FCM-SW] 백그라운드 메시지:', payload);
  const title = (payload.notification && payload.notification.title) || '공시탐정 AI';
  const options = {
    body: (payload.notification && payload.notification.body) || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: payload.data || {},
  };
  self.registration.showNotification(title, options);
});

// jp: 알림 클릭 → 앱 열기
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // jp: 이미 열린 탭이 있으면 포커스, 없으면 새로 열기
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});
