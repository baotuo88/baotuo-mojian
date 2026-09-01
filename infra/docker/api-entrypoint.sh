#!/bin/sh
set -eu

cd /app/server

if [ "${AI_NOVEL_DATABASE_MODE:-}" != "postgresql" ] || [ "${AI_NOVEL_COMPOSE_BASELINE:-}" != "true" ]; then
  echo "[container] refusing to start: Compose requires PostgreSQL and AI_NOVEL_COMPOSE_BASELINE=true" >&2
  exit 1
fi

echo "[container] applying Compose PostgreSQL baseline and migrations"
/app/node_modules/.bin/prisma migrate deploy --config /app/server/prisma.config.ts

echo "[container] starting API"
exec node /app/server/dist/app.js
