#!/bin/sh
set -eu

cd /app

stop_services() {
    trap - EXIT INT TERM
    pm2 kill || true
    nginx -s quit || true
}

trap stop_services EXIT
trap 'exit 0' INT TERM

nginx -t
nginx
pm2 delete all || true
pnpm run --parallel \
    --filter ./apps/frontend \
    --filter ./apps/backend \
    --filter ./apps/orchestrator \
    pm2

pm2 logs &
wait "$!"
