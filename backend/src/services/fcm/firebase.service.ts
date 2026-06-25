// jp: Firebase Admin (FCM) 서비스 - 백엔드에서 푸시 발송
// jp: 서비스 계정 키(firebase-service-account.json)로 초기화
// jp: 이 파일이 없으면 조용히 비활성 (서버는 정상 동작, 푸시만 스킵)
// jp: firebase-admin v12+ 권장: 서브모듈(app/messaging) 직접 import

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getMessaging, SendResponse } from 'firebase-admin/messaging';

let initialized = false;
let enabled = false;

export function initFcm(): void {
  if (initialized) return;
  initialized = true;
  const keyPath = join(process.cwd(), 'firebase-service-account.json');
  if (!existsSync(keyPath)) {
    console.log('[FCM] 서비스 계정 키 없음 → 푸시 비활성 (firebase-service-account.json)');
    return;
  }
  try {
    const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf-8'));
    initializeApp({ credential: cert(serviceAccount) });
    enabled = true;
    console.log('[FCM] 초기화 완료 - 푸시 발송 활성');
  } catch (err) {
    console.error('[FCM] 초기화 실패:', err instanceof Error ? err.message : err);
  }
}

export function isFcmEnabled(): boolean {
  return enabled;
}

export async function sendPushToToken(
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<boolean> {
  if (!enabled) return false;
  try {
    await getMessaging().send({
      token,
      notification: { title, body },
      data: data || {},
      webpush: {
        fcmOptions: { link: '/' },
        notification: { icon: '/icon-192.png', badge: '/icon-192.png' },
      },
    });
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[FCM] 발송 실패 (${token.slice(0, 12)}...):`, msg);
    return false;
  }
}

export async function sendPushToTokens(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<{ successCount: number; failedTokens: string[] }> {
  if (!enabled || tokens.length === 0) {
    return { successCount: 0, failedTokens: [] };
  }
  const BATCH = 500;
  let successCount = 0;
  const failedTokens: string[] = [];
  for (let start = 0; start < tokens.length; start += BATCH) {
    const chunk = tokens.slice(start, start + BATCH);
    try {
      const res = await getMessaging().sendEachForMulticast({
        tokens: chunk,
        notification: { title, body },
        data: data || {},
        webpush: {
          fcmOptions: { link: '/' },
          notification: { icon: '/icon-192.png', badge: '/icon-192.png' },
        },
      });
      successCount += res.successCount;
      res.responses.forEach((r: SendResponse, i: number) => {
        if (!r.success) failedTokens.push(chunk[i]);
      });
    } catch (err) {
      console.error('[FCM] 멀티캐스트 배치 실패:', err instanceof Error ? err.message : err);
      failedTokens.push(...chunk);
    }
  }
  return { successCount, failedTokens };
}

// jp: ===== 소리 제어 발송 (시황 브리핑 알림용) =====
// jp: silent=true → 조용한 알림 (소리·진동 없음, 알림창에만)
// jp: silent=false → 소리 알림 (소리·진동 울림, 중요 이벤트)

export async function sendPushWithSound(
  tokens: string[],
  title: string,
  body: string,
  silent: boolean,
  data?: Record<string, string>
): Promise<{ successCount: number; failedTokens: string[] }> {
  if (!enabled || tokens.length === 0) {
    return { successCount: 0, failedTokens: [] };
  }

  const BATCH = 500;
  let successCount = 0;
  const failedTokens: string[] = [];

  for (let start = 0; start < tokens.length; start += BATCH) {
    const chunk = tokens.slice(start, start + BATCH);
    try {
      const res = await getMessaging().sendEachForMulticast({
        tokens: chunk,
        notification: { title, body },
        data: data || {},
        // jp: 안드로이드 - 채널 분리 + priority
        android: {
          priority: silent ? 'normal' : 'high',
          notification: {
            // jp: 채널 2개: 중요(소리) / 일반(무음). 클라이언트에서 채널 생성 필요
            channelId: silent ? 'briefing_quiet' : 'briefing_important',
            sound: silent ? undefined : 'default',
            defaultSound: !silent,
            defaultVibrateTimings: !silent,
          },
        },
        // jp: iOS - sound 넣고 빼기
        apns: {
          payload: {
            aps: silent
              ? { sound: undefined, 'content-available': 1 }
              : { sound: 'default' },
          },
        },
        // jp: 웹 - 무음이면 silent 플래그
        webpush: {
          fcmOptions: { link: '/' },
          notification: {
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            silent: silent,
          },
        },
      });
      successCount += res.successCount;
      res.responses.forEach((r: SendResponse, i: number) => {
        if (!r.success) failedTokens.push(chunk[i]);
      });
    } catch (err) {
      console.error('[FCM] 소리제어 배치 실패:', err instanceof Error ? err.message : err);
      failedTokens.push(...chunk);
    }
  }
  return { successCount, failedTokens };
}
