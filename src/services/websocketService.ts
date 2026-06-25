// jp: WebSocket 서비스 - 백엔드 ws://localhost:4000/ws 연결
// jp: mock 시뮬레이션 완전 제거. 실제 데이터만. 연결 실패 시 빈 상태(가짜 금지)
// jp: 의심 tick(change를 price로 잘못 보낸 것) 필터링 포함
// jp: 추가: 호가(orderbook_update)/체결(trade_update) 구독 메서드
// jp: ★ 추가: 알림(notification) 실시간 수신 - 화면 보고 있을 때도 새로고침 없이 도착

import { StockPrice, ConnectionStatus } from '@/types/stock';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:4000/ws';

type PriceUpdateCallback = (price: StockPrice) => void;
type ConnectionCallback  = (status: ConnectionStatus) => void;
// jp: 호가/체결 범용 콜백
type GenericCallback = (payload: unknown) => void;
// jp: 알림 콜백
type NotificationCallback = (payload: unknown) => void;

export interface IWebSocketService {
  connect(): void;
  disconnect(): void;
  subscribeStock(code: string, callback: PriceUpdateCallback): void;
  unsubscribeStock(code: string): void;
  onConnectionChange(callback: ConnectionCallback): void;
  offConnectionChange(callback: ConnectionCallback): void;
  getStatus(): ConnectionStatus;
  // jp: 호가/체결 구독
  subscribeOrderbook(code: string, callback: GenericCallback): void;
  unsubscribeOrderbook(code: string, callback?: GenericCallback): void;
  subscribeTrade(code: string, callback: GenericCallback): void;
  unsubscribeTrade(code: string, callback?: GenericCallback): void;
  // jp: ★ 알림 구독 (전역 - 종목 무관)
  onNotification(callback: NotificationCallback): () => void;
}

function isSuspiciousTick(next: StockPrice, prevPrice: number | undefined): boolean {
  if (next.price == null || Number.isNaN(next.price) || next.price <= 0) return true;
  if (prevPrice && prevPrice > 0) {
    const diff = Math.abs(next.price - prevPrice) / prevPrice;
    if (diff > 0.30) return true;
  }
  if (next.change !== 0 && next.price === Math.abs(next.change)) return true;
  return false;
}

class WebSocketService implements IWebSocketService {
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = 'disconnected';
  // jp: 현재가도 호가/체결처럼 다중 콜백을 보존. 기존 Map<code, callback>은 같은 종목을 여러 화면이 구독하면 마지막 콜백만 남는 문제가 있었음.
  private subscriptions = new Map<string, Set<PriceUpdateCallback>>();
  private connectionCallbacks = new Set<ConnectionCallback>();
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT = 8;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPrice = new Map<string, number>();
  // jp: 호가/체결 구독 콜백 + 대기중 구독(연결 전 요청)
  private orderbookSubs = new Map<string, Set<GenericCallback>>();
  private tradeSubs = new Map<string, Set<GenericCallback>>();
  // jp: ★ 알림 구독 콜백 (전역)
  private notificationSubs = new Set<NotificationCallback>();
  private visibilityListenerReady = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastMessageAt = 0;

  connect(): void {
    if (this.status === 'connected' || this.status === 'connecting') return;
    this.setStatus('connecting');
    this._setupVisibilityListener();

    try {
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        console.log('[WS] 백엔드 연결 성공');
        this.reconnectAttempts = 0;
        this.setStatus('connected');
        this.lastMessageAt = Date.now();
        this._startHeartbeat();
        this.subscriptions.forEach((_, code) => this._sendSubscribe(code));
        // jp: 호가/체결 구독 복원
        this.orderbookSubs.forEach((_, code) => this._send('subscribe_orderbook', code));
        this.tradeSubs.forEach((_, code) => this._send('subscribe_trade', code));
        // jp: ★ 알림 구독 (전역) - 연결되면 항상 알림 채널 구독
        this._sendRaw({ type: 'subscribe_notifications', payload: {} });
      };

      this.ws.onmessage = (event) => { this.lastMessageAt = Date.now(); this._handleMessage(event.data); };

      this.ws.onclose = () => {
        this._stopHeartbeat();
        this.setStatus('disconnected');
        this._scheduleReconnect();
      };

      this.ws.onerror = () => {
        this._stopHeartbeat();
        this.ws = null;
        this.setStatus('disconnected');
        this._scheduleReconnect();
      };
    } catch {
      this.setStatus('disconnected');
      this._scheduleReconnect();
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this._stopHeartbeat();
    this.ws?.close();
    this.ws = null;
    this.setStatus('disconnected');
  }

