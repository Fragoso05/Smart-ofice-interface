#!/usr/bin/env bash
# Testa os fluxos Node-RED e a migração SQL numa bancada local:
# MariaDB 11.8 + Node-RED 4 (Docker) + ESP32 simulado (api-test.js).
# Requisitos: Docker e Node.js 18+. Uso: bash backend/test/run-bench.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
# Git Bash no Windows: o Docker precisa do caminho C:/..., e não converter "/data"
HOST_DIR="$(cd "$HERE" && (pwd -W 2>/dev/null || pwd))"
dk() { MSYS_NO_PATHCONV=1 docker "$@"; }

db() { dk exec -i so-bench-db mariadb -uroot -pbench-only "$@"; }

echo "== Gerar fluxos"
node "$ROOT/node-red/build-flows.js"
node "$HERE/assemble.js"

echo "== MariaDB 11.8"
dk network create so-bench >/dev/null 2>&1 || true
dk rm -f so-bench-db so-bench-nr >/dev/null 2>&1 || true
dk run -d --name so-bench-db --network so-bench -e MARIADB_ROOT_PASSWORD=bench-only -e TZ=UTC mariadb:11.8 >/dev/null
for _ in $(seq 1 40); do db -e "select 1" >/dev/null 2>&1 && break; sleep 2; done
db -e "CREATE DATABASE smart_office"
db smart_office < "$HERE/baseline.sql"        # esquema atual (reconstruído a partir dos fluxos)
db smart_office < "$HERE/old_procedure.sql"   # procedimento antigo, para testar a substituição
db smart_office < "$ROOT/sql/001_device_management.sql"
db smart_office < "$ROOT/sql/001_device_management.sql"   # 2.ª vez: idempotência
echo "migração aplicada 2x"

echo "== Node-RED 4"
SHA=$(node -e "console.log(require('crypto').createHash('sha256').update('bench-pass-123').digest('hex'))")
dk run -d --name so-bench-nr --network so-bench -p 1880:1880 -e TZ=UTC \
  -e SMART_OFFICE_ALLOWED_ORIGINS=http://localhost:5173 -e BENCH_ADMIN_SHA256="$SHA" \
  -v "$HOST_DIR/.bench/nr:/data" nodered/node-red:4.0.9 >/dev/null
dk exec so-bench-nr sh -c "cd /data && npm install --no-audit --no-fund --loglevel=error node-red-node-mysql@2.0.0" >/dev/null
dk restart so-bench-nr >/dev/null
for _ in $(seq 1 40); do curl -s -o /dev/null -w '%{http_code}' http://localhost:1880/api/health 2>/dev/null | grep -q 200 && break; sleep 2; done

echo "== Testes"
node "$HERE/api-test.js"
status=$?

echo "Para parar: docker rm -f so-bench-db so-bench-nr"
exit $status
