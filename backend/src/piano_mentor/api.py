# description: Rutas HTTP y WebSocket del MVP (/pieces, /sessions, /actions, /agent-step, /ws). Debe mantenerse delgado.
# context: Traduce HTTP/WS a servicios; sin lógica musical compleja.

import logging
import sqlite3
import tempfile
from pathlib import Path

from fastapi import (
    APIRouter,
    File,
    HTTPException,
    Query,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)

from .agent import AgentService
from .catalog import ensure_catalog_loaded
from .chat import ChatService, get_fallback_provider
from .config import settings
from .database import find_existing_piece, find_piece_by_id, find_pieces, save_piece
from .midi import (
    HAND_UNKNOWN,
    Hand,
    MidiParseError,
    MidiService,
    NormalizedNote,
    describe_tracks,
    group_chords,
    hand_by_track,
)
from .practice import PracticeService
from .schemas import (
    ActionRequest,
    ActionResponse,
    ChatMessageRequest,
    ChatMessageResponse,
    ChordSummary,
    EvaluationResponse,
    HealthResponse,
    NoteResponse,
    PieceMeasures,
    PieceMetadata,
    PieceNotesResponse,
    PiecePreviewResponse,
    PieceResponse,
    PieceSummary,
    SessionCreate,
    SessionResponse,
    SessionStateResponse,
    ToolCallResult,
    TrackSummary,
)
from .storage import LocalPieceStorage, content_hash
from .validators import (
    ValidationError,
    sanitize_filename,
    validate_content,
    validate_extension,
    validate_size,
)

router = APIRouter(prefix="/api/v1")
practice_service = PracticeService()
agent_service = AgentService()
midi_service = MidiService()
storage = LocalPieceStorage(Path(settings.midi_storage_path))

logger = logging.getLogger(__name__)

# Códigos de cierre propios del WebSocket de sesión (rango 4000-4999).
WS_CLOSE_SESSION_NOT_FOUND = 4404
WS_CLOSE_INTERNAL_ERROR = 1011

# Conexiones WS abiertas por sesión, solo para el broadcast del estado (B-012.1).
# Vive en la memoria del proceso: el MVP corre con un worker (ver ARCHITECTURE.md).
_session_sockets: dict[str, set[WebSocket]] = {}


def _register_socket(session_id: str, websocket: WebSocket) -> None:
    _session_sockets.setdefault(session_id, set()).add(websocket)


def _unregister_socket(session_id: str, websocket: WebSocket) -> None:
    sockets = _session_sockets.get(session_id)
    if not sockets:
        return
    sockets.discard(websocket)
    if not sockets:
        _session_sockets.pop(session_id, None)


async def _broadcast_state(session_id: str, state: dict[str, object]) -> None:
    """Empuja el estado a todas las conexiones de la sesión, olvidando las caídas."""
    for websocket in list(_session_sockets.get(session_id, ())):
        try:
            await websocket.send_json({"type": "state", **state})
        except (WebSocketDisconnect, RuntimeError):
            _unregister_socket(session_id, websocket)


def _session_state_or_404(session_id: str) -> dict[str, object]:
    """Estado de la sesión o 404 con código estable si no existe."""
    try:
        return practice_service.get_state(session_id)
    except ValidationError as exc:
        raise HTTPException(
            status_code=404, detail={"code": exc.code, "message": exc.message}
        ) from exc


def _piece_from_row(row: sqlite3.Row, *, deduplicated: bool) -> PieceResponse:
    """Construye la respuesta API a partir de una fila ya persistida."""
    return PieceResponse(
        id=row["id"],
        filename=row["filename"],
        stored_filename=row["stored_filename"],
        size_bytes=row["size_bytes"],
        extension=row["extension"],
        status="existing" if deduplicated else "uploaded",
        source=row["source"] or "upload",
        deduplicated=deduplicated,
        metadata=PieceMetadata(
            tracks=row["tracks"],
            duration_seconds=row["duration_s"],
            tempo=row["tempo"],
            notes_count=row["notes_count"],
        ),
    )


