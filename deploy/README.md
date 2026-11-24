# description: Cómo levantar el servidor casero con Nginx y añadir proyectos nuevos.
# context: Se ejecuta en el HP con KDE neon, dentro de esta carpeta (deploy/).

# Servidor casero: Nginx + PianoMentor AI

Este stack es independiente del `docker-compose.yml` de la raíz (ese sigue siendo
el de desarrollo). Aquí solo se **añaden** archivos: no se mueve ni se borra nada
del proyecto original.

## Qué levanta

| Servicio | Contenedor | Puerto en el host | Visible desde fuera |
|---|---|---|---|
| `nginx` | `pm-nginx` | 80 y 443 | sí |
| `certbot` | `pm-certbot` | — (solo red interna) | no |
| `frontend` | `pm-frontend` | — (solo red interna) | a través de Nginx |
| `backend` | `pm-backend` | — (solo red interna) | a través de Nginx |

## Puesta en marcha (primera vez)

```bash
cd ~/proyectos/"PianoMentor IA"/deploy
cp .env.example .env      # ajusta dominios y PM_DATA_DIR
mkdir -p ~/.local/share/pianomentor/prod
docker compose build
docker compose up -d
docker compose ps
```

Comprobaciones:

```bash
curl -I http://localhost                       # Nginx responde
docker compose exec nginx nginx -t             # sintaxis correcta
docker compose logs -f nginx                   # ver peticiones en vivo
```

## Cómo añadir otro proyecto (por ejemplo, mivia)

La ruta ya está preparada en `nginx/conf.d/mivia.conf.example` (inactiva a
propósito). Para activarla: renómbrala a `mivia.conf`, ajusta el hostname de
No-IP y los puertos, descomenta los servicios `mivia-web` / `mivia-api` del
`docker-compose.yml` y recarga Nginx.

1. Copia la plantilla y ajústala:

   ```bash
   cp nginx/conf.d/_plantilla.conf.example nginx/conf.d/mivia.conf
   ```

2. Añade el servicio en `docker-compose.yml` (dentro de `services:`):

   ```yaml
   mivia:
     build: ../../mivia          # o `image: ...` si ya existe
     container_name: mivia
     restart: unless-stopped
     expose:
       - "8080"
     networks:
       - web
   ```

3. Comprueba y recarga sin cortar el resto:

   ```bash
   docker compose up -d mivia
   docker compose exec nginx nginx -t
   docker compose exec nginx nginx -s reload
   ```

Nginx elige el sitio por la cabecera `Host`, así que cada dominio puede apuntar
a la misma IP sin conflicto.

## Dominios

`nginx/conf.d/pianomentoria.conf` espera estos nombres:

- `www.pianomentoria.com` y `pianomentoria.com` → frontend
- `api.pianomentoria.com` → backend (API + WebSocket)

Si cambias de dominio, edita **ese archivo** y `deploy/.env`, y reconstruye el
frontend (las URLs de API se fijan al construir):

```bash
docker compose build frontend
docker compose up -d frontend
```

## Datos: producción separada de desarrollo

La base de producción **no vive en el repositorio**. El compose monta
`${PM_DATA_DIR}` sobre `/data`, y esa ruta se define en `deploy/.env`:

```bash
mkdir -p ~/.local/share/pianomentor/prod
```

| Base | Ruta |
|---|---|
| Desarrollo (Windows) | `data/piano_mentor.db` |
| Desarrollo (portátil) | `~/proyectos/"PianoMentor IA"/data/piano_mentor.db` |
| **Producción (portátil)** | `~/.local/share/pianomentor/prod/piano_mentor.db` |

El motivo no es estético: el despliegue automático hace `git reset --hard` y un
`git clean` borraría cualquier cosa dentro del repo. Fuera del repo, la base de
producción no la toca nadie. Además, antes de esto el contenedor escribía en el
`data/` de desarrollo, así que probar en local modificaba la web publicada.

El corpus MIDI (`data/midi`) sí se monta desde el clon, en **solo lectura** y en
`/corpus`: es material versionado que debe actualizarse con cada despliegue, no
un dato de usuario. Vive fuera de `/data` a propósito; montar una ruta dentro de
otra hacía que Docker creara un `/data/midi` fantasma en el host en cada
arranque. Si algún día activas las subidas, ese montaje tendrá que dejar de ser
de solo lectura (y las piezas subidas irían a `PM_DATA_DIR`).

