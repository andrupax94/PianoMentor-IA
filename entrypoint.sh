#!/bin/sh
# Backend entrypoint: restore from R2 (if configured) then replicate + uvicorn.
set -e

: "${DATABASE_PATH:=/data/piano_mentor.db}"
: "${PORT:=8000}"
: "${R2_REGION:=auto}"
export DATABASE_PATH PORT R2_REGION

mkdir -p "$(dirname "$DATABASE_PATH")"

# Litestream is optional: without R2 credentials the backend runs with plain SQLite.
if [ -n "${R2_BUCKET:-}" ] && [ -n "${R2_ENDPOINT:-}" ] \
   && [ -n "${R2_ACCESS_KEY_ID:-}" ] && [ -n "${R2_SECRET_ACCESS_KEY:-}" ]; then
    litestream restore -if-db-not-exists -if-replica-exists \
        -config /etc/litestream.yml "$DATABASE_PATH" || true
    exec litestream replicate -config /etc/litestream.yml \
        -exec "uvicorn piano_mentor.main:app --host 0.0.0.0 --port ${PORT}"
fi

exec uvicorn piano_mentor.main:app --host 0.0.0.0 --port "${PORT}"
