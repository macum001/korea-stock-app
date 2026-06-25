// jp: 프론트엔드 WebSocket 서버
// jp: 토스급 수평확장 버전
// jp: 클라이언트별 KIS callback 누적을 제거하고, 종목당 내부 구독 1개 → Redis Pub/Sub fanout → WS 클라이언트 배포 구조로 변경

import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { kisWsService } from '../kis/kisWebSocket.service';
import { kisOrderbookWs, RealtimeOrderbook, RealtimeTrade } from '../kis/kisOrderbookWs.service';
import { StockPrice, WsMessage } from '../../types';
import { isRedisReady } from '../../config/redis';
import {
  subscribePubSub,
  publishPriceUpdate,
  PUBSUB_CHANNELS,
} from '../pubsub/redisPubSub.service';
import { getLatestOrderbook, getRecentTrades } from '../market/marketSnapshot.service';
import { realtimeCacheConfig } from '../cache/marketRealtimeCache.service';
import { acquireKisSubscriptionLock, getKisSubscriptionLockStats, releaseKisSubscriptionLock } from './distributedKisSubscriptionLock.service';

interface ClientInfo {
  ws: WebSocket;
  isAlive: boolean;
  subscribedStocks: Set<string>;
  subscribedOrderbooks: Set<string>;
  subscribedTrades: Set<string>;
  priceCbs: Map<string, (d: StockPrice) => void>;
}

interface MarketFanoutMessage<T = unknown> {
  type: 'trade' | 'orderbook';
  code: string;
  payload: T;
  ts: number;
}

class SocketServerService {
  private wss: WebSocketServer | null = null;
  private clients = new Map<string, ClientInfo>();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private lockReconcileTimer: NodeJS.Timeout | null = null;

  // jp: 종목별 내부 KIS 구독은 서버 프로세스당 1개만 유지한다.
  // jp: Redis가 살아 있으면 Pub/Sub fanout으로 배포, Redis 장애 시에는 이 콜백에서 직접 local broadcast fallback.
  private orderbookRefCounts = new Map<string, number>();
  private tradeRefCounts = new Map<string, number>();
  private orderbookInternalCbs = new Map<string, (d: RealtimeOrderbook) => void>();
  private tradeInternalCbs = new Map<string, (d: RealtimeTrade) => void>();

