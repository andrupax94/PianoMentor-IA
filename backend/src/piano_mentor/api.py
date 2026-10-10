# description: Rutas HTTP y WebSocket del MVP (/pieces, /sessions, /actions, /agent-step, /ws). Debe mantenerse delgado.
# context: Traduce HTTP/WS a servicios; sin lógica musical compleja.

import sqlite3
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect

from .agent import AgentService
from .config import settings
from .database import find_existing_piece, save_piece
from .midi import MidiParseError, MidiService
from .practice import PracticeService
from .schemas import (
    ActionRequest,
    ActionResponse,
    EvaluationResponse,
    HealthResponse,
    PieceMetadata,
    PieceResponse,
    SessionCreate,
    SessionResponse,
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


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", service="piano-mentor-backend")


@router.post("/pieces", response_model=PieceResponse)
async def upload_piece(file: UploadFile = File(...)) -> PieceResponse:
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


@router.post("/sessions", response_model=SessionResponse)
def create_session(payload: SessionCreate) -> SessionResponse:
    return SessionResponse(**practice_service.create_session(payload.piece_id))


@router.get("/sessions/{session_id}/state")
def get_session_state(session_id: str) -> dict[str, object]:
    return practice_service.get_state(session_id)


@router.post("/sessions/{session_id}/actions", response_model=ActionResponse)
def execute_action(session_id: str, payload: ActionRequest) -> ActionResponse:
    if not agent_service.validate(payload.action):
        return ActionResponse(action="wait", status="rejected")
    return ActionResponse(action=payload.action, status="validated")


@router.post("/sessions/{session_id}/agent-step", response_model=ActionResponse)
def agent_step(session_id: str) -> ActionResponse:
    decision = agent_service.decide(practice_service.get_state(session_id))
    return ActionResponse(action=decision["action"], status="validated")


@router.post("/sessions/{session_id}/evaluation", response_model=EvaluationResponse)
def evaluate_session(session_id: str) -> EvaluationResponse:
    return EvaluationResponse()


@router.websocket("/ws/sessions/{session_id}")
async def session_socket(websocket: WebSocket, session_id: str) -> None:
    await websocket.accept()
    try:
        await websocket.send_json({"session_id": session_id, "status": "connected"})
        while True:
            event = await websocket.receive_json()
            await websocket.send_json(practice_service.receive_event(session_id, event))
    except WebSocketDisconnect:
        return
