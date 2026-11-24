#!/usr/bin/env bash
# description: Instala el actualizador de IP dinámica como servicio systemd.
# context: Ejecutar con sudo desde esta misma carpeta (deploy/ddns/).

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
    echo "Ejecuta: sudo bash install.sh" >&2
    exit 1
fi

HERE="$(cd "$(dirname "$0")" && pwd)"

install -m 0755 "$HERE/pm-ddns.py"      /usr/local/bin/pm-ddns.py
install -m 0644 "$HERE/pm-ddns.service" /etc/systemd/system/pm-ddns.service
install -m 0644 "$HERE/pm-ddns.timer"   /etc/systemd/system/pm-ddns.timer

if [ ! -f /etc/pm-ddns.env ]; then
    install -m 0600 "$HERE/pm-ddns.env.example" /etc/pm-ddns.env
    echo "Creado /etc/pm-ddns.env (0600). Edítalo y pon tu VERCEL_TOKEN."
fi

systemctl daemon-reload
systemctl enable --now pm-ddns.timer
systemctl start pm-ddns.service || true

echo
echo "Estado del temporizador:"
systemctl --no-pager --lines=0 status pm-ddns.timer || true
echo
echo "Última ejecución:"
journalctl -u pm-ddns.service -n 5 --no-pager || true
