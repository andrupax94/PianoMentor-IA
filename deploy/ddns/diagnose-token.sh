#!/usr/bin/env bash
# description: Diagnostica un 403 de la API de Vercel mostrando las respuestas crudas.
# context: Ejecutar con sudo: sudo bash diagnose-token.sh
#          No imprime el token; solo su longitud y 4 caracteres.
#          Respeta VERCEL_TEAM_ID si esta definido en /etc/pm-ddns.env.

set -uo pipefail

if [ "$(id -u)" -ne 0 ]; then
    echo "Ejecuta: sudo bash $0" >&2
    exit 1
fi

set -a
# shellcheck disable=SC1091
. /etc/pm-ddns.env
set +a

if [ -z "${VERCEL_TOKEN:-}" ] || [ "$VERCEL_TOKEN" = "pega_aqui_tu_token" ]; then
    echo "Falta VERCEL_TOKEN en /etc/pm-ddns.env" >&2
    exit 1
fi

echo "Token: longitud ${#VERCEL_TOKEN}, empieza por ${VERCEL_TOKEN:0:4}"
echo "VERCEL_TEAM_ID: ${VERCEL_TEAM_ID:-(vacio)}"
echo

con_equipo() {
    if [ -n "${VERCEL_TEAM_ID:-}" ]; then
        case "$1" in
            *\?*) printf '%s&teamId=%s' "$1" "$VERCEL_TEAM_ID" ;;
            *)    printf '%s?teamId=%s' "$1" "$VERCEL_TEAM_ID" ;;
        esac
    else
        printf '%s' "$1"
    fi
}

mostrar() {
    local titulo="$1"
    local url
    url="$(con_equipo "$2")"
    echo "== $titulo =="
    echo "GET $url"
    curl -sS -w "\n[HTTP %{http_code}]\n" -H "Authorization: Bearer $VERCEL_TOKEN" "$url" | head -c 900
    echo
    echo
}

mostrar "1. Usuario dueno del token"  "https://api.vercel.com/v2/user"
mostrar "2. Dominios visibles"        "https://api.vercel.com/v5/domains?limit=20"
mostrar "3. Equipos"                  "https://api.vercel.com/v2/teams?limit=20"
mostrar "4. Registros del dominio"    "https://api.vercel.com/v5/domains/${VERCEL_DOMAIN}/records?limit=5"

echo "Pistas:"
echo "  - Un 403 en (1) significa que el token no vale para la API publica."
echo "  - Si (2) sale vacio pero (3) lista un equipo, falta VERCEL_TEAM_ID."
echo "  - Si con VERCEL_TEAM_ID puesto (2) sigue vacio, el token no alcanza ese equipo."
