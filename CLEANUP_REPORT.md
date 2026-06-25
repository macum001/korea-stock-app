# 정리 리포트

## 확인 결과
- backend 폴더는 삭제되지 않았습니다. `backend/src`에 서버 코드가 남아 있습니다.
- 원본 ZIP이 130MB였던 가장 큰 이유는 `node_modules`와 Vite 캐시가 포함되어 있었기 때문입니다.
- `.env`, `.env.*` 파일은 열지 않고 정리본에서 제외했습니다.
- `backend/firebase-service-account.json`은 비밀키 성격 파일이라 정리본에서 제외했습니다.

## 삭제/제외한 항목
- `node_modules/`, `.vite/`, `.cache/`, `dist/`, `build/`
- `.env`, `.env.local`, `.env.production` 등 환경변수 파일
- `backend/firebase-service-account.json`
- 임시 패치 폴더: `alert-api`, `alert-connect`, `alert-fix`, `backfill-fix`, `bullmq-connect`, `disc-toggle-5`, `home-alert`, `market-hours`, `minute-db`, `minute-fast`, `noti-center`, `price-actions`, `price-alert`, `pubsub-connect`, `remove-mock`, `speed-fix`, `stock-alert`, `watch-swipe`, `admin-auth`
- 잘못 생성된 중괄호 폴더: `src/{...}`, `backend/src/{...}`
- 붙여넣기 안내용 임시 txt/sql/ps1 파일

## 남긴 핵심 구조
- `src/` : 사용자 웹앱 프론트엔드
- `backend/` : API 서버
- `admin/` : 관리자 프론트엔드
- `public/` : 아이콘, 로고, FCM 서비스워커
- `docker/`, `docker-compose*.yml` : 로컬/배포용 Docker 설정
- `.github/workflows/` : CI/CD 설정

## 다시 실행하는 순서
```bash
npm install
npm run dev
```

백엔드:
```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

관리자:
```bash
cd admin
npm install
npm run dev
```

## 주의
- 실제 `.env` 값은 정리본에 없습니다. 기존 값을 직접 다시 넣어야 합니다.
- Firebase Admin 서비스 계정 JSON은 서버 환경변수/비밀파일로 따로 관리하세요. GitHub에는 올리지 않는 것이 안전합니다.