def _piece_summary_from_row(row: sqlite3.Row) -> PieceSummary:
    """Aplana una fila persistida al resumen del selector de catálogo (B-027.3)."""
    return PieceSummary(
        id=row["id"],
        title=row["title"],
        composer=row["composer"],
        opus=row["opus"],
        difficulty=row["difficulty"],
        license=row["license"],
        cover=row["cover"],
        source=row["source"],
        duration_seconds=row["duration_s"],
        tempo=row["tempo"],
        notes_count=row["notes_count"],
        tracks=row["tracks"],
    )


def _note_response(note: NormalizedNote, hand: Hand | None = None) -> NoteResponse:
    """Nota del contrato; `hand` solo se rellena cuando el cliente pide las manos (B-009.3).

    Si no se pide, el campo no se pasa: con `response_model_exclude_unset` la nota
    viaja exactamente como antes de B-009.3.
    """
    payload: dict[str, object] = {
        "pitch": note.pitch,
        "start_seconds": note.start_seconds,
        "duration_seconds": note.duration_seconds,
        "velocity": note.velocity,
        "channel": note.channel,
        "track": note.track,
    }
    if hand is not None:
        payload["hand"] = hand
    return NoteResponse(**payload)


def _polyphony_fields(
    notes: list[NormalizedNote],
    piece_notes: list[NormalizedNote],
    *,
    with_hands: bool,
    with_chords: bool,
) -> dict[str, object]:
    """Campos de notas (con mano) y, si se piden, pistas y acordes (B-009.3).

    - Las manos se deciden sobre **toda la pieza**: una ventana que solo trae una
      mano no debe convertirla en `unknown` por falta de contra qué comparar.
    - Los acordes se calculan sobre las notas devueltas, así que ninguno se sale
      de la ventana pedida.
    """
    hands = hand_by_track(piece_notes) if with_hands else {}
    fields: dict[str, object] = {
        "notes": [
            _note_response(note, hands.get(note.track, HAND_UNKNOWN) if with_hands else None)
            for note in notes
        ]
    }
    if with_hands:
        fields["tracks"] = [
            TrackSummary(
                track=info.track,
                hand=info.hand,
                note_count=info.note_count,
                channels=list(info.channels),
                lowest_pitch=info.lowest_pitch,
                highest_pitch=info.highest_pitch,
                median_pitch=info.median_pitch,
            )
            for info in describe_tracks(piece_notes)
        ]
    if with_chords:
        fields["chords"] = [
            ChordSummary(start_seconds=chord.start_seconds, pitches=list(chord.pitches))
            for chord in group_chords(notes)
        ]
    return fields


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", service="piano-mentor-backend")


@router.get("/pieces", response_model=list[PieceSummary])
def list_pieces(source: str | None = Query(default=None)) -> list[PieceSummary]:
    """Lista las piezas disponibles para el selector (B-027.3).

    Sin filtro incluye el corpus y las subidas (corpus primero); `source=corpus`
    limita al catálogo, que es lo que pide la Library.

    Antes de listar se siembra el corpus si la base está vacía (B-027.4), para
    que un arranque limpio no sirva la Library vacía.
    """
    ensure_catalog_loaded()
    return [_piece_summary_from_row(row) for row in find_pieces(source)]


