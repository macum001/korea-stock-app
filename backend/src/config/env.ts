// jp: 환경변수 관리 - 모든 설정값은 여기서만 읽음 (API 키는 절대 코드에 하드코딩 금지)

import dotenv from 'dotenv';
dotenv.config();

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) {
    console.warn(`[ENV] ${key} 가 설정되지 않았습니다.`);
    return '';
  }
  return val;
}

export const ENV = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '4000', 10),
  IS_DEV: process.env.NODE_ENV !== 'production',

  // jp: 운영 역할 분리 - 토스급 확장 시 API/Realtime/Worker를 별도 프로세스로 띄움
  SERVER_ROLE: (process.env.SERVER_ROLE || 'all') as 'all' | 'api' | 'realtime' | 'worker' | 'batch',

  // jp: 한국투자증권 API - 절대 로그에 찍지 말 것
  KIS: {
    APP_KEY:    requireEnv('KIS_APP_KEY'),
    APP_SECRET: requireEnv('KIS_APP_SECRET'),
    ACCOUNT_NO: requireEnv('KIS_ACCOUNT_NO'),
    REAL_MODE:  process.env.KIS_REAL_MODE === 'true',
    BASE_URL:   process.env.KIS_REAL_MODE === 'true'
      ? 'https://openapi.koreainvestment.com:9443'
      : 'https://openapivts.koreainvestment.com:29443',
    WS_URL:     process.env.KIS_REAL_MODE === 'true'
      ? 'ws://ops.koreainvestment.com:21000'
      : 'ws://ops.koreainvestment.com:31000',
  },

  // jp: OpenDART API
  DART: {
    API_KEY:  requireEnv('DART_API_KEY'),
    BASE_URL: 'https://opendart.fss.or.kr/api',
  },
  // jp: Voyage AI 임베딩 (RAG 주석 검색용)
  VOYAGE: {
    API_KEY: process.env.VOYAGE_API_KEY || '',
    MODEL: process.env.VOYAGE_MODEL || 'voyage-3.5',
  },

  NAVER: {
    CLIENT_ID:     requireEnv('NAVER_CLIENT_ID'),
    CLIENT_SECRET: requireEnv('NAVER_CLIENT_SECRET'),
    SEARCH_CLIENT_ID:     process.env.NAVER_SEARCH_CLIENT_ID || process.env.NAVER_CLIENT_ID || '',
    SEARCH_CLIENT_SECRET: process.env.NAVER_SEARCH_CLIENT_SECRET || process.env.NAVER_CLIENT_SECRET || '',
  },

  GOOGLE: {
    CLIENT_ID:     process.env.GOOGLE_CLIENT_ID || '',
    CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
  },


  // jp: 공시 AI 요약 (Claude API). feature flag로 보호 - 기본 OFF (비용 발생하므로 명시적 ON 필요)
  AI_DISCLOSURE: {
    ENABLED: process.env.ENABLE_AI_DISCLOSURE_SUMMARY === 'true',
    // jp: ANTHROPIC_API_KEY 또는 CLAUDE_API_KEY 둘 다 허용
    API_KEY: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || '',
    MODEL: process.env.AI_DISCLOSURE_MODEL || 'claude-haiku-4-5-20251001',
  },

  DATABASE_URL: requireEnv('DATABASE_URL'),
  REDIS_URL:    requireEnv('REDIS_URL'),
  JWT_SECRET:   requireEnv('JWT_SECRET'),
  // jp: 관리자 API 보호 키 - 헤더 x-admin-key로 검증. 미설정이면 관리자 API 차단
  ADMIN_API_KEY: process.env.ADMIN_API_KEY || '',
  CORS_ORIGIN:  process.env.CORS_ORIGIN || 'http://localhost:5173',

  // jp: mock 데이터 사용 여부 - production 기본값은 false. 개발에서만 USE_MOCK_DATA=true로 명시 사용.
  USE_MOCK_DATA: process.env.USE_MOCK_DATA === 'true' && process.env.NODE_ENV !== 'production',
  // jp: 공시 mock 여부 - production에서는 강제 false.
  USE_MOCK_DISCLOSURE: process.env.USE_MOCK_DISCLOSURE === 'true' && process.env.NODE_ENV !== 'production',
  // jp: 정기 수집이 가져올 최근 일수 (기본 7일). 전체 시장 최신 공시를 이 기간만큼 받음
  DISCLOSURE_SYNC_DAYS: parseInt(process.env.DISCLOSURE_SYNC_DAYS || '7', 10),
};


