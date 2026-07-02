// jp: 백엔드 공통 타입 정의

// jp: API 응답 형식 통일
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// jp: 주식 관련 타입
export interface StockPrice {
  code: string;
  name: string;
  price: number;
  change: number;
  changeRate: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
  updatedAt: string;
}

export interface StockInfo {
  code: string;
  name: string;
  market: 'KOSPI' | 'KOSDAQ';
  sector: string;
  marketCap: number;
  per: number;
  pbr: number;
  eps: number;
  volume?: number;   // jp: 거래량
  high52w?: number;  // jp: 52주 최고
  low52w?: number;   // jp: 52주 최저
  upperLimit?: number;   // jp: 상한가
  lowerLimit?: number;   // jp: 하한가
  high52wDate?: string;  // jp: 52주 최고 날짜
  low52wDate?: string;   // jp: 52주 최저 날짜
  tradingValue?: number; // jp: 거래대금
}

// jp: 공시 타입
export type DisclosureImportance = 'important' | 'warning' | 'normal';
export type DisclosureSentiment  = 'positive' | 'negative' | 'neutral' | 'caution';

export interface Disclosure {
  id: string;
  stockCode: string;
  stockName: string;
  corpCode: string;
  reportName: string;
  receiptNo: string;
  disclosureType: string;
  importance: DisclosureImportance;
  sentiment: DisclosureSentiment;
  summary: string;
  originalUrl: string;
  disclosedAt: string;
  createdAt: string;
  market?: string | null;
}

// jp: KIS API 토큰
export interface KisToken {
  accessToken: string;
  expiresAt: number; // timestamp
}

// jp: WebSocket 이벤트 타입
export type WsEventType =
  | 'subscribe_stock'
  | 'unsubscribe_stock'
  | 'subscribe_disclosure'
  | 'unsubscribe_disclosure'
  | 'stock_price_update'
  | 'disclosure_update'
  | 'important_disclosure_alert'
  | 'subscribe_orderbook'
  | 'unsubscribe_orderbook'
  | 'subscribe_trade'
  | 'unsubscribe_trade'
  | 'orderbook_update'
  | 'trade_update'
  | 'trade_snapshot'
  | 'ping'
  | 'pong'
  | 'error';

export interface WsMessage {
  type: WsEventType;
  payload: unknown;
}

// jp: 에러 타입
export type AppErrorType =
  | 'API_ERROR'
  | 'SOCKET_DISCONNECTED'
  | 'TOKEN_EXPIRED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'DART_API_ERROR'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR';
