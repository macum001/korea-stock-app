# 실제 코드 기준 최종 감사/마무리 보고서

> jp: 이 문서는 실제 압축본을 풀어서 코드 검색, 수정, 빌드 검증까지 수행한 결과입니다. `.env` 계열 실제 파일은 만들거나 열지 않았고, 예시 파일만 추가했습니다.

## 1. 실제 확인한 현재 구조

- 프론트 실시간 호가/체결: `src/hooks/useRealtimeOrderbook.ts`
  - REST는 최초 1회 bootstrap만 사용합니다.
  - 이후 호가는 WebSocket `orderbook_update` 최신값 덮어쓰기, 체결은 `trade_update` append 구조입니다.
  - `setOrderbook(null)`, `setTrades([])` cleanup 초기화는 사용하지 않습니다.
- 프론트 WebSocket: `src/services/websocketService.ts`
  - 재연결, heartbeat, stale reconnect, 호가/체결 다중 콜백 Set 구조가 있습니다.
  - 이번 마무리에서 현재가도 다중 콜백 Set 구조로 변경했습니다.
- 백엔드 클라이언트 WS 서버: `backend/src/services/realtime/socketServer.service.ts`
  - `/ws`에서 `subscribe_stock`, `subscribe_orderbook`, `subscribe_trade`를 처리합니다.
  - 구독 직후 Redis/DB snapshot을 즉시 전송합니다.
- KIS 호가/체결 WS: `backend/src/services/kis/kisOrderbookWs.service.ts`
  - KIS 실시간 호가/체결을 분리 구독합니다.
  - 호가는 최신 snapshot 저장, 체결은 최근 1000개 append 캐시입니다.
- 장마감 snapshot: `backend/src/services/market/marketSnapshot.service.ts`, `backend/src/repositories/marketSnapshot.repository.ts`
  - Redis `market_snapshot:{code}`와 DB `market_snapshots`를 사용합니다.
- 차트/분봉: `src/components/chart/StockChart.tsx`, `backend/src/services/kis/kisRest.service.ts`, `backend/src/routes/minuteChart.routes.ts`
  - 1/3/5/10/15/30/60/120/240분봉이 있으며, 집계는 한국장 09:00 KST 기준으로 계산합니다.
- 투자자별 수급: `backend/src/repositories/investorFlow.repository.ts`, `backend/src/routes/stock.routes.ts`
  - DB 우선, 부족하면 KIS fallback 후 DB 저장 구조입니다.

## 2. 이번 실제 마무리에서 수정한 내용

### A. 현재가 WebSocket 다중 구독 버그 수정

파일: `src/services/websocketService.ts`

문제:
- 기존 `subscriptions = Map<string, PriceUpdateCallback>` 구조는 같은 종목을 여러 컴포넌트가 구독하면 마지막 콜백만 남을 수 있었습니다.
- 종목 상세, 관심목록, 요약 카드가 동시에 같은 종목 현재가를 보면 일부 UI만 갱신될 위험이 있었습니다.

수정:
- `Map<string, Set<PriceUpdateCallback>>` 구조로 변경했습니다.
- `subscribeStock`, `unsubscribeStock`을 호가/체결과 같은 다중 콜백 방식으로 통일했습니다.

### B. KIS 40개 구독 한도 초과/재연결 복원 버그 수정

파일: `backend/src/services/kis/kisOrderbookWs.service.ts`

문제:
- KIS 정책상 TR당 구독 수 제한이 있는데, 한도 초과 종목도 내부 Map에 들어가면 재연결 시 전체 Map을 다시 구독할 위험이 있었습니다.
- 장전 구독 요청이 들어오면 `ensureConnected()`가 시장 미개장으로 반환되고, 장 시작 후 실제 구독 복원이 누락될 수 있었습니다.

수정:
- `activeOrderbookCodes`, `activeTradeCodes`를 추가했습니다.
- 실제 KIS에 보낼 대상과 단순 콜백 보관 대상을 분리했습니다.
- 장전 구독도 desired-active 코드로 보관해 장 시작/재연결 시 복원되게 했습니다.

### C. 체결 지연 로그 provider timestamp KST 날짜 버그 수정

파일: `backend/src/services/kis/kisOrderbookWs.service.ts`

문제:
- KIS 체결 시각 HHMMSS를 provider timestamp로 만들 때 서버 UTC 날짜를 기준으로 계산하면, 한국 날짜와 UTC 날짜가 다를 때 지연시간 로그가 틀어질 수 있었습니다.

