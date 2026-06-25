// jp: API 캐시/스냅샷 부하테스트 - REST 경로 Redis hit 성능 확인
import http from 'k6/http';
import { check, sleep } from 'k6';

const apiBase = __ENV.API_BASE_URL || 'http://localhost:4000';
const symbol = __ENV.SYMBOL || '005930';

export const options = {
  stages: [
    { duration: '30s', target: Number(__ENV.VUS || 50) },
    { duration: __ENV.DURATION || '60s', target: Number(__ENV.VUS || 50) },
    { duration: '20s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<300', 'p(99)<700'],
  },
};

export default function () {
  const endpoints = [
    `/api/market/status`,
    `/api/market/snapshot/${symbol}`,
    `/api/stocks/${symbol}/orderbook`,
    `/api/stocks/${symbol}/trades?limit=300`,
    `/api/stocks/${symbol}/minute-candles?timeframe=5m&limit=300`,
  ];
  for (const path of endpoints) {
    const res = http.get(`${apiBase}${path}`, { timeout: '3s' });
    check(res, { [`${path} 2xx/3xx/404 allowed`]: (r) => [200, 204, 304, 404].includes(r.status) });
  }
  sleep(1);
}
