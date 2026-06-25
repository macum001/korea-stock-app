# jp: Backend Dockerfile - Multi-stage build
# jp: Stage 1(deps) → Stage 2(builder) → Stage 3(production) / Stage dev

# ─────────────────────────────────────────
# jp: Stage 1: 의존성 설치
# ─────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# jp: package.json만 먼저 복사 (레이어 캐시 최적화)
COPY package*.json ./
RUN npm ci --only=production && \
    cp -r node_modules /tmp/prod_modules && \
    npm ci  # jp: devDependencies 포함 (빌드용)

# ─────────────────────────────────────────
# jp: Stage 2: TypeScript 빌드
# ─────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build  # jp: tsc → dist/

# ─────────────────────────────────────────
# jp: Stage 3: 프로덕션 이미지 (최소)
# ─────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

# jp: 보안 - root 대신 node 유저
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodeuser -u 1001

# jp: 프로덕션 의존성 + 빌드 결과물만 복사
COPY --from=deps /tmp/prod_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package*.json ./

# jp: 소유권 설정
RUN chown -R nodeuser:nodejs /app
USER nodeuser

EXPOSE 4000

# jp: 헬스체크용 wget 확인
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["node", "dist/server.js"]

# ─────────────────────────────────────────
# jp: Stage dev: 개발용 (ts-node-dev 핫리로드)
# ─────────────────────────────────────────
FROM node:20-alpine AS development
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./

EXPOSE 4000

CMD ["npm", "run", "dev"]
