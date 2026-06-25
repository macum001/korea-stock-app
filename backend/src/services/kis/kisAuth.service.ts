// jp: 한국투자증권 인증 서비스 - 실제 토큰 발급/갱신

import axios from 'axios';
import { safeGet, safeSetEx, CacheKey, CACHE_TTL } from '../../config/redis';
import { ENV } from '../../config/env';
import { KisToken } from '../../types';

// jp: 실제 KIS 토큰 발급
async function fetchNewToken(): Promise<KisToken> {
  const res = await axios.post(
    `${ENV.KIS.BASE_URL}/oauth2/tokenP`,
    {
      grant_type: 'client_credentials',
      appkey:     ENV.KIS.APP_KEY,
      appsecret:  ENV.KIS.APP_SECRET,
    },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    }
  );

  if (!res.data.access_token) {
    throw new Error(`토큰 발급 실패: ${res.data.msg1 || '알 수 없는 오류'}`);
  }

  return {
    accessToken: res.data.access_token,
    // jp: 만료 10분 전에 갱신하도록 여유 둠
    expiresAt: Date.now() + (res.data.expires_in - 600) * 1000,
  };
}

// jp: 토큰 조회 - Redis 캐시 우선, 없으면 새로 발급
export async function getKisToken(): Promise<string> {
  // jp: Redis 캐시 확인
  const cached = await safeGet(CacheKey.kisToken());
  if (cached) {
    try {
      const token: KisToken = JSON.parse(cached);
      if (token.expiresAt > Date.now()) return token.accessToken;
    } catch { /* 캐시 파싱 실패 시 새로 발급 */ }
  }

  // jp: mock 모드
  if (!ENV.KIS.APP_KEY || ENV.KIS.APP_KEY === 'your_app_key_here') {
    console.log('[KIS] mock 모드 - 더미 토큰 사용');
    return 'mock_access_token';
  }

  // jp: 실제 토큰 발급
  try {
    console.log('[KIS] 토큰 발급 중...');
    const token = await fetchNewToken();
    await safeSetEx(CacheKey.kisToken(), CACHE_TTL.TOKEN, JSON.stringify(token));
    console.log('[KIS] 토큰 발급 완료');
    return token.accessToken;
  } catch (err) {
    console.error('[KIS] 토큰 발급 실패:', err);
    throw err;
  }
}

// jp: 토큰 강제 갱신 (스케줄러에서 호출)
export async function refreshKisToken(): Promise<void> {
  if (!ENV.KIS.APP_KEY || ENV.KIS.APP_KEY === 'your_app_key_here') return;
  try {
    const token = await fetchNewToken();
    await safeSetEx(CacheKey.kisToken(), CACHE_TTL.TOKEN, JSON.stringify(token));
    console.log('[KIS] 토큰 갱신 완료');
  } catch (err) {
    console.error('[KIS] 토큰 갱신 실패:', err);
  }
}

// jp: WebSocket 접속키(approval_key) 발급 - REST access_token과 별개!
// jp: KIS WebSocket은 /oauth2/Approval로 받은 approval_key를 header에 써야 함
// jp: REST 토큰을 쓰면 연결이 거부되거나 불안정 (연결 끊김 원인)
const WS_APPROVAL_CACHE_KEY = 'kis:ws:approval';

export async function getKisApprovalKey(): Promise<string> {
  // jp: 캐시 우선 (approval_key는 발급 후 비교적 오래 유효)
  const cached = await safeGet(WS_APPROVAL_CACHE_KEY);
  if (cached) return cached;

  if (!ENV.KIS.APP_KEY || ENV.KIS.APP_KEY === 'your_app_key_here') {
    return 'mock_approval_key';
  }

  try {
    console.log('[KIS-WS] 접속키(approval_key) 발급 중...');
    const res = await axios.post(
      `${ENV.KIS.BASE_URL}/oauth2/Approval`,
      {
        grant_type: 'client_credentials',
        appkey:     ENV.KIS.APP_KEY,
        secretkey:  ENV.KIS.APP_SECRET, // jp: approval은 secretkey 필드명 사용 (tokenP의 appsecret과 다름)
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
    );
    const approvalKey = res.data.approval_key;
    if (!approvalKey) throw new Error(`approval_key 발급 실패: ${JSON.stringify(res.data)}`);
    // jp: 12시간 캐시
    await safeSetEx(WS_APPROVAL_CACHE_KEY, 60 * 60 * 12, approvalKey);
    console.log('[KIS-WS] 접속키 발급 완료');
    return approvalKey;
  } catch (err) {
    console.error('[KIS-WS] 접속키 발급 실패:', err);
    throw err;
  }
}