@router.post("/pieces", response_model=PieceResponse)
async def upload_piece(file: UploadFile = File(...)) -> PieceResponse:
    """Sube un MIDI y lo persiste con sus metadatos (B-002.4/B-005.4).

    La interfaz ya no lo usa —subir a mano pasa por /pieces/preview, que no
    guarda nada—, pero se mantiene a propósito: la subida persistente puede
    volver a necesitarse.
    """
    try:
        original_name = sanitize_filename(file.filename or "unknown.mid")
        extension = validate_extension(original_name)
        content = await file.read()
        validate_content(content)
        validate_size(len(content))
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail={"code": exc.code, "message": exc.message})

    # B-005.4+: deduplicación por hash. Si el contenido ya está persistido se
    # devuelve esa pieza sin crear archivo ni fila nueva. Prioriza el corpus:
    # subir un MIDI idéntico a uno del catálogo reutiliza su entrada.
    digest = content_hash(content)
    existing = find_existing_piece(digest)
    if existing is not None:
        return _piece_from_row(existing, deduplicated=True)

    # B-005.4: leer metadatos musicales reales. Si el MIDI no es legible, se
    # devuelve un 400 con código estable y se elimina el archivo recién guardado
    # para no dejar huérfanos en el filesystem.
    piece_id = storage.save(original_name, content)
    try:
        inspection = midi_service.inspect_file(storage.get_path(piece_id))
    except MidiParseError as exc:
        storage.delete(piece_id)
        raise HTTPException(
            status_code=400, detail={"code": exc.code, "message": exc.message}
        ) from exc

    metadata = PieceMetadata(
        tracks=inspection["tracks"],
        duration_seconds=inspection["duration_seconds"],
        tempo=inspection["tempo"],
        notes_count=inspection["notes_count"],
    )

    try:
        save_piece(
            {
                "id": piece_id,
                "filename": original_name,
                "stored_filename": piece_id,
                "size_bytes": len(content),
                "extension": extension,
                "tracks": metadata.tracks,
                "duration_s": metadata.duration_seconds,
                "tempo": metadata.tempo,
                "notes_count": metadata.notes_count,
                "content_hash": digest,
                "source": "upload",
            }
        )
    except sqlite3.Error as exc:
        storage.delete(piece_id)
        raise HTTPException(
            status_code=500,
            detail={"code": "persistence_error", "message": "No se pudieron guardar los metadatos"},
        ) from exc

    return PieceResponse(
        id=piece_id,
        filename=original_name,
        stored_filename=piece_id,
        size_bytes=len(content),
        extension=extension,
        source="upload",
        metadata=metadata,
    )


@router.post(
    "/pieces/preview",
    response_model=PiecePreviewResponse,
    response_model_exclude_unset=True,
)
async def preview_piece(
    file: UploadFile = File(...),
    with_hands: bool = Query(default=False),
    with_chords: bool = Query(default=False),
) -> PiecePreviewResponse:
    """Lee un MIDI subido a mano para escucharlo sin guardarlo (B-027.3).

    Comparte la validación con POST /pieces, pero es efímero: el archivo se
    escribe en un directorio temporal que se borra al terminar la lectura y
    nunca se inserta una fila en `pieces`. La partitura viaja en la respuesta,
    así que el piano la reproduce en memoria y la Library no la lista.

    Con `?with_hands=true` y `?with_chords=true` añade la mano de cada nota, el
    resumen de pistas y los acordes (B-009.3); sin pedirlos, la respuesta es la
    de siempre.
    """
    try:
        original_name = sanitize_filename(file.filename or "unknown.mid")
        validate_extension(original_name)
        content = await file.read()
        validate_content(content)
        validate_size(len(content))
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail={"code": exc.code, "message": exc.message}) from exc

    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / original_name
        path.write_bytes(content)
        try:
            # Una sola lectura sirve para la rejilla y para la partitura, como en /notes.
            grid = midi_service.measure_grid(path)
            score = midi_service.score(path)
        except MidiParseError as exc:
            raise HTTPException(
                status_code=400, detail={"code": exc.code, "message": exc.message}
            ) from exc

    ordered = sorted(score["notes"], key=lambda note: note.start_seconds)
    # El transporte dura hasta el final de la rejilla; si una nota se prolonga
    # más allá del último compás, se alarga para no cortarla al reproducir.
    last_note_end = max(
        (note.start_seconds + note.duration_seconds for note in ordered),
        default=0.0,
    )

    return PiecePreviewResponse(
        filename=original_name,
        tempo=score["tempo"],
        duration_seconds=max(grid.end_seconds, last_note_end),
        notes_total=len(ordered),
        measures=PieceMeasures(
            count=grid.count,
            starts_s=list(grid.starts_s),
            signatures=[list(signature) for signature in grid.signatures],
            end_s=grid.end_seconds,
        ),
        **_polyphony_fields(
            ordered,
            ordered,
            with_hands=with_hands,
            with_chords=with_chords,
        ),
    )


