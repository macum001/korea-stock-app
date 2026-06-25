// jp: WebSocket 브로드캐스트 서비스
// jp: Redis Pub/Sub Subscriber → WS 클라이언트 브로드캐스트
// jp: 수정: subscribePubSub 사용 (subscribe 아님), 타입 직접 정의

import { WebSocketServer, WebSocket } from 'ws';
import {
  subscribePubSub,
  PUBSUB_CHANNELS,
} from '../pubsub/redisPubSub.service';

// jp: WS 구독 타입
type WsSubscription = 'PRICE' | 'DISCLOSURE' | 'ALL';

// jp: WS 클라이언트 데이터
interface WsClient {
  ws: WebSocket;
  subscriptions: Set<WsSubscription>;
  subscribedCodes: Set<string>;
  connectedAt: number;
  lastPingAt: number;
}

let wss: WebSocketServer | null = null;
const clients = new Map<WebSocket, WsClient>();

// ─────────────────────────────────────────
// jp: WSS 초기화 및 Redis Pub/Sub 구독 연결
// ─────────────────────────────────────────
export async function initWsBroadcast(wsServer: WebSocketServer): Promise<void> {
  wss = wsServer;

  wss.on('connection', (ws: WebSocket) => {
    const client: WsClient = {
      ws,
      subscriptions: new Set(['ALL']),
      subscribedCodes: new Set(),
      connectedAt: Date.now(),
      lastPingAt: Date.now(),
    };
    clients.set(ws, client);
    console.log(`[WS] 클라이언트 연결 (총 ${clients.size}명)`);

    ws.on('message', (raw) => handleClientMessage(ws, raw.toString()));
    ws.on('close', () => {
      clients.delete(ws);
      console.log(`[WS] 클라이언트 제거 (총 ${clients.size}명)`);
    });
    ws.on('pong', () => {
      const c = clients.get(ws);
      if (c) c.lastPingAt = Date.now();
    });

    sendToClient(ws, { type: 'CONNECTED', data: { timestamp: new Date().toISOString() } });
  });

  // jp: Redis Pub/Sub → WS 브리지 (subscribePubSub 사용)
  await subscribePubSub(PUBSUB_CHANNELS.PRICE_UPDATE, (msg: unknown) => {
    const m = msg as { type: string; data: unknown };
    if (m?.type === 'PRICE_UPDATE') broadcastPriceUpdate(m.data);
  });

  await subscribePubSub(PUBSUB_CHANNELS.DISCLOSURE_NEW, (msg: unknown) => {
    const m = msg as { type: string; data: unknown };
    if (m?.type === 'DISCLOSURE_NEW') broadcastDisclosureNew(m.data);
  });

  startHeartbeat();
  console.log('[WS] 브로드캐스트 서비스 초기화 완료 (Redis Pub/Sub 연결)');
}

// ─────────────────────────────────────────
// jp: 브로드캐스트 함수
// ─────────────────────────────────────────

// jp: 주가 업데이트 - 해당 종목 구독자에게만 전송
function broadcastPriceUpdate(data: unknown): void {
  const prices = Array.isArray(data) ? data : [data];

  clients.forEach((client, ws) => {
    if (!isClientAlive(ws)) return;

    const relevant = client.subscribedCodes.size > 0
      ? prices.filter((p: unknown) => {
          const item = p as { code?: string };
          return item?.code && client.subscribedCodes.has(item.code);
        })
      : prices;

    if (relevant.length > 0) {
      sendToClient(ws, { type: 'PRICE_UPDATE', data: relevant });
    }
  });
}

// jp: 공시 신규 - 전체 브로드캐스트
function broadcastDisclosureNew(data: unknown): void {
  clients.forEach((_, ws) => {
    if (!isClientAlive(ws)) return;
    sendToClient(ws, { type: 'DISCLOSURE_NEW', data });
  });
}

// jp: 직접 브로드캐스트 (Redis 없이 사용할 때 - 대갚)
export function broadcastDirect(data: object): void {
  const payload = JSON.stringify(data);
  clients.forEach((_, ws) => {
    if (isClientAlive(ws)) ws.send(payload);
  });
}

// ─────────────────────────────────────────
// jp: 클라이언트 메시지 처리
// ─────────────────────────────────────────
function handleClientMessage(ws: WebSocket, raw: string): void {
  try {
    const msg = JSON.parse(raw) as { type: string; codes?: string[] };
    const client = clients.get(ws);
    if (!client) return;

    switch (msg.type) {
      case 'SUBSCRIBE_CODES':
        if (Array.isArray(msg.codes)) {
          msg.codes.forEach((code: string) => client.subscribedCodes.add(code));
        }
        break;
      case 'UNSUBSCRIBE_CODES':
        if (Array.isArray(msg.codes)) {
          msg.codes.forEach((code: string) => client.subscribedCodes.delete(code));
        }
        break;
      case 'PING':
        sendToClient(ws, { type: 'PONG', data: { timestamp: Date.now() } });
        break;
    }
  } catch { /* 파싱 실패 무시 */ }
}

// ─────────────────────────────────────────
// jp: 유틸
// ─────────────────────────────────────────
function sendToClient(ws: WebSocket, data: object): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function isClientAlive(ws: WebSocket): boolean {
  return ws.readyState === WebSocket.OPEN;
}

// jp: Heartbeat - 30초마다 ping, 60초 무응답이면 연결 종료
function startHeartbeat(): void {
  setInterval(() => {
    const now = Date.now();
    clients.forEach((client, ws) => {
      if (now - client.lastPingAt > 60_000) {
        ws.terminate();
        clients.delete(ws);
        return;
      }
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    });
  }, 30_000);
}

export function getConnectedClientsCount(): number {
  return clients.size;
}
