# description: Imagen reproducible del backend FastAPI.
# context: Despliegue local y base del Space de Hugging Face.

FROM python:3.12-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONPATH=/app/src

COPY pyproject.toml ./
COPY src ./src
RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir "." \
    && pip install --no-cache-dir "pytest" "httpx" "sqlite-vec>=0.1.9,<1.0"

COPY tests ./tests

EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --retries=5 CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"
CMD ["uvicorn", "piano_mentor.main:app", "--host", "0.0.0.0", "--port", "8000"]
