<!-- description: Guía reproducible de instalación, arranque y validación local. -->
<!-- context: Primer arranque del proyecto. -->

# Guía de instalación y arranque

Esta guía permite preparar y arrancar PianoMentor AI desde una copia limpia del repositorio.

## Requisitos previos

- Git.
- Docker Desktop con Docker Compose v2 y el motor Docker iniciado.
- Python 3.12 o superior para ejecutar validaciones locales del backend.
- Node.js 24 o superior y npm para ejecutar validaciones locales del frontend.

El flujo recomendado para ejecutar la aplicación es Docker Compose. Python y Node.js solo son necesarios para las validaciones fuera de contenedores.

## 1. Clonar y entrar al repositorio

Desde PowerShell:

```powershell
git clone <URL_DEL_REPOSITORIO>
cd "PianoMentor IA"
```

Si ya tienes el repositorio, sitúate en su raíz:

```powershell
cd "E:\Proyectos\PianoMentor IA"
```

## 2. Preparar las variables de entorno

Crea el archivo local a partir de la plantilla:

```powershell
Copy-Item .env.example .env
```

En macOS o Linux:

```bash
cp .env.example .env
```

Edita `.env` únicamente si necesitas cambiar valores de desarrollo o añadir credenciales. No incluyas claves reales en `.env.example`, commits, Issues, logs ni capturas.

El archivo `.env` está excluido por `.gitignore`.

## 3. Validar la configuración de Compose

Ejecuta una validación silenciosa para no imprimir los valores efectivos del entorno:

```powershell
docker compose config -q
```

Si el comando termina sin errores, la configuración es válida.

## 4. Construir las imágenes

```powershell
docker compose build
```

Este comando construye las imágenes del backend FastAPI y del frontend Next.js.

## 5. Arrancar los servicios

```powershell
docker compose up -d
```

Comprobar el estado:

```powershell
docker compose ps
```

El backend debe aparecer como `healthy` y el frontend como `Up`.

## 6. Abrir la aplicación

- Frontend: <http://localhost:3000>
- Backend: <http://localhost:8000>
- Healthcheck del backend: <http://localhost:8000/health>

Desde PowerShell se puede validar el backend con:

```powershell
Invoke-WebRequest http://localhost:8000/health -UseBasicParsing
```

La respuesta esperada incluye:

```json
{"status":"ok","service":"PianoMentor AI"}
```

También se puede validar el frontend:

```powershell
Invoke-WebRequest http://localhost:3000 -UseBasicParsing
```

La respuesta esperada es HTTP `200`.

## 7. Cargar el corpus MIDI en SQLite

La base de datos se crea con su esquema en cuanto arranca el backend, pero las 15 piezas del corpus se cargan con un comando puntual (B-003.3):

```powershell
docker compose exec backend python -m piano_mentor.catalog
```

La salida esperada es `Catálogo cargado: 15 piezas en sqlite:////data/piano_mentor.db`.

La carga es **idempotente**: repetirla no duplica filas, así que es seguro ejecutarla en cada despliegue.

> Requisito previo: el corpus debe existir en `data/midi/corpus/` junto con `data/midi/catalog.json`. El catálogo está versionado; los `.mid` del corpus no (licencias de terceros), así que en una copia nueva hay que traerlos aparte. Ver "Despliegue en otro host Docker".

### Reconstruir las imágenes al cambiar dependencias

El código fuente se sirve por volumen, pero las dependencias Python se instalan en tiempo de build. Si cambia `backend/pyproject.toml` (por ejemplo, al añadir una extensión como `sqlite-vec`), hay que reconstruir:

```powershell
docker compose up -d --build backend
```

`docker compose up -d` solo (sin `--build`) reutiliza la imagen anterior y no instala nada nuevo.

## 8. Validaciones locales opcionales

### Backend

```powershell
cd backend
python -m pip install -e ".[dev]"
python -m compileall src tests
python -m pytest -q
cd ..
```

### Frontend

```powershell
cd frontend
npm install
npm run test
npm run build
cd ..
```

### Flujo web de carga (B-004)

Una vez arrancados los servicios, el primer flujo completo web → API se prueba en <http://localhost:3000>:

