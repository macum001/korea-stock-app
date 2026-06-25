# Redis/캐시 퍼포먼스 토스급 최적화 보고서

## 적용 목표

토스증권급 실시간 운영에 필요한 Redis/캐시 계층을 다음 기준으로 보강했습니다.

- tick 수신 경로에서 Redis round-trip 최소화
- 체결 리스트 5,000개 유지
- Redis Stream 기반 replay/장애 복구
- Pub/Sub fanout으로 WebSocket 서버 수평확장 준비
- tick마다 대량 리스트를 다시 읽는 병목 제거
- 운영자가 Redis 지표를 볼 수 있는 API 추가

## 핵심 변경 파일

### `backend/src/config/redis.ts`

- Redis 재연결 정책을 3회 포기 방식에서 지수 백오프 방식으로 변경했습니다.
- `safeEval()` 추가: Lua script를 사용해 여러 Redis 명령을 단일 round-trip으로 실행합니다.
- `safePublish()` 추가: WebSocket 서버 수평확장을 위한 fanout 발행 기반입니다.
- `safeXRevRange()` 추가: Redis Stream replay 조회용입니다.
- `safeRedisInfo()` 추가: Redis 운영 지표 확인용입니다.

### `backend/src/services/cache/marketRealtimeCache.service.ts`

새로 추가한 토스급 실시간 캐시 코어입니다.

- 체결 tick 저장:
  - `LPUSH trades:live:{code}`
  - `LTRIM`으로 5,000개 유지
  - `SETEX price:live:{code}` 최신 체결 저장
  - `XADD stream:market:{code}` 종목별 replay stream 저장
  - `XADD stream:market:all` 전체 market stream 저장
  - `HINCRBY metrics:market:realtime` 운영 지표 증가
- 호가 저장:
  - `SETEX orderbook:live:{code}` 최신 호가 덮어쓰기
  - `XADD`로 stream 저장
- Redis Lua로 위 작업을 단일 round-trip 처리합니다.

### `backend/src/services/market/marketSnapshot.service.ts`

기존 병목을 제거했습니다.

이전 위험 구조:

```text
체결 tick 수신
→ Redis LPUSH/LTRIM
→ 최근 5,000개 LRANGE
→ snapshot trades 1,000개 재저장
```

변경 구조:

```text
체결 tick 수신
→ Redis Lua 1회로 append/trim/stream/metrics 처리
→ snapshot에는 latest price만 가볍게 반영
→ trades 배열은 API 조회/장마감 확정 시에만 LRANGE
```

효과:

- tick마다 5,000개를 다시 읽는 Redis 부하 제거
- 종목 수 증가 시 Redis 네트워크/CPU 부하 감소
- 장중에는 쓰기 경로 최적화, 조회는 요청 시 lazy 처리

### `backend/src/routes/market.routes.ts`

- `/api/market/realtime-stats`에 Redis stats/memory/limits 포함
- `/api/market/replay/:code` 추가
  - 관리자용 Redis Stream replay 조회
  - WebSocket 재접속/장애 분석에 사용

### `backend/src/scripts/benchmarkRealtimeCache.ts`

Redis 실시간 캐시 벤치마크 스크립트 추가.

```bash
cd backend
npm run benchmark:realtime-cache -- 005930 10000
```

출력:

- 총 처리 시간
- tick/sec
- 최근 체결 유지 개수
- Redis stats/memory

## 현재 기준 점수 재평가

| 항목 | 이전 | 이번 적용 후 |
|---|---:|---:|
| Redis/캐시 구조 | 75~80점 | 88~92점 |
| 체결 리스트 유지 | 5,000개 단순 list | 5,000개 list + Stream replay |
| 장애 복구 | snapshot 중심 | snapshot + Redis Stream replay |
| WS 수평확장 | 미흡 | Pub/Sub fanout 기반 추가 |
| tick 쓰기 성능 | list push 후 재조회 가능성 | Lua 단일 round-trip |
| 운영 관측 | 제한적 | Redis INFO/stats API 추가 |

## 아직 토스증권급 95점 이상으로 가려면 남은 것

1. Redis 단일 노드가 아니라 Redis Cluster 또는 Sentinel/Managed Redis 구성
2. WebSocket 서버를 실제로 2대 이상 띄우고 Pub/Sub fanout 검증
3. 장중 KIS 실데이터로 2~3시간 이상 soak test
4. 100/500/1000종목 구독 부하 테스트
5. Prometheus/Grafana 또는 APM 연동
6. Redis slowlog/latency monitor 운영 설정
7. API server / Realtime server / Batch worker 물리 분리

## 검증 결과

- 프론트 build 성공
- 백엔드 typecheck 성공
- 백엔드 build 성공
- release verify 성공

## 냉정한 결론

이번 버전은 Redis/캐시 퍼포먼스 기준으로는 확실히 한 단계 올라갔습니다.
단, 실제 토스증권보다 원활하다고 말하려면 코드 구조뿐 아니라 실제 인프라와 장중 부하 테스트가 필요합니다.

현재 코드 기준 Redis/캐시 점수는 약 88~92점입니다.
운영 인프라까지 붙이면 95점 이상을 노릴 수 있습니다.
