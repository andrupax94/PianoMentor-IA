# description: Modelos Pydantic de peticiones y respuestas de la API.
# context: Contrato tipado entre frontend y backend.

from pydantic import BaseModel, Field

from piano_mentor.midi import Hand


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
    """Una nota normalizada lista para reproducir (tiempos en segundos).

    `hand` (B-009.3) solo viaja cuando el cliente pide la información de manos
    (`?with_hands=true`); sin pedirlo la nota es exactamente la de siempre.
    """

    pitch: int
    start_seconds: float
    duration_seconds: float
    velocity: int
    channel: int
    track: int
    hand: Hand | None = None


class TrackSummary(BaseModel):
    """Resumen de una pista con notas y la mano que le toca (B-009.2/B-009.3).

    Describe **la pieza completa**, no la ventana pedida: la mano es una
    propiedad de la pista, así que no cambia porque se pida un compás suelto.
    """

    track: int
    hand: Hand
    note_count: int
    channels: list[int] = []
    lowest_pitch: int
    highest_pitch: int
    median_pitch: float


class ChordSummary(BaseModel):
    """Notas que suenan a la vez (B-009.1/B-009.3).

    Un acorde puede cruzar manos; la mano de cada nota va en `NoteResponse.hand`.
    """

    start_seconds: float
    pitches: list[int] = []


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
    """Partitura servida para reproducción: notas ordenadas por tiempo (B-006.1 + B-008.2).

    `tracks` y `chords` (B-009.3) son opcionales y solo aparecen si el cliente los
    pide (`?with_hands=true`, `?with_chords=true`); sin pedirlos la respuesta es
    la de siempre.
    """

    piece_id: str
    tempo: float | None = None
    duration_seconds: float | None = None
    notes_total: int = 0
    from_s: float | None = None
    to_s: float | None = None
    from_measure: int | None = None
    to_measure: int | None = None
    measures: PieceMeasures | None = None
    tracks: list[TrackSummary] | None = None
    chords: list[ChordSummary] | None = None
    notes: list[NoteResponse] = []


class PiecePreviewResponse(BaseModel):
    """Partitura efímera de un MIDI subido a mano (B-027.3).

    Se lee para escucharla en el piano y no se persiste: ni archivo en el
    almacén ni fila en `pieces`. Por eso no lleva `piece_id`; el navegador la
    reproduce en memoria y al recargar se pierde. `tracks` y `chords` son
    opcionales y siguen la misma regla que en `/notes` (B-009.3).
    """

    filename: str
    tempo: float | None = None
    duration_seconds: float | None = None
    notes_total: int = 0
    measures: PieceMeasures | None = None
    tracks: list[TrackSummary] | None = None
    chords: list[ChordSummary] | None = None
    notes: list[NoteResponse] = []
