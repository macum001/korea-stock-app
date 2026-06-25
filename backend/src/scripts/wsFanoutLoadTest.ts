// jp: WebSocket fanout 부하테스트 스크립트
// jp: 실제 KIS 장중 테스트 전, WS 서버가 다수 클라이언트/구독을 버티는지 로컬에서 확인한다.
// jp: 사용 예시
// jp:   WS_URL=ws://localhost:4000/ws CLIENTS=200 SYMBOL=005930 npm --prefix backend run benchmark:ws-fanout

import WebSocket from 'ws';

const WS_URL = process.env.WS_URL || 'ws://localhost:4000/ws';
const CLIENTS = Math.max(1, Number(process.env.CLIENTS || 100));
const SYMBOL = process.env.SYMBOL || '005930';
const DURATION_MS = Math.max(10_000, Number(process.env.DURATION_MS || 60_000));
const STAGGER_MS = Math.max(0, Number(process.env.STAGGER_MS || 5));

type Stats = {
  connected: number;
  closed: number;
  orderbook: number;
  trades: number;
  errors: number;
  firstMessageAt?: number;
  lastMessageAt?: number;
};

const stats: Stats = { connected: 0, closed: 0, orderbook: 0, trades: 0, errors: 0 };
const sockets: WebSocket[] = [];
const startedAt = Date.now();

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function markMessage(type: string): void {
  const now = Date.now();
  stats.firstMessageAt ??= now;
  stats.lastMessageAt = now;
  if (type === 'orderbook_update') stats.orderbook += 1;
  if (type === 'trade_update') stats.trades += 1;
}

async function connectClient(index: number): Promise<void> {
  const ws = new WebSocket(WS_URL);
  sockets.push(ws);

  ws.on('open', () => {
    stats.connected += 1;
    ws.send(JSON.stringify({ type: 'subscribe_orderbook', payload: { code: SYMBOL } }));
    ws.send(JSON.stringify({ type: 'subscribe_trade', payload: { code: SYMBOL } }));
    if (index % 25 === 0) {
      console.log(`[WS-LOAD] connected=${stats.connected}/${CLIENTS}`);
    }
  });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as { type?: string };
      if (msg.type) markMessage(msg.type);
    } catch {
      // ignore
    }
  });

  ws.on('close', () => { stats.closed += 1; });
  ws.on('error', () => { stats.errors += 1; });
}

async function main(): Promise<void> {
  console.log(`[WS-LOAD] url=${WS_URL} clients=${CLIENTS} symbol=${SYMBOL} duration=${DURATION_MS}ms`);
  for (let i = 0; i < CLIENTS; i++) {
    void connectClient(i);
    if (STAGGER_MS) await sleep(STAGGER_MS);
  }

  await sleep(DURATION_MS);
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'unsubscribe_orderbook', payload: { code: SYMBOL } }));
      ws.send(JSON.stringify({ type: 'unsubscribe_trade', payload: { code: SYMBOL } }));
      ws.close();
    }
  }

  const elapsedSec = (Date.now() - startedAt) / 1000;
  const totalRealtimeMessages = stats.orderbook + stats.trades;
  console.log(JSON.stringify({
    ok: stats.errors === 0,
    elapsedSec,
    connected: stats.connected,
    closed: stats.closed,
    errors: stats.errors,
    orderbookMessages: stats.orderbook,
    tradeMessages: stats.trades,
    totalRealtimeMessages,
    messagesPerSecond: Number((totalRealtimeMessages / Math.max(elapsedSec, 1)).toFixed(2)),
    firstMessageLagMs: stats.firstMessageAt ? stats.firstMessageAt - startedAt : null,
    lastMessageAgeMs: stats.lastMessageAt ? Date.now() - stats.lastMessageAt : null,
  }, null, 2));

  process.exit(stats.errors === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('[WS-LOAD] failed', err);
  process.exit(1);
});
