# JP Korea Stock App

한국투자증권 KIS Open API 기반 증권앱입니다. 이번 정리본은 실시간 호가/체결/현재가를 WebSocket push 중심으로 구성하고, 장마감 snapshot, 차트 tick 동기화, 투자자별 수급 저장 구조, Redis 캐시를 보강한 버전입니다.

## 빠른 실행

```bash
cp .env.example .env
npm install
npm run build

cd backend
cp .env.example .env
npm install
npm run typecheck
npm run build
npm run dev
```

프론트 개발 서버:

```bash
npm run dev
```

## 배포 전 점검

```bash
npm run verify:release
npm run build
npm --prefix backend run verify:env
npm --prefix backend run typecheck
npm --prefix backend run build
```

## Docker 실행

```bash
cp .env.example .env
docker compose up --build
```

개발용:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

## 운영 핵심 구조

- 호가: Redis `orderbook:live:{code}` 최신 snapshot 덮어쓰기
- 체결: Redis `trades:live:{code}` 최근 1000개 유지
- 장마감: Redis/DB `market_snapshots`에 마지막 현재가·호가·체결 저장
- 차트: 초기 캔들은 API/DB, 이후 live trade tick으로 마지막 캔들 갱신
- 시간대: 장 상태와 분봉 bucket은 `Asia/Seoul` 기준

## 주의

`.env`, 실제 API key, Firebase service account는 압축/깃에 넣지 마세요. 이 정리본에는 예시 파일만 포함되어 있습니다.
