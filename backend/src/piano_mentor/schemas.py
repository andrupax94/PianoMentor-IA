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
    """Sesión de práctica recién creada (B-012.1)."""

    id: str
    piece_id: str
    status: str = "idle"


class SessionStateResponse(BaseModel):
    """Estado vivo de una sesión; es también lo que empuja el WebSocket (B-012.1).

    `status` recorre idle/playing/paused y `control` indica quién tiene el piano
    (student/agent); `current_measure` y `position_s` sitúan al estudiante en la
    partitura y los rellenará el transporte de reproducción.
    """

    session_id: str
    piece_id: str
    status: str = "idle"
    control: str = "student"
    current_measure: int | None = None
    position_s: float = 0.0


class ActionRequest(BaseModel):
    action: str = Field(default="wait")


class ActionResponse(BaseModel):
    action: str
    status: str = "validated"


class NoteEvaluation(BaseModel):
    """Una nota esperada (o acorde) y cómo se clasificó al compararla (B-012.2).

    `deviation_ms` es la desviación media de las teclas que sí sonaron: negativa
    si el estudiante fue rápido, positiva si fue tarde, y None si no sonó nada
    de lo esperado.
    """

    start_seconds: float
    expected_pitches: list[int] = []
    status: str
    received_pitches: list[int] = []
    deviation_ms: float | None = None


class ExtraNoteEvaluation(BaseModel):
    """Un ataque del estudiante que no corresponde a ninguna nota esperada."""

    pitch: int
    t_s: float
    status: str = "extra"


class EvaluationCounts(BaseModel):
    """Cuántas unidades cayeron en cada categoría (B-012.2)."""

    correct: int = 0
    early: int = 0
    late: int = 0
    wrong_pitch: int = 0
    omitted: int = 0
    extra: int = 0


class EvaluationResponse(BaseModel):
    """Resultado de evaluar la sesión contra su pieza (B-012.2).

    `notes_score`/`timing_score` van de 0 a 1 y son lo que consumen las reglas
    del agente (B-012.3); `score_total` (0-100) es el número que ve el
    estudiante. El detalle llega en `notes` (una entrada por nota esperada o
    acorde) y `extras` (sobras de la interpretación).
    """

    session_id: str
    piece_id: str
    status: str = "computed"
    tolerance_ms: int = 100
    from_s: float | None = None
    to_s: float | None = None
    expected_total: int = 0
    received_total: int = 0
    counts: EvaluationCounts = EvaluationCounts()
    notes_score: float = 0.0
    timing_score: float = 0.0
    accuracy_pct: float = 0.0
    timing_ms: float = 0.0
    drift_ms: float = 0.0
    score_total: float = 0.0
    notes: list[NoteEvaluation] = []
    extras: list[ExtraNoteEvaluation] = []


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


class ToolCallResult(BaseModel):
    """Una función invocada por el modelo y el resultado de ejecutarla (B-012.8)."""

    name: str
    arguments: dict[str, object]
    rejected: bool = False


class ChatMessageRequest(BaseModel):
    """Petición al chat del agente (B-012.8)."""

    message: str
    chat_id: str | None = None
    context: dict[str, object] | None = None


class ChatMessageResponse(BaseModel):
    """Respuesta del chat del agente (B-012.8).

    `reply` es la respuesta natural. `client_action`, cuando no es None, es una
    orden que el navegador debe ejecutar (reproducir, pausar, abrir práctica…);
    el backend nunca la ejecuta. `used_tools` detalla qué funciones se llamaron.
    """

    chat_id: str
    reply: str
    provider: str
    used_fallback: bool
    client_action: ToolCallResult | None = None
    used_tools: list[ToolCallResult] = []
