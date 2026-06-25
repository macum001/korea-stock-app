# RELEASE_CHECKLIST

## 1. 필수 빌드 점검

```bash
npm run verify:release
npm run build
npm --prefix backend run typecheck
npm --prefix backend run build
```

## 2. 환경변수 점검

```bash
npm --prefix backend run verify:env
```

필수:
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `KIS_APP_KEY`
- `KIS_APP_SECRET`
- `KIS_ACCOUNT_NO`

개발 중에는 `KIS_REAL_MODE=false`로 모의투자부터 확인하세요.

## 3. 실시간 장중 검증

- 정규장 09:00~15:30 사이 최소 2~3시간 연결 유지
- 호가 변경 시 100~300ms 단위로 화면 반영 확인
- 체결 목록 300개 이상 누적 확인
- Redis `trades:live:{code}` 최근 1000개 유지 확인
- WebSocket 끊김 후 자동 재연결 확인
- Redis 재시작 후 앱이 완전히 죽지 않는지 확인

## 4. 장마감 검증

- 15:31 이후 `/api/market/status`가 `AFTER_HOURS` 또는 `CLOSED`로 분리되는지 확인
- `/api/market/snapshot/:code`에서 마지막 현재가/호가/체결이 남아 있는지 확인
- 화면에 “종가 기준으로 표시 중입니다” 안내가 나오는지 확인
- 장마감 후 `NO_DATA`로 오판하지 않는지 확인

## 5. 차트 검증

- 마지막 체결가와 마지막 캔들 close 값 일치
- 1/3/5/10/15/30/60/120/240분 bucket이 KST 09:00 기준으로 맞는지 확인
- 10년치 일봉 진입 시 초기 렌더링이 과도하게 느리지 않은지 확인

## 6. 운영 전 남은 실제 검증

코드 구조는 보강했지만, 아래는 실제 KIS/서버 환경에서만 확정 가능합니다.

- KIS 실전/모의 WebSocket 구독 한도
- 장중 실시간 체결 누락 여부
- Render/Gabia WebSocket idle timeout
- 모바일 브라우저 백그라운드 복귀 후 재연결
- 투자자별 수급 데이터 정합성
