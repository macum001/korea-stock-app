#!/usr/bin/env bash
set -euo pipefail
# jp: Redis 장애 주입 - Redis 재시작 후 WS/Stream/lock 복구 여부 확인
COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.observability.yml}
REDIS_SERVICE=${REDIS_SERVICE:-redis}

echo "[chaos] restarting ${REDIS_SERVICE} via ${COMPOSE_FILE}"
docker compose -f "${COMPOSE_FILE}" restart "${REDIS_SERVICE}"
echo "[chaos] redis restarted. Check /metrics: jp_redis_ready, jp_stream_recovery_running, jp_kis_lock_lost_total"
