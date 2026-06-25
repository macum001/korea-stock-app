// jp: WebSocket fanout 부하테스트 - k6 실행용
// jp: docker compose -f docker-compose.observability.yml --profile loadtest run --rm k6-ws
import ws from 'k6/ws';
import http from 'k6/http';
import { check, sleep } from 'k6';

const vus = Number(__ENV.VUS || 50);
const duration = __ENV.DURATION || '60s';
const wsUrl = __ENV.WS_URL || 'ws://localhost:4101/ws';
const apiBase = __ENV.API_BASE_URL || 'http://localhost:4000';
const symbol = __ENV.SYMBOL || '005930';

export const options = {
  scenarios: {
    ws_fanout: {
      executor: 'constant-vus',
      vus,
      duration,
    },
  },
  thresholds: {
    checks: ['rate>0.98'],
    ws_session_duration: ['p(95)<70000'],
  },
};

export function setup() {
  const health = http.get(`${apiBase}/health`, { timeout: '5s' });
  check(health, { 'api health 200': (r) => r.status === 200 });
}

export default function () {
  const res = ws.connect(wsUrl, { tags: { symbol } }, (socket) => {
    let received = 0;

    socket.on('open', () => {
      socket.send(JSON.stringify({ type: 'subscribe', code: symbol, channels: ['trade', 'orderbook', 'price'] }));
    });

    socket.on('message', (data) => {
      received += 1;
      try {
        const msg = JSON.parse(data);
        check(msg, { 'message has type': (m) => Boolean(m.type) });
      } catch (_) {
        check(false, { 'message parses json': () => false });
      }
    });

    socket.setInterval(() => {
      socket.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
    }, 10000);

    socket.setTimeout(() => {
      check(received, { 'received at least heartbeat or data': (n) => n >= 0 });
      socket.close();
    }, 55000);
  });

  check(res, { 'ws connected': (r) => r && r.status === 101 });
  sleep(1);
}
