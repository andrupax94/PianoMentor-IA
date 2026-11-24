#!/usr/bin/env bash
# description: Despliegue de producción en el portátil: pull, build y up -d.
# context: Lo lanza el runner de GitHub Actions en cada push a main, o a mano.
#          Trabaja sobre un clon dedicado (~/srv/pianomentor) que es siempre
#          exactamente origin/main, para no tocar la copia de trabajo del dueño.

set -euo pipefail

REPO_DIR="${PM_REPO_DIR:-$HOME/srv/pianomentor}"
BRANCH="${PM_DEPLOY_BRANCH:-main}"
COMPOSE_FILE="$REPO_DIR/deploy/docker-compose.yml"
ENV_FILE="$REPO_DIR/deploy/.env"
LOCK_FILE="${TMPDIR:-/tmp}/pm-deploy.lock"

log() { printf '\n== %s\n' "$*"; }
fail() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

# --- Un despliegue a la vez -------------------------------------------------
# Un push mientras otro despliegue corre no debe construir dos veces.
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
    fail "ya hay un despliegue en curso ($LOCK_FILE)"
fi

# --- Comprobaciones previas -------------------------------------------------
[ -d "$REPO_DIR/.git" ] || fail "no existe el clon de producción en $REPO_DIR"
[ -f "$COMPOSE_FILE" ] || fail "falta $COMPOSE_FILE"
[ -f "$ENV_FILE" ] || fail "falta $ENV_FILE (cópialo del despliegue anterior)"
[ -f "$REPO_DIR/.env" ] || fail "falta $REPO_DIR/.env (secretos del backend)"

command -v docker >/dev/null 2>&1 || fail "docker no está en el PATH"
docker info >/dev/null 2>&1 || fail "docker no responde (¿grupo docker?)"

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
: "${PM_DATA_DIR:?falta PM_DATA_DIR en deploy/.env}"
[ -d "$PM_DATA_DIR" ] || fail "PM_DATA_DIR no existe: $PM_DATA_DIR"

API_URL="${PM_PUBLIC_API_URL:-https://api.pianomentoria.com}"
WEB_URL="${PM_PUBLIC_WEB_URL:-https://www.pianomentoria.com}"

compose() {
    docker compose \
        --project-directory "$REPO_DIR/deploy" \
        --file "$COMPOSE_FILE" \
        --env-file "$ENV_FILE" \
        "$@"
}

# --- 1. Traer el commit -----------------------------------------------------
log "1/5 Git: $BRANCH"
git -C "$REPO_DIR" fetch --prune origin "$BRANCH"
git -C "$REPO_DIR" checkout --force "$BRANCH" >/dev/null 2>&1 \
    || git -C "$REPO_DIR" checkout --force -B "$BRANCH" "origin/$BRANCH"
git -C "$REPO_DIR" reset --hard "origin/$BRANCH"
git -C "$REPO_DIR" log -1 --format='commit %h · %s · %ad' --date=short

# --- 2. Construir -----------------------------------------------------------
# Sin --pull: las imágenes base se quedan donde están y el despliegue es
# reproducible. Actualizarlas es una decisión aparte, no un efecto del push.
log "2/5 Build"
compose build

# --- 3. Levantar ------------------------------------------------------------
log "3/5 Up"
compose up -d --remove-orphans

# --- 4. Esperar a que responda ---------------------------------------------
log "4/5 Salud"
ok=0
for _ in $(seq 1 24); do
    if curl -fsS --max-time 5 "$API_URL/health" >/dev/null 2>&1 \
       && curl -fsS --max-time 5 -o /dev/null "$WEB_URL/" 2>/dev/null; then
        ok=1
        break
    fi
    sleep 5
done

if [ "$ok" -ne 1 ]; then
    compose ps
    fail "la web o la API no responden tras 2 minutos. Revisa: docker compose logs --tail 50"
fi

# --- 5. Resumen -------------------------------------------------------------
log "5/5 Hecho"
compose ps
printf '\nAPI   %s/health  OK\nWEB   %s  OK\n' "$API_URL" "$WEB_URL"
