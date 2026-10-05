from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str
    service: str


class PieceResponse(BaseModel):
    id: str
    filename: str
    status: str = "stub"


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