@router.get(
    "/pieces/{piece_id}/notes",
    response_model=PieceNotesResponse,
    response_model_exclude_unset=True,
)
def get_piece_notes(
    piece_id: str,
    from_s: float | None = Query(default=None),
    to_s: float | None = Query(default=None),
    from_measure: int | None = Query(default=None, ge=0),
    to_measure: int | None = Query(default=None, ge=0),
    with_hands: bool = Query(default=False),
    with_chords: bool = Query(default=False),
) -> PieceNotesResponse:
    # B-006.1 + B-008.2/B-008.3: partitura con ventana opcional (segundos o compases)
    # y la rejilla de compases para que el front sitúe el compás actual.
    # B-009.3: con with_hands/with_chords añade mano por nota, pistas y acordes;
    # sin pedirlos, response_model_exclude_unset deja la respuesta como estaba.
    # Igual que GET /pieces, siembra el corpus si la base está vacía: la portada
    # pide las notas de la pieza por defecto sin pasar antes por el listado.
    ensure_catalog_loaded()
    if (from_measure is None) != (to_measure is None):
        raise HTTPException(
            status_code=400,
            detail={
                "code": "invalid_measure_range",
                "message": "from_measure y to_measure deben ir juntos",
            },
        )
    if from_measure is not None and to_measure is not None and from_measure >= to_measure:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "invalid_measure_range",
                "message": "from_measure debe ser < to_measure",
            },
        )
    # La ventana en segundos solo se valida si no la sustituye un rango de compases.
    if from_measure is None and (
        (from_s is not None and from_s < 0)
        or (to_s is not None and to_s < 0)
        or (from_s is not None and to_s is not None and from_s > to_s)
    ):
        raise HTTPException(
            status_code=400,
            detail={
                "code": "invalid_window",
                "message": "from_s/to_s deben ser >= 0 y from_s <= to_s",
            },
        )

    row = find_piece_by_id(piece_id)
    if row is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "piece_not_found", "message": f"No existe la pieza: {piece_id}"},
        )

    midi_path = (
        Path(settings.midi_storage_path) / row["midi_path"]
        if row["midi_path"]
        else storage.get_path(row["stored_filename"])
    )
    try:
        # Una sola lectura de la rejilla sirve para la ventana y para el front.
        grid = midi_service.measure_grid(midi_path)
        score = midi_service.score(midi_path)
    except MidiParseError as exc:
        if exc.code == "midi_file_not_found":
            raise HTTPException(
                status_code=404,
                detail={"code": "piece_file_not_found", "message": exc.message},
            ) from exc
        raise HTTPException(
            status_code=400, detail={"code": exc.code, "message": exc.message}
        ) from exc

    if from_measure is not None and to_measure is not None:
        try:
            from_s, to_s = grid.resolve_range(from_measure, to_measure)
        except MidiParseError as exc:
            raise HTTPException(
                status_code=400, detail={"code": exc.code, "message": exc.message}
            ) from exc

    notes = score["notes"]
    ordered = sorted(notes, key=lambda note: note.start_seconds)
    if from_s is not None:
        ordered = [note for note in ordered if note.start_seconds >= from_s]
    if to_s is not None:
        ordered = [note for note in ordered if note.start_seconds <= to_s]

    measures = PieceMeasures(
        count=grid.count,
        starts_s=list(grid.starts_s),
        signatures=[list(signature) for signature in grid.signatures],
        end_s=grid.end_seconds,
    )

    return PieceNotesResponse(
        piece_id=row["id"],
        tempo=score["tempo"],
        duration_seconds=row["duration_s"],
        notes_total=len(notes),
        from_s=from_s,
        to_s=to_s,
        from_measure=from_measure,
        to_measure=to_measure,
        measures=measures,
        **_polyphony_fields(
            ordered,
            notes,
            with_hands=with_hands,
            with_chords=with_chords,
        ),
    )


