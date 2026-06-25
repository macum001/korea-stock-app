# jp: Frontend Dockerfile - Nginx + React 빌드

# ─────────────────────────────────────────
# jp: Stage 1: Vite 빌드
# ─────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# jp: 빌드 시 API URL 주입
ARG VITE_API_URL=http://localhost:4000
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build  # jp: dist/ 생성

# ─────────────────────────────────────────
# jp: Stage 2: Nginx 서빙
# ─────────────────────────────────────────
FROM nginx:1.25-alpine AS production

# jp: 기본 nginx 설정 제거 후 커스텀 설정 적용
RUN rm /etc/nginx/conf.d/default.conf
COPY docker/nginx/nginx.conf /etc/nginx/conf.d/default.conf

# jp: React 빌드 결과물 복사
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
