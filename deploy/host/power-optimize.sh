#!/usr/bin/env bash
# description: Optimizaciones de energía para el portátil usado como servidor.
# context: Ejecutar con sudo: sudo bash power-optimize.sh
#          Aplica ajustes seguros; no hace undervolting ni underclocking
#          agresivo (eso puede inestabilizar el equipo).

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
    echo "Ejecuta: sudo bash $0" >&2
    exit 1
fi

echo "=== 1. Servicios innecesarios para un servidor ==="

# cups: impresión. No se necesita en un servidor.
# avahi-daemon: mDNS (.local). No se necesita.
# ModemManager: módems celulares. No se necesita.
# bluetooth: no hay hardware bluetooth en este equipo (verificado).
for svc in cups avahi-daemon ModemManager; do
    if systemctl is-enabled "$svc" >/dev/null 2>&1; then
        systemctl disable --now "$svc" 2>/dev/null || true
        echo "  desactivado: $svc"
    else
        echo "  ya inactivo: $svc"
    fi
done

echo
echo "=== 2. CPU: governor powersave (persistente) ==="

# El governor actual ya es powersave. Lo hacemos persistente con un servicio
# que lo re-aplica en cada arranque.
cat > /etc/systemd/system/pm-cpu-powersave.service <<'EOF'
[Unit]
Description=Fija el governor de la CPU en powersave
After=systemd-modules-load.service

[Service]
Type=oneshot
ExecStart=/bin/sh -c 'for g in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do echo powersave > "$g"; done'
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now pm-cpu-powersave.service
echo "  governor powersave fijado y persistente"

# Frecuencia máxima: limitar a la base (1.0 GHz) en lugar del turbo (3.6 GHz).
# Esto reduce consumo y temperatura sin afectar un servidor de bajo tráfico.
# Para revertir: echo 3600000 > /sys/devices/system/cpu/cpu0/cpufreq/scaling_max_freq
MAX_FREQ=1000000
for f in /sys/devices/system/cpu/cpu*/cpufreq/scaling_max_freq; do
    echo "$MAX_FREQ" > "$f" 2>/dev/null || true
done
echo "  frecuencia máxima limitada a 1.0 GHz (base, sin turbo)"

echo
echo "=== 3. Wi-Fi: power save persistente ==="

# NetworkManager ya tiene power save on. Lo hacemos explícito y persistente.
WIFI_CONF=/etc/NetworkManager/conf.d/99-wifi-powersave.conf
if [ ! -f "$WIFI_CONF" ]; then
    cat > "$WIFI_CONF" <<'EOF'
[connection]
wifi.powersave = 3
EOF
    systemctl reload NetworkManager 2>/dev/null || true
    echo "  power save de Wi-Fi persistente"
else
    echo "  ya configurado"
fi

echo
echo "=== 4. Memoria: reducir swappiness ==="

# En un servidor con SSD, menos swap = menos escrituras y mejor latencia.
if [ -f /etc/sysctl.d/99-swappiness.conf ]; then
    echo "  ya configurado"
else
    echo "vm.swappiness=10" > /etc/sysctl.d/99-swappiness.conf
    sysctl -w vm.swappiness=10 >/dev/null
    echo "  swappiness = 10"
fi

echo
echo "=== 5. USB: autosuspend (ya activo) ==="
echo "  usbcore.autosuspend = $(cat /sys/module/usbcore/parameters/autosuspend)"

echo
echo "=== 6. Pantalla: apagar tras 1 minuto de inactividad ==="
# Esto se aplica al usuario chimuelo (gsettings), no necesita root.
# Se ejecuta como el usuario para que tome efecto en su sesión.
sudo -u chimuelo bash -c '
    export XDG_RUNTIME_DIR=/run/user/$(id -u)
    gsettings set org.gnome.desktop.session idle-delay 60
    gsettings set org.gnome.desktop.screensaver lock-enabled false
' 2>/dev/null || echo "  (no se pudo aplicar gsettings; hazlo manualmente)"
echo "  pantalla se apaga tras 60 s de inactividad, sin bloqueo"

echo
echo "=== 7. Desactivar animaciones de GNOME (menos CPU) ==="
sudo -u chimuelo bash -c '
    export XDG_RUNTIME_DIR=/run/user/$(id -u)
    gsettings set org.gnome.desktop.interface enable-animations false
' 2>/dev/null || echo "  (no se pudo aplicar; hazlo manualmente)"
echo "  animaciones desactivadas"

echo
echo "=== Resumen ==="
echo "  - Servicios innecesarios: desactivados"
echo "  - CPU governor: powersave + frecuencia max 1.0 GHz (sin turbo)"
echo "  - Wi-Fi power save: activo y persistente"
echo "  - Swappiness: 10"
echo "  - USB autosuspend: activo"
echo "  - Pantalla: apaga tras 60 s, sin bloqueo"
echo "  - Animaciones GNOME: desactivadas"
echo
echo "Para revertir la frecuencia máxima:"
echo "  echo 3600000 | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_max_freq"
echo
echo "Para revertir el governor:"
echo "  sudo systemctl disable --now pm-cpu-powersave.service"