Litestream y Cloudflare R2 quedan **desactivados en el portátil** vaciando las
cuatro variables `R2_*` en el compose. El `.env` de la raíz conserva las
credenciales porque las usan Render y Vercel, pero aquí no se leen: la base es
SQLite plano. Consecuencia: no hay copia externa. Si quieres una, un
`sqlite3 .backup` periódico a otra carpeta del portátil es suficiente.

## Despliegue automático en cada push

El portátil tiene un **runner de GitHub Actions** y un clon dedicado en
`~/srv/pianomentor`, que siempre es exactamente `origin/main`.

- `.github/workflows/deploy.yml` → se dispara con push a `main` o a mano.
- `deploy/scripts/deploy.sh` → `fetch` + `reset --hard`, `docker compose build`,
  `up -d` y comprobación de `/health` y de la portada. Si no responden en dos
  minutos, el flujo falla y se ve en la pestaña Actions.

**Por qué un clon aparte:** tu copia de trabajo tiene cambios sin commitear y un
`reset --hard` automático te los borraría. El clon de producción no se edita
nunca a mano; solo lo mueve el script.

### Registrar el runner (una sola vez)

En GitHub: *Settings → Actions → Runners → New self-hosted runner* (Linux x64).
Copia el token que muestra y, en el portátil:

```bash
mkdir -p ~/actions-runner && cd ~/actions-runner
curl -fLO https://github.com/actions/runner/releases/download/v2.338.2/actions-runner-linux-x64-2.338.2.tar.gz
tar xzf actions-runner-linux-x64-2.338.2.tar.gz
./config.sh --url https://github.com/andrupax94/PianoMentor-IA \
  --token TOKEN_DEL_PANEL --labels pianomentor --unattended
sudo ./svc.sh install "$USER"
sudo ./svc.sh start
```

El token caduca en una hora: si tarda, se genera otro. El servicio corre como
`chimuelo`, que está en el grupo `docker`, así que el script puede hablar con
Docker sin `sudo`.

### Riesgos que conviene tener presentes

- El repositorio es **público**. El flujo solo escucha `push` a `main` y
  `workflow_dispatch`, así que una PR desde un fork **no** puede ejecutar nada
  aquí. Aun así, un runner propio ejecuta lo que diga el workflow del commit
  subido: protege tu cuenta de GitHub con 2FA.
- Quien pueda escribir en `main` puede, en la práctica, llegar a root en el
  portátil (el runner tiene acceso a Docker). Es el precio de desplegar desde
  GitHub.
- El despliegue no corre mientras el portátil duerme (00:00–07:00): los trabajos
  quedan en cola y se ejecutan al despertar.


## HTTPS con Let's Encrypt

Certificado de `pianomentoria.com`, `www.pianomentoria.com` y
`api.pianomentoria.com`, emitido por HTTP-01 (puerto 80, sin parar Nginx) y
renovado por el contenedor `certbot` cada 12 h. Nginx se recarga solo cada 6 h
para tomar el certificado nuevo.

El primer certificado se pide así (solo la primera vez, o si cambias de
dominio). Certbot crea el reto en el volumen compartido y Nginx lo sirve:

```bash
docker compose run --rm --entrypoint certbot certbot certonly \
  -n --webroot -w /var/www/certbot \
  --email TU_CORREO --agree-tos --no-eff-email \
  --cert-name pianomentoria.com \
  -d pianomentoria.com -d www.pianomentoria.com -d api.pianomentoria.com
```

Comprobar la renovación sin gastar cuota (no pide nada, solo simula):

```bash
docker compose run --rm --entrypoint certbot certbot renew --dry-run
```

Y que Nginx sirve el certificado de verdad:

```bash
curl -sI https://www.pianomentoria.com | head -1
echo | openssl s_client -connect www.pianomentoria.com:443 -servername www.pianomentoria.com 2>/dev/null \
  | openssl x509 -noout -subject -dates
```

Detalles que importan si algún día lo tocas:

- `deploy/.env` usa `https://` y `wss://`. Las `NEXT_PUBLIC_*` se **hornean al
  construir**, así que cambiarlas obliga a `docker compose build frontend`.
- El puerto 80 solo sirve el reto ACME y redirige a HTTPS.
- La ruta `/.well-known/acme-challenge/` va **antes** de la redirección; si la
  mueves, la renovación falla y no te enteras hasta que caduque.
- El certificado caduca a los 90 días, pero certbot renueva a los 60. Si el
  contenedor `pm-certbot` está parado más de 30 días seguidos, la web empieza a
  dar aviso de certificado caducado.

## IP dinámica (Vercel DNS)

