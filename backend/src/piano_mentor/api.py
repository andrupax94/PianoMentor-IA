from fastapi import APIRouter, File, UploadFile, WebSocket, WebSocketDisconnect

from .agent import AgentService
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

router = APIRouter(prefix="/api/v1")
practice_service = PracticeService()
agent_service = AgentService()


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", service="piano-mentor-backend")


@router.post("/pieces", response_model=PieceResponse)
async def upload_piece(file: UploadFile = File(...)) -> PieceResponse:
    return PieceResponse(id="stub-piece", filename=file.filename or "unknown.mid")


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