@router.post("/sessions", response_model=SessionResponse, status_code=201)
def create_session(payload: SessionCreate) -> SessionResponse:
    try:
        session = practice_service.create_session(payload.piece_id)
    except ValidationError as exc:
        raise HTTPException(
            status_code=404, detail={"code": exc.code, "message": exc.message}
        ) from exc
    return SessionResponse(**session)


@router.get("/sessions/{session_id}/state", response_model=SessionStateResponse)
def get_session_state(session_id: str) -> SessionStateResponse:
    return SessionStateResponse(**_session_state_or_404(session_id))


@router.post("/sessions/{session_id}/actions", response_model=ActionResponse)
def execute_action(session_id: str, payload: ActionRequest) -> ActionResponse:
    if not agent_service.validate(payload.action):
        return ActionResponse(action="wait", status="rejected")
    return ActionResponse(action=payload.action, status="validated")


@router.post("/sessions/{session_id}/agent-step", response_model=ActionResponse)
def agent_step(session_id: str) -> ActionResponse:
    decision = agent_service.decide(_session_state_or_404(session_id))
    return ActionResponse(action=decision["action"], status="validated")


@router.post("/sessions/{session_id}/evaluation", response_model=EvaluationResponse)
def evaluate_session(session_id: str) -> EvaluationResponse:
    return EvaluationResponse()


@router.post("/agent/chat", response_model=ChatMessageResponse)
def agent_chat(payload: ChatMessageRequest) -> ChatMessageResponse:
    """Turno de chat del agente: función calling sobre lo ya implementado (B-012.8).

    El backend propone una función de la lista blanca, la valida y, si es de
    servidor, la ejecuta; si es de navegador, devuelve la intención para que el
    front la ejecute. Nunca toca MIDI ni el reloj de reproducción.
    """
    try:
        service = ChatService(get_fallback_provider())
        result = service.run(
            payload.message,
            chat_id=payload.chat_id,
            context=payload.context,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=422, detail={"code": "invalid_chat_payload", "message": str(exc)}
        ) from exc
    return ChatMessageResponse(
        chat_id=result.chat_id,
        reply=result.reply,
        provider=result.provider,
        used_fallback=result.used_fallback,
        client_action=ToolCallResult(**result.client_action)
        if result.client_action
        else None,
        used_tools=[ToolCallResult(**t) for t in result.used_tools],
    )


@router.websocket("/ws/sessions/{session_id}")
async def session_socket(websocket: WebSocket, session_id: str) -> None:
    """Sesión en tiempo real: estado al entrar y tras cada evento MIDI (B-012.1).

    Los mensajes van envueltos en `type` porque el mismo canal llevará las
    acciones del agente (`agent_action`) en B-012.5.
    """
    await websocket.accept()
    try:
        state = practice_service.get_state(session_id)
    except ValidationError as exc:
        await websocket.send_json({"type": "error", "code": exc.code, "message": exc.message})
        await websocket.close(code=WS_CLOSE_SESSION_NOT_FOUND)
        return

    _register_socket(session_id, websocket)
    try:
        await _broadcast_state(session_id, state)
        while True:
            try:
                event = await websocket.receive_json()
            except ValueError:
                await websocket.send_json(
                    {
                        "type": "error",
                        "code": "invalid_event_payload",
                        "message": "El mensaje no es JSON válido",
                    }
                )
                continue

            try:
                state = practice_service.receive_event(session_id, event)
            except ValidationError as exc:
                # Un evento malo no cierra la sesión: se avisa y se sigue escuchando.
                await websocket.send_json(
                    {"type": "error", "code": exc.code, "message": exc.message}
                )
                continue

            await _broadcast_state(session_id, state)
    except WebSocketDisconnect:
        return
    except Exception:
        logger.exception("WebSocket de la sesión %s falló", session_id)
        try:
            await websocket.send_json(
                {"type": "error", "code": "ws_error", "message": "Error interno de la sesión"}
            )
            await websocket.close(code=WS_CLOSE_INTERNAL_ERROR)
        except RuntimeError:
            pass
    finally:
        _unregister_socket(session_id, websocket)
