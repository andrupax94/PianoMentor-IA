#!/usr/bin/env bash
# description: Instala el ciclo noche: suspender a las 00:00 y despertar a las 07:00.
# context: Ejecutar con sudo desde esta carpeta (deploy/host/).

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
    echo "Ejecuta: sudo bash install-night-cycle.sh" >&2
    exit 1
fi

HERE="$(cd "$(dirname "$0")" && pwd)"

install -m 0644 "$HERE/pm-night-suspend.timer" /etc/systemd/system/pm-night-suspend.timer
install -m 0644 "$HERE/pm-night-wake.service" /etc/systemd/system/pm-night-wake.service
install -m 0644 "$HERE/pm-night-wake.timer"   /etc/systemd/system/pm-night-wake.timer

systemctl daemon-reload
systemctl enable --now pm-night-suspend.timer
systemctl enable --now pm-night-wake.timer

echo
echo "Temporizadores activos:"
systemctl list-timers 'pm-night-*' --no-pager || true

echo
echo "Proximo despertador RTC programado:"
systemctl show pm-night-wake.timer -p NextElapseUSecRealtime --value || true

echo
echo "Para suspenderlo temporalmente (por ejemplo, si trabajas de madrugada):"
echo "  sudo systemctl stop pm-night-suspend.timer"
echo "Para volver a activarlo:"
echo "  sudo systemctl start pm-night-suspend.timer"
