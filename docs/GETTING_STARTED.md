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

## 7. Validaciones locales opcionales

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
npm run build
cd ..
```

## 8. Detener los servicios

```powershell
docker compose down
```

Para detener los servicios y eliminar también los volúmenes anónimos creados por el frontend:

```powershell
docker compose down -v
```

No uses la segunda variante si necesitas conservar dependencias cacheadas dentro de los volúmenes de desarrollo.

## 9. Problemas frecuentes

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

Esta guía cubre la estructura inicial y el arranque local de B-001. Las instrucciones funcionales de carga MIDI, práctica, evaluación y acciones pedagógicas se documentarán junto con sus respectivos módulos e Issues.
