# OPERATIONS

## 장마감 snapshot 수동 확정

운영 중 장마감 snapshot을 강제로 저장해야 할 때:

```bash
cd backend
npm run snapshot:finalize -- CLOSED
```

또는 관리자 API:

```bash
curl -X POST \
  -H "x-admin-key: $ADMIN_API_KEY" \
  http://localhost:4000/api/market/snapshot/005930/finalize
```

## 주요 헬스체크

```bash
curl http://localhost:4000/health
curl http://localhost:4000/api/market/status
curl http://localhost:4000/api/market/snapshot/005930
```

## Redis 주요 키

- `orderbook:live:{code}`: 최신 호가 snapshot
- `trades:live:{code}`: 최근 체결 1000개
- `price:live:{code}`: 최신 현재가
- `market_snapshot:{code}`: 장마감/복구용 snapshot

## 장애 대응

### WebSocket이 끊김
1. `/health`에서 clients 수 확인
2. 프론트 콘솔에서 stale reconnect 로그 확인
3. KIS 구독 한도 초과 여부 확인

### 장마감 후 데이터 없음
1. `/api/market/status` 확인
2. `/api/market/snapshot/{code}` 확인
3. 필요 시 `npm run snapshot:finalize -- CLOSED`

### 체결/차트 불일치
1. 체결 tick timestamp 확인
2. 마지막 체결가와 마지막 candle close 비교
3. bucket이 KST 09:00 기준인지 확인