  subscribeStock(code: string, callback: PriceUpdateCallback): void {
    const isNew = !this.subscriptions.has(code);
    if (isNew) this.subscriptions.set(code, new Set());
    this.subscriptions.get(code)!.add(callback);
    if (this.status === 'connected' && isNew) this._sendSubscribe(code);
  }

  unsubscribeStock(code: string, callback?: PriceUpdateCallback): void {
    const set = this.subscriptions.get(code);
    if (!set) return;
    if (callback) set.delete(callback); else set.clear();
    if (set.size === 0) {
      this.subscriptions.delete(code);
      this._sendUnsubscribe(code);
    }
  }

  // jp: 호가 구독 - 같은 종목을 여러 컴포넌트가 구독해도 콜백이 덮어써지지 않도록 Set으로 관리
  subscribeOrderbook(code: string, callback: GenericCallback): void {
    const isNew = !this.orderbookSubs.has(code);
    if (isNew) this.orderbookSubs.set(code, new Set());
    this.orderbookSubs.get(code)!.add(callback);
    if (this.status === 'connected' && isNew) this._send('subscribe_orderbook', code);
  }

  unsubscribeOrderbook(code: string, callback?: GenericCallback): void {
    const set = this.orderbookSubs.get(code);
    if (!set) return;
    if (callback) set.delete(callback); else set.clear();
    if (set.size === 0) {
      this.orderbookSubs.delete(code);
      if (this.status === 'connected') this._send('unsubscribe_orderbook', code);
    }
  }

  // jp: 체결 구독 - 같은 종목 다중 구독 보존
  subscribeTrade(code: string, callback: GenericCallback): void {
    const isNew = !this.tradeSubs.has(code);
    if (isNew) this.tradeSubs.set(code, new Set());
    this.tradeSubs.get(code)!.add(callback);
    if (this.status === 'connected' && isNew) this._send('subscribe_trade', code);
  }

  unsubscribeTrade(code: string, callback?: GenericCallback): void {
    const set = this.tradeSubs.get(code);
    if (!set) return;
    if (callback) set.delete(callback); else set.clear();
    if (set.size === 0) {
      this.tradeSubs.delete(code);
      if (this.status === 'connected') this._send('unsubscribe_trade', code);
    }
  }

  // jp: ★ 알림 구독 - 전역(종목 무관). 반환된 함수로 해제.
  onNotification(callback: NotificationCallback): () => void {
    this.notificationSubs.add(callback);
    // jp: 이미 연결돼 있으면 즉시 알림 채널 구독 요청
    if (this.status === 'connected') {
      this._sendRaw({ type: 'subscribe_notifications', payload: {} });
    }
    return () => { this.notificationSubs.delete(callback); };
  }

  onConnectionChange(cb: ConnectionCallback): void  { this.connectionCallbacks.add(cb); }
  offConnectionChange(cb: ConnectionCallback): void { this.connectionCallbacks.delete(cb); }
  getStatus(): ConnectionStatus { return this.status; }

  private _sendSubscribe(code: string): void {
    this._send('subscribe_stock', code);
  }

  private _sendUnsubscribe(code: string): void {
    this._send('unsubscribe_stock', code);
  }

