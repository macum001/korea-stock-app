#!/usr/bin/env bash
set -euo pipefail
# jp: realtime 서버 장애 주입 - 한 대 죽였을 때 lock 인수인계/fanout 지속성 확인
COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.observability.yml}
SERVICE=${SERVICE:-realtime-1}

echo "[chaos] killing ${SERVICE}"
docker compose -f "${COMPOSE_FILE}" kill "${SERVICE}"
sleep 5
echo "[chaos] starting ${SERVICE}"
docker compose -f "${COMPOSE_FILE}" up -d "${SERVICE}"
echo "[chaos] done. Check Grafana: lock lost/acquired, ws clients, stream pending"
