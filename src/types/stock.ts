// jp: 증권앱 공통 타입 정의

export type ThemeMode = 'dark' | 'light';

export interface Stock {
  code: string;
  name: string;
  price: number;
  change: number;
  changeRate: number;
  volume: number;
  marketCap?: number;
  isFavorite: boolean;
  sector?: string;
  market?: 'KOSPI' | 'KOSDAQ';
  per?: number;
  pbr?: number;
  eps?: number;
  high52w?: number;
  low52w?: number;
  high52wDate?: string;
  low52wDate?: string;
  upperLimit?: number;
  lowerLimit?: number;
  tradingValue?: number;
}

export interface StockPrice {
  code: string;
  name?: string;
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

export interface Candle {
  time: number; // unix timestamp
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tradeValue?: number; // jp: 거래대금
}

export interface OrderBook {
  code: string;
  asks: OrderBookEntry[];
  bids: OrderBookEntry[];
  updatedAt: string;
}

export interface OrderBookEntry {
  price: number;
  quantity: number;
}

export interface TradeTick {
  code: string;
  price: number;
  quantity: number;
  tradeType: 'buy' | 'sell';
  tradedAt: string;
}

export interface InvestorFlow {
  date: string;
  individual: number;
  foreign: number;
  institution: number;
  other?: number;
  individualValue?: number;
  foreignValue?: number;
  institutionValue?: number;
  otherValue?: number;
  dataStatus?: 'ESTIMATED' | 'DELAYED' | 'CONFIRMED';
  financial: number;
  insurance: number;
  trust: number;
  bank: number;
  pension: number;
  etc: number;
}

export interface Watchlist {
  id: string;
  userId: string;
  stockCode: string;
  stockName: string;
  groupId?: string;
  order: number;
  memo?: string;
  priceAlert?: boolean;
  disclosureAlert?: boolean;
  createdAt: string;
}

export interface WatchlistGroup {
  id: string;
  name: string;
  order: number;
}

export interface Notification {
  id: string;
  userId: string;
  type: 'price' | 'disclosure' | 'volume' | 'change_rate';
  stockCode: string;
  stockName: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  nickname: string;
  createdAt: string;
}

// jp: 분봉 15/120/240 추가
export type PeriodType =
  | '1min' | '3min' | '5min' | '10min' | '15min'
  | '30min' | '60min' | '120min' | '240min'
  | 'day' | 'week' | 'month' | 'year';

export type SocketEvent =
  | 'subscribe_stock'
  | 'unsubscribe_stock'
  | 'subscribe_disclosure'
  | 'unsubscribe_disclosure'
  | 'stock_price_update'
  | 'stock_orderbook_update'
  | 'stock_trade_update'
  | 'disclosure_update'
  | 'important_disclosure_alert';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

export type AppErrorType =
  | 'API_ERROR'
  | 'SOCKET_DISCONNECTED'
  | 'TOKEN_EXPIRED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'DART_API_ERROR'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR';

export interface AppError {
  type: AppErrorType;
  message: string;
  userMessage: string;
  code?: number;
}

export const ERROR_MESSAGES: Record<AppErrorType, string> = {
  API_ERROR: '서버 데이터를 불러오지 못했습니다.',
  SOCKET_DISCONNECTED: '실시간 연결이 잠시 끊겼습니다. 다시 연결 중입니다.',
  TOKEN_EXPIRED: '로그인이 만료됐습니다. 다시 시도해주세요.',
  RATE_LIMIT_EXCEEDED: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
  DART_API_ERROR: '공시 정보를 불러오지 못했습니다.',
  NETWORK_ERROR: '네트워크 연결을 확인해주세요.',
  UNKNOWN_ERROR: '알 수 없는 오류가 발생했습니다.',
};

export interface OrderbookLevel {
  price: number;
  volume: number;
}

export interface Orderbook {
  code: string;
  ask: OrderbookLevel[];
  bid: OrderbookLevel[];
  totalAskVolume: number;
  totalBidVolume: number;
  updatedAt: string;
}
