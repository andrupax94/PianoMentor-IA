# Problemas frecuentes y soluciones

Este documento es una bitácora técnica para registrar problemas reproducibles, diagnóstico y solución. Debe crecer junto con el proyecto sin sustituir la documentación de arquitectura ni el plan de trabajo.

## Cómo registrar un problema nuevo

Para cada incidencia, añadir:

1. Síntoma observable.
2. Entorno y comando que lo reproduce.
3. Diagnóstico confirmado.
4. Solución o workaround.
5. Si requiere cambios permanentes en código, Docker o documentación.
6. Fecha y referencia a la Issue relacionada, cuando exista.

No copiar secretos, tokens, el contenido de `.env` ni logs sin redactar.

## Docker no está disponible

**Síntoma:** Docker Compose no puede conectarse al motor Docker.

**Comprobación:**

```powershell
docker version
```

**Solución:** iniciar Docker Desktop y esperar a que el motor esté listo. Después comprobar:

```powershell
docker compose config -q
docker compose ps
```

## Falta el archivo `.env`

**Síntoma:** Compose informa de que no puede cargar el archivo de entorno o el backend arranca con una configuración inesperada.

**Solución:**

```powershell
Copy-Item .env.example .env
docker compose config -q
```

No rellenar claves reales en `.env.example` y no versionar `.env`.

## Un puerto está ocupado

**Síntoma:** Docker o Next.js informa de que el puerto `3000` o `8000` ya está en uso.

**Diagnóstico en Windows:**

```powershell
netstat -ano | Select-String ':3000|:8000'
```

**Solución:** detener el proceso que ocupa el puerto o crear un `docker-compose.override.yml` local con un puerto publicado alternativo. El override local está excluido de Git.

## El backend no aparece como saludable

**Diagnóstico:**

```powershell
docker compose ps
docker compose logs backend
Invoke-WebRequest http://localhost:8000/health -UseBasicParsing
```

**Revisión:** confirmar que `.env` existe, que el backend tiene sus dependencias instaladas y que el healthcheck apunta a `/health` dentro del contenedor.

No publicar logs sin revisar que no contengan credenciales o valores completos de configuración.

## El frontend devuelve error al arrancar

**Diagnóstico:**

```powershell
docker compose logs frontend
```

Para validación local:

```powershell
cd frontend
npm install
npm run build
```

Comprobar también que `frontend/src/app/` y `frontend/src/lib/` existan y que no haya errores de TypeScript.

## El frontend no puede comunicarse con el backend

Comprobar primero que el backend responde:

```powershell
Invoke-WebRequest http://localhost:8000/health -UseBasicParsing
```

Después revisar:

- `NEXT_PUBLIC_API_URL` para HTTP.
- `NEXT_PUBLIC_WS_URL` para WebSocket.
- `CORS_ORIGINS` en el backend.
- que ambos servicios estén activos en `docker compose ps`.

## Las pruebas backend se quedan bloqueadas

Ejecutar una prueba aislada para localizar el problema:

```powershell
python -m pytest -q backend/tests/test_health.py -x
```

Después ejecutar el conjunto completo:

```powershell
python -m pytest -q backend/tests -x
```

Si el problema depende de una instalación incompleta, reinstalar las dependencias de desarrollo desde `backend/`:

```powershell
python -m pip install -e ".[dev]"
```

## Se muestran secretos en un diagnóstico

Detener la publicación del log o captura, eliminarlo del canal correspondiente y rotar la credencial afectada. No volver a pegar el valor en Issues, commits o mensajes.

Para diagnósticos de Compose, preferir:

```powershell
docker compose config -q
```

en lugar de compartir la salida completa de `docker compose config`.

## Incidencias pendientes

Esta sección queda reservada para problemas reproducibles que requieran investigación posterior. Cada entrada debe enlazar a una Issue o Sub-issue cuando se cree.
