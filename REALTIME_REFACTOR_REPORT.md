# jp: 실시간 증권앱 구조 수정 보고서

## 적용 완료

### P0-1. 호가/체결 WebSocket push 중심 구조
- 수정 파일
  - `src/hooks/useRealtimeOrderbook.ts`
  - `src/services/websocketService.ts`
  - `src/services/tradesService.ts`
  - `backend/src/services/realtime/socketServer.service.ts`
  - `backend/src/services/kis/kisOrderbookWs.service.ts`
  - `backend/src/services/market/marketSnapshot.service.ts`
- 변경 내용
  - 상세 화면 실시간 경로의 2초 `setInterval` polling 제거.
  - REST는 최초 화면 bootstrap/Redis snapshot 보조 조회로만 사용.
  - 호가는 `orderbook_update` 수신 시 최신 snapshot 덮어쓰기.
  - 체결은 `trade_update` 수신 시 append, 프론트 기본 300개 유지.
  - 서버 Redis에는 최근 체결 최대 1000개 유지.
  - 클라이언트 구독 직후 서버가 `trade_snapshot`으로 최근 300개를 먼저 전송.

### P0-2. 장마감/재연결 snapshot 구조
- 수정/추가 파일
  - `backend/src/utils/marketTime.ts`
  - `backend/src/routes/orderbook.routes.ts`
  - `backend/src/routes/trades.routes.ts`
  - `backend/src/services/market/marketSnapshot.service.ts`
  - `backend/src/repositories/marketSnapshot.repository.ts`
  - `backend/src/db/schema.sql`
- 변경 내용
  - `PRE_MARKET`, `REGULAR_OPEN`, `AFTER_HOURS`, `CLOSED` 상태를 Asia/Seoul 기준으로 계산.
  - `CLOSED`를 `NO_DATA`로 처리하지 않도록 변경.
  - Redis 키 `market_snapshot:{symbol}`에 마지막 호가/체결/현재가 저장.
  - DB 테이블 `market_snapshots` 추가. Redis 재시작 후에도 복구 가능.
  - WebSocket 끊김/탭 전환 시 `setOrderbook(null)`, `setTrades([])`로 화면을 비우지 않음.

### P0-3. 차트와 체결 tick 동기화 + 한국장 bucket
- 수정 파일
  - `src/components/chart/StockChart.tsx`
  - `src/services/stockService.ts`
  - `backend/src/services/kis/kisRest.service.ts`
- 변경 내용
  - 1/3/5/10/15/30/60/120/240분봉 bucket을 한국장 09:00 KST 기준으로 계산.
  - 체결 tick 수신 시 차트 마지막 캔들의 `close`가 마지막 체결가와 같도록 갱신.
  - `candleSeries.update()`만 하지 않고 React `candles` state도 함께 갱신.
  - tick volume을 마지막 캔들 volume에 누적.
  - 일봉 조회는 `full=true`로 변경하고 프론트 보존 개수를 1000 → 3000으로 확대.

### 추가 정리
- 프론트 빌드를 깨던 잘못된 위치의 백엔드 파일 제거
  - `src/routes/admin/briefing.routes.ts`
  - `src/services/disclosure/disclosureImpact.service.ts`
- 알림 평가에서 사용하던 `markTriggered` 누락 수정
  - `src/store/alertStore.ts`
  - `src/services/alertService.ts`
- 투자자별 수급 정식 테이블 추가
  - `stock_daily_investor_flows`
  - 단, 10년치 백필 job/API 완성은 아직 별도 작업 필요.

## 검증 결과
- 프론트 빌드: `npm run build` 성공
- 백엔드 타입체크: `npm run typecheck` 성공
- 백엔드 빌드: `npm run build` 성공

## 아직 남은 작업

### P1
- 10년치 일봉 실제 백필 job 운영 검증.
- 1분봉 → 장기 분봉 보관 기간 정책 적용.
- 체결 목록 과거 pagination/infinite scroll API 추가.
- 차트 큰 번들 분리(code splitting) 최적화.

### P2
- `stock_daily_investor_flows`에 KIS/거래소 수급 데이터 적재 job 구현.
- 개인/기관/외국인 수급 5일/20일 누적 차트.
- AI 해석/고급 차트 지표.

## 주의
- `.env` 파일은 열지 않고 작업했음.
- `node_modules`, `dist`는 최종 zip에서 제외했음.
- 백엔드는 `npm ci --legacy-peer-deps`가 필요했음. `bullmq@5`와 `redis@4` peer dependency 충돌 때문.
