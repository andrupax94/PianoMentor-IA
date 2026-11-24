#!/usr/bin/env bash
# description: Endurece el SSH (solo clave) e instala fail2ban contra fuerza bruta.
# context: Un solo uso. Copia el sshd_config, valida con sshd -t y no reinicia si falla.
#          Ejecutar con sudo: sudo bash ssh-hardening.sh

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
    echo "Ejecuta: sudo bash $0" >&2
    exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="/etc/ssh/sshd_config.bak-$STAMP"
cp -a /etc/ssh/sshd_config "$BACKUP"
echo "Copia de seguridad: $BACKUP"

# El archivo empieza por 00- a proposito: sshd se queda con el primer valor que
# encuentra, asi que adelanta a cualquier 50-cloud-init.conf que reactive la
# contrasena.
cat > /etc/ssh/sshd_config.d/00-hardening.conf <<'EOF'
# PianoMentor AI - endurecimiento SSH (ver deploy/README.md)
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitEmptyPasswords no
PermitRootLogin no
MaxAuthTries 4
LoginGraceTime 30
X11Forwarding no
EOF

OTROS="$(grep -rl '^PasswordAuthentication yes' /etc/ssh/sshd_config.d/ 2>/dev/null | grep -v '00-hardening.conf' || true)"
if [ -n "$OTROS" ]; then
    echo "AVISO: estos archivos fijan PasswordAuthentication yes y podrian ganar:" >&2
    echo "$OTROS" >&2
fi

if ! sshd -t; then
    echo "La configuracion no es valida. Restaurando y saliendo sin tocar nada." >&2
    rm -f /etc/ssh/sshd_config.d/00-hardening.conf
    cp -a "$BACKUP" /etc/ssh/sshd_config
    exit 1
fi

systemctl restart ssh
echo "SSH reiniciado: solo se entra con clave."
echo "No cierres esta sesion. Abre otra terminal y comprueba que entras."

DEBIAN_FRONTEND=noninteractive apt-get install -y fail2ban >/dev/null
cat > /etc/fail2ban/jail.d/pianomentor.local <<'EOF'
[DEFAULT]
ignoreip  = 127.0.0.1/8 ::1 192.168.1.0/24
bantime   = 1h
findtime  = 10m
maxretry  = 4
banaction = ufw

[sshd]
enabled = true
backend = systemd
EOF

systemctl enable fail2ban >/dev/null 2>&1 || true
systemctl restart fail2ban
sleep 2
fail2ban-client status sshd || true
