// jp: 실시간 시세 Event Bus
// jp: KIS tick 하나를 현재가/체결창/차트/스냅샷/알림이 같은 원본 이벤트로 처리하게 만드는 중앙 버스

import { EventEmitter } from 'events';
import type { RealtimeOrderbook, RealtimeTrade } from '../kis/kisOrderbookWs.service';

export type MarketEventType = 'orderbook' | 'trade';

export interface MarketEventMeta {
  providerTimestamp?: number;
  backendReceivedAt: number;
  busPublishedAt: number;
}

export interface OrderbookEvent {
  type: 'orderbook';
  code: string;
  data: RealtimeOrderbook;
  meta: MarketEventMeta;
}

export interface TradeEvent {
  type: 'trade';
  code: string;
  data: RealtimeTrade;
  meta: MarketEventMeta;
}

type EventMap = {
  orderbook: OrderbookEvent;
  trade: TradeEvent;
};

type Handler<T extends MarketEventType> = (event: EventMap[T]) => void | Promise<void>;

class MarketEventBusService {
  private emitter = new EventEmitter();
  private counts = { orderbook: 0, trade: 0 };

  constructor() {
    this.emitter.setMaxListeners(2000);
  }

  on<T extends MarketEventType>(type: T, handler: Handler<T>): () => void {
    const wrapped = (event: EventMap[T]) => {
      try {
        void handler(event);
      } catch (err) {
        console.error(`[MarketEventBus] ${type} handler error:`, err instanceof Error ? err.message : err);
      }
    };
    this.emitter.on(type, wrapped);
    return () => this.emitter.off(type, wrapped);
  }

  publishOrderbook(data: RealtimeOrderbook): OrderbookEvent {
    const event: OrderbookEvent = {
      type: 'orderbook',
      code: data.code,
      data,
      meta: {
        backendReceivedAt: data.backendReceivedAt ?? Date.now(),
        busPublishedAt: Date.now(),
      },
    };
    this.counts.orderbook += 1;
    this.emitter.emit('orderbook', event);
    return event;
  }

  publishTrade(data: RealtimeTrade): TradeEvent {
    const event: TradeEvent = {
      type: 'trade',
      code: data.code,
      data,
      meta: {
        providerTimestamp: data.providerTimestamp,
        backendReceivedAt: data.backendReceivedAt ?? Date.now(),
        busPublishedAt: Date.now(),
      },
    };
    this.counts.trade += 1;
    this.emitter.emit('trade', event);
    return event;
  }

  getStats(): { orderbookEvents: number; tradeEvents: number; orderbookListeners: number; tradeListeners: number } {
    return {
      orderbookEvents: this.counts.orderbook,
      tradeEvents: this.counts.trade,
      orderbookListeners: this.emitter.listenerCount('orderbook'),
      tradeListeners: this.emitter.listenerCount('trade'),
    };
  }
}

export const marketEventBus = new MarketEventBusService();