1. En el panel **Cargar pieza**, selecciona un archivo `.mid` o `.midi` (por ejemplo, uno de `data/midi/corpus/`).
2. La web valida de forma orientativa la extensión y el tamaño, lo sube a `POST /api/v1/pieces` y muestra los metadatos que el backend persistió (nombre, tamaño, extensión y, cuando estén disponibles, pistas, duración y número de notas).
3. Un archivo inválido (por ejemplo, un `.txt`) muestra el mensaje de error del backend sin recargar la página.
4. Si el backend está detenido, la web muestra "No se pudo conectar con el servicio" y la página sigue siendo navegable.

Todas las llamadas REST del frontend pasan por `frontend/src/lib/api-client.ts`; ningún componente usa `fetch` directamente.

## 9. Detener los servicios

```powershell
docker compose down
```

Para detener los servicios y eliminar también los volúmenes anónimos creados por el frontend:

```powershell
docker compose down -v
```

No uses la segunda variante si necesitas conservar dependencias cacheadas dentro de los volúmenes de desarrollo.

## 10. Despliegue en otro host Docker

En un servidor con Docker (VPS, cloud, NAS) el flujo es el mismo, con tres diferencias:

### 1. El corpus MIDI no viaja con git

`data/midi/catalog.json` (los metadatos: título, licencia, `source_url`, dificultad) **sí está versionado**, pero los `.mid` de `data/midi/corpus/` están excluidos de `.gitignore` por licencias de terceros. Después de clonar, cópialos al host (por `scp`, `rsync` o un volumen externo) antes de ejecutar el comando de carga del paso 7. Sin ellos, el comando devuelve `CatalogError: MIDI referenciado inexistente`. Cada entrada del catálogo incluye `source_url` para re-descargar el archivo original desde Mutopia si hiciera falta.

### 2. Crea el `.env` en el host

Copia `.env.example` a `.env` y rellena los valores reales (por ejemplo `GROQ_API_KEY` si vas a usar el LLM). El archivo está excluido de Git y el backend lo lee con `env_file`.

### 3. El frontend apunta a `localhost` por defecto

En `docker-compose.yml`, `NEXT_PUBLIC_API_URL` y `NEXT_PUBLIC_WS_URL` están a `http://localhost:8000`. Next.js **quema esas variables en tiempo de build**, así que:

- Si accedes al frontend desde el propio host (o con un túnel/VPN hacia el backend), no hay que tocar nada.
- Si el navegador está en otro equipo, edita `docker-compose.yml` y sustituye `localhost` por la IP o dominio del host (`http://<host>:8000`) **antes** de ejecutar `docker compose up -d --build`, que fuerza el rebuild del frontend.

### Persistencia de datos

`./data` se monta en `/data` dentro del contenedor: la base SQLite (`/data/piano_mentor.db`) y los MIDI sobreviven a `docker compose down`. El directorio `data/` debe existir en el host antes del primer arranque; si no, Docker lo crea como raíz propiedad de root, lo que puede romper permisos de escritura del backend.

Puertos expuestos por defecto: `8000` (backend) y `3000` (frontend). Para un host accesible desde Internet, limita el acceso (firewall, reverse proxy con TLS) y no expongas el backend sin autenticación.

## 11. Problemas frecuentes

### Docker no está disponible

Inicia Docker Desktop y comprueba que el motor esté funcionando:

```powershell
docker version
```

### El puerto 3000 u 8000 está ocupado

Comprueba qué proceso utiliza el puerto y deténlo o cambia el mapeo en un archivo `docker-compose.override.yml` local. Ese archivo está excluido de Git.

### Falta `.env`

Créalo desde la plantilla:

```powershell
Copy-Item .env.example .env
```

### El backend no aparece como saludable

Consulta los logs sin copiar valores sensibles a documentación pública:

```powershell
docker compose logs backend
```

### El frontend no puede comunicarse con el backend

Comprueba que ambos servicios estén activos y que el backend responda:

```powershell
docker compose ps
Invoke-WebRequest http://localhost:8000/health -UseBasicParsing
```

## Alcance de esta guía

Esta guía cubre el arranque local con Docker Compose y la carga del corpus MIDI en SQLite (B-003). Las instrucciones funcionales de práctica, evaluación y acciones pedagógicas se documentarán junto con sus respectivos módulos e Issues.
