# description: Entrada FastAPI: crea app, configura CORS y registra el router.
# context: Arranque del backend y endpoint /health. Al levantar la app arranca
# también el worker de la cola de respuestas aplazadas del chat (B-036.3),
# que reintenta los turnos saturados y entrega la redacción (historial + correo).

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import router
from .config import settings
from .llm_aplazados import iniciar_worker


@asynccontextmanager
async def _ciclo_de_vida(app: FastAPI) -> AsyncIterator[None]:
    """Arranque y paro de la app: al levantarse, el worker de aplazados."""
    iniciar_worker()
    yield


app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=_ciclo_de_vida)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)


@app.get("/health")
def root_health() -> dict[str, str]:
    return {"status": "ok", "service": settings.app_name}
