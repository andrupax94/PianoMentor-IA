# description: Modelos Pydantic de peticiones y respuestas de la API.
# context: Contrato tipado entre frontend y backend.

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str
    service: str


class PieceMetadata(BaseModel):
    """Metadatos iniciales de una pieza MIDI cargada."""

    tracks: int | None = None
    duration_seconds: float | None = None
    tempo: float | None = None
    notes_count: int | None = None


class PieceResponse(BaseModel):
    """Respuesta de la API para una pieza cargada."""

    id: str
    filename: str
    stored_filename: str
    size_bytes: int
    extension: str
    status: str = "uploaded"
    source: str = "upload"
    deduplicated: bool = False
    metadata: PieceMetadata = PieceMetadata()


class SessionCreate(BaseModel):
    piece_id: str


class SessionResponse(BaseModel):
    id: str
    piece_id: str
    status: str = "created"


class ActionRequest(BaseModel):
    action: str = Field(default="wait")


class ActionResponse(BaseModel):
    action: str
    status: str = "validated"


class EvaluationResponse(BaseModel):
    notes_score: float = 0.0
    timing_score: float = 0.0
    status: str = "stub"
