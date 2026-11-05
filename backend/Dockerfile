# description: Imagen reproducible del backend FastAPI.
# context: Despliegue local y base del servicio Docker en Render. El contexto de build es la raíz del repo (para poder hornear data/midi en la imagen).

FROM python:3.12-slim

# Litestream (replicación continua de SQLite a R2, B-031).
ARG LITESTREAM_VERSION=0.3.13
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates wget \
    && wget -qO /tmp/litestream.tar.gz \
        "https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-v${LITESTREAM_VERSION}-linux-amd64.tar.gz" \
    && tar -xzf /tmp/litestream.tar.gz -C /usr/local/bin litestream \
    && rm /tmp/litestream.tar.gz \
    && apt-get purge -y --auto-remove wget \
    && rm -rf /var/lib/apt/lists/*

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

# Configuración y entrypoint de Litestream (B-031).
COPY litestream.yml /etc/litestream.yml
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --retries=5 CMD python -c "import os, urllib.request; urllib.request.urlopen('http://localhost:' + os.environ.get('PORT', '8000') + '/health')"
CMD ["/entrypoint.sh"]