  // jp: 범용 메시지 전송 (종목 코드 기반)
  private _send(type: string, code: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload: { code } }));
    }
  }

  // jp: 임의 메시지 전송
  private _sendRaw(obj: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  private _handleMessage(raw: string): void {
    try {
      const msg = JSON.parse(raw);

      if (msg.type === 'stock_price_update' && msg.payload?.code) {
        const price = msg.payload as StockPrice;
        const prev = this.lastPrice.get(price.code);
        if (isSuspiciousTick(price, prev)) {
          if (import.meta.env.DEV) {
            console.warn(`[price-debug] rejected suspicious tick stock=${price.code} prev=${prev} next=${price.price}`);
          }
          return;
        }
        this.lastPrice.set(price.code, price.price);
        const callbacks = this.subscriptions.get(price.code);
        callbacks?.forEach(cb => cb(price));

      } else if (msg.type === 'orderbook_update' && msg.payload?.code) {
        // jp: 실시간 호가
        const callbacks = this.orderbookSubs.get(msg.payload.code);
        callbacks?.forEach(cb => cb(msg.payload));

      } else if (msg.type === 'trade_update' && msg.payload?.code) {
        // jp: 실시간 체결 단건 append
        const callbacks = this.tradeSubs.get(msg.payload.code);
        callbacks?.forEach(cb => cb(msg.payload));

      } else if (msg.type === 'trade_snapshot' && msg.payload?.code && Array.isArray(msg.payload.trades)) {
        // jp: 재연결/초기 진입 시 서버 Redis에 보존된 최근 체결 300개를 한 번에 반영
        const callbacks = this.tradeSubs.get(msg.payload.code);
        callbacks?.forEach(cb => cb({ code: msg.payload.code, trades: msg.payload.trades, __snapshot: true }));

      } else if (msg.type === 'disclosure_update' && msg.payload) {
        // jp: ★ 실시간 공시 알림 - 백엔드 broadcastDisclosure 형식
        // jp: payload = { type:'important_disclosure_alert', disclosure:{...}, message }
        //     또는 payload = { type:'disclosure_update', disclosure:{...} }
        const inner = msg.payload as {
          type?: string;
          message?: string;
          disclosure?: Record<string, unknown>;
        };
        const dz = inner?.disclosure;
        // jp: 중요 공시 알림(important_disclosure_alert)만 알림센터로. 단순 update는 토스트 안 띄움.
        if (inner?.type === 'important_disclosure_alert' && dz) {
          const notif = {
            type: 'disclosure',
            title: inner.message || `${dz.stockName ?? ''} 공시`,
            message: String(dz.reportName ?? dz.summary ?? ''),
            stockCode: String(dz.stockCode ?? ''),
            stockName: dz.stockName ? String(dz.stockName) : undefined,
            receiptNo: dz.receiptNo ? String(dz.receiptNo) : undefined,
            category: dz.category ? String(dz.category) : undefined,
          };
          this.notificationSubs.forEach(cb => { try { cb(notif); } catch { /* ignore */ } });
        }

      } else if (msg.type === 'notification' && msg.payload) {
        // jp: (예비) 백엔드가 직접 notification 타입을 보낼 경우도 지원
        this.notificationSubs.forEach(cb => { try { cb(msg.payload); } catch { /* ignore */ } });

      } else if (msg.type === 'pong') {
        this.lastMessageAt = Date.now();
      }
    } catch { /* ignore */ }
  }

  private _scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.MAX_RECONNECT) {
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => {
        this.reconnectAttempts = 0;
        this.connect();
      }, 30000);
      return;
    }
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 16000);
    this.reconnectAttempts++;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private _setupVisibilityListener(): void {
    if (this.visibilityListenerReady || typeof document === 'undefined') return;
    this.visibilityListenerReady = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.status === 'disconnected') {
        this.connect();
      }
    }, { once: false });
  }

  private _startHeartbeat(): void {
    this._stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) return;
      // jp: 35초 이상 서버 메시지가 없으면 stale 연결로 판단하고 재연결
      if (this.lastMessageAt && Date.now() - this.lastMessageAt > 35000) {
        console.warn('[WS] stale connection detected, reconnecting');
        this.ws.close();
        return;
      }
      this.ws.send(JSON.stringify({ type: 'ping', payload: { ts: Date.now() } }));
    }, 15000);
  }

  private _stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.connectionCallbacks.forEach(cb => cb(status));
  }
}

export const websocketService: IWebSocketService = new WebSocketService();