`deploy/ddns/` contiene un actualizador que cada 5 minutos compara la IP pública
con los registros A de Vercel y los corrige. Solo usa Python estándar.

```bash
# 1. Crear un token en https://vercel.com/account/tokens
# 2. Instalar (pide sudo una vez)
cd deploy/ddns
sudo bash install.sh

# 3. Poner el token (el archivo se crea con permisos 0600)
sudo nano /etc/pm-ddns.env

# 4. Primera ejecución manual y comprobación
sudo systemctl start pm-ddns.service
journalctl -u pm-ddns.service -n 20 --no-pager
systemctl list-timers pm-ddns.timer
```

El token de Vercel da acceso a tu cuenta: no lo pongas en el repositorio ni en
`deploy/.env`. Vive solo en `/etc/pm-ddns.env`.

## Ciclo noche del portátil

El portátil es un servidor: no debe suspenderse por inactividad. La sesión
gráfica es **GNOME**, así que la política vive en `gsettings`, no en
`powerdevilrc` (que es de Plasma y aquí no se usa):

```bash
gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type nothing
```

En cambio sí se suspende a las 00:00 y se despierta a las 07:00, con
`host/pm-night-suspend.timer` y `host/pm-night-wake.timer`. El segundo usa
`WakeSystem=true`, que arma el despertador del RTC para despertar solo.

```bash
cd host
sudo bash install-night-cycle.sh
```

Durante esa ventana la web no responde y el actualizador de IP no se ejecuta.
El cierre de tapa ya está ignorado en `/etc/systemd/logind.conf`
(`HandleLidSwitch=ignore`).

## Optimización de energía (servidor 24/7)

El portátil va a estar encendido todo el día con tráfico bajo. El script
`host/power-optimize.sh` aplica ajustes seguros (ejecutar con `sudo`):

```bash
cd ~/proyectos/"PianoMentor IA"/deploy/host
sudo bash power-optimize.sh
```

Qué hace:

| Ajuste | Detalle |
|---|---|
| Servicios innecesarios | Desactiva `cups` (impresión), `avahi-daemon` (mDNS) y `ModemManager` (celular) |
| CPU governor | Fija `powersave` de forma persistente (servicio systemd) |
| Frecuencia máxima | Limita a 1.0 GHz (base, sin turbo boost de 3.6 GHz) |
| Wi-Fi power save | Activo y persistente vía NetworkManager |
| Swappiness | 10 (menos escrituras a disco en SSD) |
| Pantalla | Se apaga tras 60 s de inactividad, sin bloqueo |
| Animaciones GNOME | Desactivadas (menos CPU en segundo plano) |

Lo que **no** hace (y por qué):

- **Undervolting**: reduce voltaje para ahorrar energía, pero es específico de cada chip y puede causar inestabilidad o corrupción de datos. No lo recomiendo en un servidor.
- **Bajar la frecuencia por debajo de la base (1.0 GHz)**: ahorra poco y puede hacer que la web responda lenta.
- **Desactivar el Wi-Fi**: obviamente no, es la conexión del servidor.

Para revertir la frecuencia máxima:

```bash
echo 3600000 | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_max_freq
```

**Recomendación adicional:** si la BIOS del HP lo permite, configura el umbral de carga de la batería al 80% (en HP se llama "Adaptive Battery Optimizer" o similar en la BIOS). Así la batería no se degrada por estar siempre al 100%.

## Seguridad mínima antes de publicar

- `AUTOLOGIN=false` (ya forzado en el compose).
- `ENVIRONMENT=production` (ya forzado): desactiva los endpoints `/api/v1/dev/*`.
- `PM_ENABLE_MIDI_UPLOAD=false` mientras no quieras subidas públicas.
- Revisa que `../.env` no tenga claves de más y que `../data/` no sea legible
  desde la web.

### Endurecer SSH y fail2ban

`hardening/ssh-hardening.sh` desactiva el acceso por contraseña (solo clave),
bloquea el login de root y añade fail2ban con la acción de `ufw`. Hace copia del
`sshd_config`, valida con `sshd -t` y **no reinicia** si la configuración falla.

```bash
sudo bash hardening/ssh-hardening.sh
```

Antes de cerrar la sesión, abre otra terminal y comprueba que sigues entrando
con la clave. La copia queda en `/etc/ssh/sshd_config.bak-<fecha>`.

Es el complemento del túnel SSH: con el puerto 22 publicado, la contraseña es la
única vía de fuerza bruta, y esta la cierra.
