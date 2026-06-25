// jp: Firebase 초기화 (프론트) - FCM용
// jp: 이 config 값들은 공개돼도 되는 값 (웹앱에 그대로 노출됨, 비밀 아님)
// jp: 보안은 Firebase 규칙/서버 측에서 처리

import { initializeApp, FirebaseApp } from 'firebase/app';
import { getMessaging, Messaging, isSupported } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: 'AIzaSyAlOGsLymyHMSRT9M6Wv4kA2Y_h-naeGco',
  authDomain: 'gongsi-app.firebaseapp.com',
  projectId: 'gongsi-app',
  storageBucket: 'gongsi-app.firebasestorage.app',
  messagingSenderId: '775841765576',
  appId: '1:775841765576:web:73b94b9886331e924badfd',
};

// jp: VAPID 키 (웹 푸시 인증서 - 공개키)
export const VAPID_KEY = 'BPqmL5laEzL8mpQ64ZWuD5Wph5OKHh-fX9ouUXSokpV5Ubitd_WH3Qsburl6CtcTD-07MijYdaIO1smNvm2P4Eo';

let app: FirebaseApp | null = null;
let messaging: Messaging | null = null;

// jp: 브라우저가 FCM 지원하는지 + 초기화
export async function getFcmMessaging(): Promise<Messaging | null> {
  try {
    const supported = await isSupported();
    if (!supported) {
      console.warn('[FCM] 이 브라우저는 푸시를 지원하지 않아요.');
      return null;
    }
    if (!app) {
      app = initializeApp(firebaseConfig);
    }
    if (!messaging) {
      messaging = getMessaging(app);
    }
    return messaging;
  } catch (err) {
    console.error('[FCM] 초기화 실패:', err);
    return null;
  }
}
