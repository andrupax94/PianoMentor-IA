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


class NoteResponse(BaseModel):
    """Una nota normalizada lista para reproducir (tiempos en segundos)."""

    pitch: int
    start_seconds: float
    duration_seconds: float
    velocity: int
    channel: int
    track: int


class PieceSummary(BaseModel):
    """Resumen de una pieza para el selector del catálogo (B-027.3).

    Aplana la fila persistida a los campos que necesita la Library del frontend;
    `cover` es la ruta pública de la portada (NULL en subidas sin portada).
    """

    id: str
    title: str | None = None
    composer: str | None = None
    opus: str | None = None
    difficulty: str | None = None
    license: str | None = None
    cover: str | None = None
    source: str | None = None
    duration_seconds: float | None = None
    tempo: float | None = None
    notes_count: int | None = None
    tracks: int | None = None


class PieceMeasures(BaseModel):
    """Rejilla de compases servida al front para situar el compás actual (B-008.3).

    `starts_s` son los inicios de cada compás en segundos de partitura (sin
    escalar por el factor de tempo del transporte); `signatures` lleva la firma
    [numerador, denominador] vigente en cada compás, alineada con `starts_s`.
    """

    count: int = 0
    starts_s: list[float] = []
    signatures: list[list[int]] = []
    end_s: float = 0.0


class PieceNotesResponse(BaseModel):
    """Partitura servida para reproducción: notas ordenadas por tiempo (B-006.1 + B-008.2)."""

    piece_id: str
    tempo: float | None = None
    duration_seconds: float | None = None
    notes_total: int = 0
    from_s: float | None = None
    to_s: float | None = None
    from_measure: int | None = None
    to_measure: int | None = None
    measures: PieceMeasures | None = None
    notes: list[NoteResponse] = []
