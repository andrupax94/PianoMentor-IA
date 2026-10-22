# description: Imagen reproducible del backend FastAPI.
# context: Despliegue local y base del servicio Docker en Render. El contexto de build es la raíz del repo (para poder hornear data/midi en la imagen).

FROM python:3.12-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONPATH=/app/src

COPY backend/pyproject.toml ./
COPY backend/src ./src
RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir "." \
    && pip install --no-cache-dir "pytest" "httpx" "sqlite-vec>=0.1.9,<1.0"

COPY backend/tests ./tests
# Corpus MIDI versionado (catálogo + .mid): sin esto, un despliegue limpio
# sirve la Library vacía porque ensure_catalog_loaded no encuentra los ficheros.
COPY data/midi /data/midi

EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --retries=5 CMD python -c "import os, urllib.request; urllib.request.urlopen('http://localhost:' + os.environ.get('PORT', '8000') + '/health')"
CMD ["sh", "-c", "uvicorn piano_mentor.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