  async init(server: Server): Promise<void> {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws: WebSocket) => {
      const id = `c-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      this.clients.set(id, {
        ws,
        isAlive: true,
        subscribedStocks: new Set(),
        subscribedOrderbooks: new Set(),
        subscribedTrades: new Set(),
        priceCbs: new Map(),
      });
      console.log(`[WS] 클라이언트 연결: ${id} (현재 ${this.clients.size}명)`);

      ws.on('pong', () => { const c = this.clients.get(id); if (c) c.isAlive = true; });
      ws.on('message', (data: Buffer) => this.handleMessage(id, data.toString()));
      ws.on('close', () => this.handleDisconnect(id));
      ws.on('error', (err) => console.error(`[WS] 에러 (${id}):`, err.message));

      this.send(ws, { type: 'stock_price_update', payload: { status: 'connected' } });
    });

    await subscribePubSub(PUBSUB_CHANNELS.PRICE_UPDATE, (msg: unknown) => {
      const m = msg as { type: string; data: StockPrice };
      if (m?.type === 'PRICE_UPDATE' && m.data) {
        this.broadcastPriceToSubscribers(m.data);
      }
    });

    await subscribePubSub(PUBSUB_CHANNELS.DISCLOSURE_NEW, (msg: unknown) => {
      const m = msg as { type: string; data: unknown };
      if (m?.type === 'DISCLOSURE_NEW' && m.data) {
        this.broadcastDisclosure(m.data);
      }
    });

    // jp: 실시간 호가/체결 공용 fanout 채널. WS 서버가 여러 대여도 같은 Redis 이벤트를 받아 자기 클라이언트에게만 송신한다.
    await subscribePubSub(realtimeCacheConfig.pubsubChannel, (msg: unknown) => {
      const m = msg as MarketFanoutMessage;
      if (!m?.code || !m.type || !m.payload) return;
      if (m.type === 'orderbook') {
        this.broadcastOrderbookToSubscribers(m.code, m.payload as RealtimeOrderbook, m.ts);
      } else if (m.type === 'trade') {
        this.broadcastTradeToSubscribers(m.code, m.payload as RealtimeTrade, m.ts);
      }
    });

    this.startHeartbeat();
    this.startLockReconcile();
    console.log('[WS] 프론트엔드 WebSocket 서버 시작 (시장 fanout Pub/Sub + KIS distributed lock 연결됨)');
  }

  private handleMessage(id: string, raw: string): void {
    const client = this.clients.get(id);
    if (!client) return;
    try {
      const msg: WsMessage = JSON.parse(raw);
      client.isAlive = true;

      if (msg.type === 'ping') {
        this.send(client.ws, { type: 'pong', payload: { ts: Date.now() } });
        return;
      }

      if (msg.type === 'subscribe_stock') {
        const code = (msg.payload as { code: string }).code;
        if (!code || !/^\d{6}$/.test(code)) return;
        if (client.subscribedStocks.size >= 50) return;
        client.subscribedStocks.add(code);

        if (!client.priceCbs.has(code)) {
          const cb = (price: StockPrice) => {
            void publishPriceUpdate(price).then((ok) => {
              if (!ok) this.broadcastPriceToSubscribers(price);
            });
          };
          client.priceCbs.set(code, cb);
          kisWsService.subscribe(code, cb);
        }

      } else if (msg.type === 'unsubscribe_stock') {
        const code = (msg.payload as { code: string }).code;
        if (code) {
          client.subscribedStocks.delete(code);
          const cb = client.priceCbs.get(code);
          if (cb) {
            kisWsService.unsubscribe(code, cb);
            client.priceCbs.delete(code);
          }
        }

      } else if (msg.type === 'subscribe_orderbook') {
        const code = (msg.payload as { code: string }).code;
        if (!code || !/^\d{6}$/.test(code)) return;
        if (client.subscribedOrderbooks.has(code)) return;
        if (client.subscribedOrderbooks.size >= 50) return;
        client.subscribedOrderbooks.add(code);
        void getLatestOrderbook<RealtimeOrderbook>(code).then(last => {
          if (last) this.send(client.ws, { type: 'orderbook_update', payload: { ...last, wsBroadcastAt: Date.now() } });
        });
        void this.retainOrderbook(code);

      } else if (msg.type === 'unsubscribe_orderbook') {
        const code = (msg.payload as { code: string }).code;
        if (code && client.subscribedOrderbooks.delete(code)) {
          void this.releaseOrderbook(code);
        }

      } else if (msg.type === 'subscribe_trade') {
        const code = (msg.payload as { code: string }).code;
        if (!code || !/^\d{6}$/.test(code)) return;
        if (client.subscribedTrades.has(code)) return;
        if (client.subscribedTrades.size >= 50) return;
        client.subscribedTrades.add(code);
        void getRecentTrades<RealtimeTrade>(code, 300).then(rows => {
          if (rows.length) this.send(client.ws, { type: 'trade_snapshot', payload: { code, trades: rows } });
        });
        void this.retainTrade(code);

      } else if (msg.type === 'unsubscribe_trade') {
        const code = (msg.payload as { code: string }).code;
        if (code && client.subscribedTrades.delete(code)) {
          void this.releaseTrade(code);
        }
      }
    } catch { /* ignore */ }
  }

  private async retainOrderbook(code: string): Promise<void> {
    const next = (this.orderbookRefCounts.get(code) || 0) + 1;
    this.orderbookRefCounts.set(code, next);
    if (next > 1) return;

    const cb = (d: RealtimeOrderbook) => {
      // jp: Redis 정상 시에는 market:events Pub/Sub 경로로만 송신해서 중복 전송 방지.
      if (!isRedisReady()) this.broadcastOrderbookToSubscribers(code, d, Date.now());
    };
    const ownsLock = await acquireKisSubscriptionLock('orderbook', code);
    if (!ownsLock) return;
    this.orderbookInternalCbs.set(code, cb);
    await kisOrderbookWs.subscribeOrderbook(code, cb);
  }

  private async releaseOrderbook(code: string): Promise<void> {
    const next = Math.max(0, (this.orderbookRefCounts.get(code) || 0) - 1);
    if (next > 0) {
      this.orderbookRefCounts.set(code, next);
      return;
    }
    this.orderbookRefCounts.delete(code);
    const cb = this.orderbookInternalCbs.get(code);
    if (cb) {
      await kisOrderbookWs.unsubscribeOrderbook(code, cb);
      this.orderbookInternalCbs.delete(code);
      await releaseKisSubscriptionLock('orderbook', code);
    }
  }

  private async retainTrade(code: string): Promise<void> {
    const next = (this.tradeRefCounts.get(code) || 0) + 1;
    this.tradeRefCounts.set(code, next);
    if (next > 1) return;

    const cb = (d: RealtimeTrade) => {
      if (!isRedisReady()) this.broadcastTradeToSubscribers(code, d, Date.now());
    };
    const ownsLock = await acquireKisSubscriptionLock('trade', code);
    if (!ownsLock) return;
    this.tradeInternalCbs.set(code, cb);
    await kisOrderbookWs.subscribeTrade(code, cb);
  }

  private async releaseTrade(code: string): Promise<void> {
    const next = Math.max(0, (this.tradeRefCounts.get(code) || 0) - 1);
    if (next > 0) {
      this.tradeRefCounts.set(code, next);
      return;
    }
    this.tradeRefCounts.delete(code);
    const cb = this.tradeInternalCbs.get(code);
    if (cb) {
      await kisOrderbookWs.unsubscribeTrade(code, cb);
      this.tradeInternalCbs.delete(code);
      await releaseKisSubscriptionLock('trade', code);
    }
  }

  private handleDisconnect(id: string): void {
    const client = this.clients.get(id);
    if (client) {
      client.priceCbs.forEach((cb, code) => {
        kisWsService.unsubscribe(code, cb);
      });
      client.subscribedOrderbooks.forEach((code) => {
        void this.releaseOrderbook(code);
      });
      client.subscribedTrades.forEach((code) => {
        void this.releaseTrade(code);
      });
    }
    this.clients.delete(id);
    console.log(`[WS] 클라이언트 제거: ${id} (현재 ${this.clients.size}명)`);
  }

  private broadcastPriceToSubscribers(price: StockPrice): void {
    this.clients.forEach(c => {
      if (c.subscribedStocks.has(price.code)) {
        this.send(c.ws, { type: 'stock_price_update', payload: price });
      }
    });
  }

  private broadcastOrderbookToSubscribers(code: string, data: RealtimeOrderbook, fanoutAt?: number): void {
    const payload = { ...data, fanoutAt, wsBroadcastAt: Date.now() };
    this.clients.forEach(c => {
      if (c.subscribedOrderbooks.has(code)) {
        this.send(c.ws, { type: 'orderbook_update', payload });
      }
    });
  }

  private broadcastTradeToSubscribers(code: string, data: RealtimeTrade, fanoutAt?: number): void {
    const payload = { ...data, fanoutAt, wsBroadcastAt: Date.now() };
    this.clients.forEach(c => {
      if (c.subscribedTrades.has(code)) {
        this.send(c.ws, { type: 'trade_update', payload });
      }
    });
  }

  broadcastDisclosure(disclosure: unknown): void {
    this.clients.forEach(c =>
      this.send(c.ws, { type: 'disclosure_update', payload: disclosure })
    );
  }

  private startLockReconcile(): void {
    if (this.lockReconcileTimer) return;
    this.lockReconcileTimer = setInterval(() => {
      // jp: lock을 못 잡았던 follower WS 서버도 owner 장애/TTL 만료 후 자동으로 KIS owner가 될 수 있게 재시도
      this.orderbookRefCounts.forEach((count, code) => {
        if (count > 0 && !this.orderbookInternalCbs.has(code)) void this.retainOrderbook(code);
      });
      this.tradeRefCounts.forEach((count, code) => {
        if (count > 0 && !this.tradeInternalCbs.has(code)) void this.retainTrade(code);
      });
    }, 5000);
    this.lockReconcileTimer.unref?.();
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      this.clients.forEach((client, id) => {
        if (client.ws.readyState !== WebSocket.OPEN) {
          this.handleDisconnect(id);
          return;
        }
        if (!client.isAlive) {
          console.warn(`[WS] heartbeat timeout: ${id}`);
          client.ws.terminate();
          this.handleDisconnect(id);
          return;
        }
        client.isAlive = false;
        client.ws.ping();
      });
    }, 30000);
  }

  shutdown(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.lockReconcileTimer) clearInterval(this.lockReconcileTimer);
    this.heartbeatTimer = null;
    this.lockReconcileTimer = null;
    this.clients.forEach((_, id) => this.handleDisconnect(id));
    this.wss?.close();
    this.wss = null;
  }

  private send(ws: WebSocket, msg: WsMessage): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  getClientCount(): number { return this.clients.size; }

  async getRealtimeFanoutStats(): Promise<Record<string, unknown>> {
    return {
      clients: this.clients.size,
      localOrderbookSymbols: this.orderbookRefCounts.size,
      localTradeSymbols: this.tradeRefCounts.size,
      orderbookRefCounts: Object.fromEntries(this.orderbookRefCounts),
      tradeRefCounts: Object.fromEntries(this.tradeRefCounts),
      redisReady: isRedisReady(),
      distributedLocks: await getKisSubscriptionLockStats(),
    };
  }
}

export const socketServer = new SocketServerService();