수정:
- `getKstParts()`의 KST 날짜를 기준으로 provider timestamp를 계산하도록 변경했습니다.

### D. KIS 분봉 pagination baseTime timezone 버그 수정

파일: `backend/src/services/kis/kisRest.service.ts`

문제:
- 분봉 과거 페이지 조회용 `baseTime`을 `Date.getHours()`로 만들고 있어 서버 timezone이 UTC인 Render/Gabia 환경에서 KST 시간이 아닌 값이 들어갈 수 있었습니다.

수정:
- `Intl.DateTimeFormat(... timeZone: 'Asia/Seoul')`로 `HHMMSS`를 계산하도록 변경했습니다.

### E. 상용 기본 mock 차단

파일: `backend/src/config/env.ts`, `backend/src/config/db.ts`

문제:
- `USE_MOCK_DATA` 기본값이 사실상 true라서, 환경변수 설정 실수 시 개발용 mock이 섞일 위험이 있었습니다.

수정:
- production에서는 mock이 켜지지 않도록 변경했습니다.
- `USE_MOCK_DATA=true`는 development에서 명시한 경우만 켜집니다.
- DB 연결 실패 로그도 “mock 모드” 표현을 제거했습니다.

### F. 배포용 env 예시 추가

파일: `.env.example`, `backend/.env.example`

수정:
- 실제 비밀값 없이 필요한 환경변수 이름만 추가했습니다.

## 3. 검증 결과

실행한 검증:

```bash
npm ci --ignore-scripts
npm run build
cd backend
npm ci --ignore-scripts
npm run typecheck
npm run build
```

결과:
- 프론트 build 성공
- 백엔드 typecheck 성공
- 백엔드 build 성공

주의:
- backend npm audit에서 moderate 취약점 8개가 보고되었습니다. 즉시 앱 실행을 막지는 않지만, 출시 전 `npm audit` 결과를 보고 의존성 업데이트 범위를 결정해야 합니다.
- 프론트 build에서 `watchlistStore` dynamic import가 chunk 분리에 효과가 없다는 경고가 있습니다. 기능 오류는 아니며 성능 최적화 항목입니다.

## 4. 아직 “토스증권 100%”라고 말할 수 없는 이유

코드 구조는 많이 올라왔지만, 아래는 실제 외부 환경이 있어야 검증 가능합니다.

- KIS 실전/모의 APP KEY로 장중 호가/체결이 실제 수신되는지
- 종목 40개 이상 구독 시 운영 정책을 어떻게 가져갈지
- Redis 장애/재시작 후 snapshot 복구가 실제 서비스에서 안정적인지
- PostgreSQL migration이 운영 DB에서 깨지지 않는지
- 100종목/500종목 동시 관심목록 부하 테스트
- KIS 투자자별 수급 API의 실제 필드 매핑 정확성
- 장마감 후 종목 상세 진입 시 모든 종목에서 snapshot이 충분히 쌓이는지

따라서 현재 결과물은 “코드 기준 출시 후보”이지, “토스증권과 동일 품질 검증 완료”는 아닙니다.

## 5. 출시 전 마지막 필수 테스트

1. 장중 삼성전자 005930 상세 진입
   - 호가가 REST 1회 후 WS로 움직이는지
   - 체결이 300개까지 유지되는지
   - 현재가/체결창/차트 close가 같은 tick 기준인지
2. WebSocket 강제 끊김
   - 화면 데이터가 사라지지 않는지
   - 재연결 후 snapshot + 신규 tick 중복이 없는지
3. 장마감 후 진입
   - `CLOSED`와 `NO_DATA`가 분리되어 표시되는지
   - 마지막 호가/체결/종가가 유지되는지
4. 분봉 bucket
   - 3/5/15/30/60/120/240분봉이 09:00 KST 기준으로 시작하는지
5. 10년 일봉
   - `stock_daily_candles`에 백필 후 3000개 내외 로딩이 가능한지
6. 투자자별 수급
   - 개인/외국인/기관 수량/금액이 실제 KIS 결과와 일치하는지

## 6. 현재 가장 먼저 운영에서 확인해야 할 3가지

1. 실제 KIS WebSocket 장중 수신 확인
2. Redis + DB snapshot 장마감 복구 확인
3. 차트 마지막 캔들 close와 체결창 최신가 일치 확인
