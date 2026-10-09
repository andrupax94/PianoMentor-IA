# description: Rutas HTTP y WebSocket del MVP (/pieces, /sessions, /actions, /agent-step, /ws). Debe mantenerse delgado.
# context: Traduce HTTP/WS a servicios; sin lógica musical compleja.

from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect

from .agent import AgentService
from .config import settings
from .practice import PracticeService
from .schemas import (
    ActionRequest,
    ActionResponse,
    EvaluationResponse,
    HealthResponse,
    PieceResponse,
    SessionCreate,
    SessionResponse,
)
from .storage import LocalPieceStorage
from .validators import (
    sanitize_filename,
    validate_content,
    validate_extension,
    validate_size,
    ValidationError,
)

router = APIRouter(prefix="/api/v1")
practice_service = PracticeService()
agent_service = AgentService()
storage = LocalPieceStorage(Path(settings.midi_storage_path))


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
        piece_id = storage.save(original_name, content)
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail={"code": exc.code, "message": exc.message})

    return PieceResponse(
        id=piece_id,
        filename=original_name,
        stored_filename=piece_id,
        size_bytes=len(content),
        extension=extension,
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
