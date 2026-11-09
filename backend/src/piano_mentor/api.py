# description: Rutas HTTP y WebSocket del MVP (/pieces, /sessions, /actions, /agent-step, /ws, /auth/*). Debe mantenerse delgado. POST /sessions/{id}/actions valida y ejecuta la acción del agente (B-012.4–B-012.7): demonstrate/return_control cambian el control y accompany difunde la mano de la IA y sus notas; el WS responde ping con pong para medir la latencia. Desde B-032.4-B-032.6 traduce también modos de práctica, posición y señales de práctica; tras cada señal decide en vivo y ejecuta las reglas de strikes (practice_rules), y una demostración de strikes programa su propia return control al acabar la ventana. Con B-032.7 (ADR 0008) el WS lleva además la respuesta del alumno a la oferta (`offer_accept`/`offer_dismiss`/`offer_repeat`), que ejecuta la demo con los parámetros ya guardados y mueve el motor solo cuando el alumno lo pide.
# context: Traduce HTTP/WS a servicios; sin lógica musical compleja. La identidad (U-005) y el registro por pasos (U-006) también viven aquí. El acompañamiento no cambia el control (el estudiante sigue tocando) y sus notas viajan con tiempos relativos al inicio de la sección.

import asyncio
import json
import logging
import math
import re
import secrets
import sqlite3
import tempfile
import time
from collections.abc import Mapping
from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi import (
    APIRouter,
    BackgroundTasks,
    File,
    Header,
    HTTPException,
    Query,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.responses import HTMLResponse

from .accompaniment import AccompanimentService
from .agent import AgentDecision, AgentService, DecisionContext, demo_repeat_allowed
from .auth import (
    AuthTokenError,
    create_pm_token,
    verify_google_id_token,
    verify_pm_token,
)
from .catalog import ensure_catalog_loaded
from .chat import ChatService, get_fallback_provider
from .config import settings
from .database import (
    consume_auth_token,
    count_agent_action_total,
    count_agent_actions,
    create_auth_token,
    create_pending_registration,
    find_existing_piece,
    find_piece_by_id,
    find_pieces,
    find_user_by_auth_token,
    find_user_by_email,
    find_user_by_google_sub,
    find_user_by_verification_token,
    insert_agent_decision,
    last_pending_offer,
    mark_email_verified,
    max_signal_id_at,
    open_db,
    save_piece,
    update_password_changed_at,
    update_pending_registration,
    upsert_user,
)
from .evaluation import DEFAULT_TOLERANCE_MS, EvaluationService, resolve_measure_window
from .mailer import send_password_changed_notification, send_password_reset_email, send_verification_email
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
from .passwords import hash_password
from .passwords import verify_password as verify_user_password
from .practice import PracticeService
from .practice_report import normalize_limit, session_report
from .schemas import (
    AUTH_LEVELS,
    GENRES_UI,
    ActionRequest,
    ActionResponse,
    AuthLoginRequest,
    AuthLoginResponse,
    AuthForgotPasswordRequest,
    AuthForgotPasswordResponse,
    AuthRegisterRequest,
    AuthRegisterResponse,
    AuthResetPasswordRequest,
    AuthResetPasswordResponse,
    AuthSessionResponse,
    AuthUser,
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
    PracticeReportResponse,
    SessionCreate,
    SessionPracticeModeRequest,
    SessionResponse,
    SessionStateResponse,
    ToolCallResult,
    TrackSummary,
)
from .storage import LocalPieceStorage, content_hash, create_storage
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
evaluation_service = EvaluationService()
accompaniment_service = AccompanimentService()
midi_service = MidiService()
storage = create_storage()

logger = logging.getLogger(__name__)

# Códigos de la evaluación que significan "no existe el recurso" (B-012.2).
NOT_FOUND_CODES = {"session_not_found", "piece_not_found", "piece_file_not_found"}

# Códigos de cierre propios del WebSocket de sesión (rango 4000-4999).
WS_CLOSE_SESSION_NOT_FOUND = 4404
WS_CLOSE_INTERNAL_ERROR = 1011

# Cada cuánto se difunde la posición del transporte (B-032.2). El navegador la
# manda a 4 Hz, pero el `state` solo sale cuando cambia el compás o cada 500 ms:
# un mensaje por frame saturaría el canal y competiría con el `ping`/`pong` que
# decide si el acompañamiento se degrada (B-012.7).
POSITION_PUSH_MS = 500

# Conexiones WS abiertas por sesión, solo para el broadcast del estado (B-012.1).
# Vive en la memoria del proceso: el MVP corre con un worker (ver ARCHITECTURE.md).
_session_sockets: dict[str, set[WebSocket]] = {}

# Última posición difundida por sesión: (instante monotónico, compás). Solo
# decide el ritmo del broadcast; la posición real vive en SQLite.
_last_position_push: dict[str, tuple[float, int | None]] = {}


def position_push_due(
    previous: tuple[float, int | None] | None,
    measure: int | None,
    now_s: float,
) -> bool:
    """True si toca difundir la posición: es la primera, cambia el compás o pasaron 500 ms.

    Pura y con el instante inyectado para poder probar el umbral sin dormir.
    """
    if previous is None:
        return True
    last_s, last_measure = previous
    if measure != last_measure:
        return True
    return now_s - last_s >= POSITION_PUSH_MS / 1000


def _register_socket(session_id: str, websocket: WebSocket) -> None:
    _session_sockets.setdefault(session_id, set()).add(websocket)


def _unregister_socket(session_id: str, websocket: WebSocket) -> None:
    sockets = _session_sockets.get(session_id)
    if not sockets:
        return
    sockets.discard(websocket)
    if not sockets:
        _session_sockets.pop(session_id, None)
        # Sin conexiones no hay a quién difundir: el próximo cliente empieza limpio.
        _last_position_push.pop(session_id, None)


async def _broadcast_state(session_id: str, state: dict[str, object]) -> None:
    """Empuja el estado a todas las conexiones de la sesión, olvidando las caídas."""
    for websocket in list(_session_sockets.get(session_id, ())):
        try:
            await websocket.send_json({"type": "state", **state})
        except (WebSocketDisconnect, RuntimeError):
            _unregister_socket(session_id, websocket)


async def _broadcast_agent_action(session_id: str, action: str, **params: object) -> None:
    """Notifica una acción del agente a todas las conexiones de la sesión (B-012.5).

    El front escucha `agent_action` para mostrar el indicador de demostración,
    bloquear el teclado o devolver el control al estudiante. Desde B-032.6 las
    reglas de strikes también viajan por aquí, con su `reason` para la interfaz.
    """
    for websocket in list(_session_sockets.get(session_id, ())):
        try:
            await websocket.send_json({"type": "agent_action", "action": action, **params})
        except (WebSocketDisconnect, RuntimeError):
            _unregister_socket(session_id, websocket)


# --- B-032.6: ejecución determinista de las reglas de strikes -----------------

# Tareas de devolución de control programadas por sesión (B-032.6): la
# demostración terminada se devuelve sola, sin que el chat ni el front lo pidan.
_auto_return_tasks: dict[str, asyncio.Task[None]] = {}

# Margen extra sobre la duración de la ventana demostrada: el front arranca la
# demo un poco después de recibirla y el canal puede tardar (B-012.7).
DEMO_RETURN_MARGIN_S = 1.5

# Duración de reserva cuando la pieza no deja medir la ventana (sin rejilla).
DEMO_RETURN_FALLBACK_S = 30.0

# Acciones que las reglas de strikes pueden pedir (B-032.6/B-032.7): la lista
# blanca está en agent.py; este subconjunto es el que se ejecuta en vivo por
# WS. Con ADR 0008 el silencio del gate ya no demuestra: propone (`offer_demo`,
# que no toca control ni motor), y el alumno decide vía `offer_accept`/
# `offer_dismiss`/`offer_repeat` (más abajo).
STRIKE_ACTIONS = ("slow_down", "give_hint", "offer_demo")


def _event_measure(event: Mapping[str, object]) -> int | None:
    """Compás que trae el evento de práctica (o `None` si la pieza no tiene rejilla)."""
    measure = event.get("measure")
    return int(measure) if isinstance(measure, int) else None


def _record_agent_decision(
    session_id: str,
    action: str,
    params: Mapping[str, object],
    *,
    reason: str = "",
    provider: str = "deterministic",
    measure: int | None = None,
) -> None:
    """Registra la intervención ejecutada y congela el contador de strikes.

    `baseline_signal_id` es la última señal vista al ejecutar la acción: las
    reglas de B-032.6 cuentan fallos nuevos a partir de ahí, sin borrar el
    historial de `practice_signals`.
    """
    with open_db() as conn:
        insert_agent_decision(
            conn,
            {
                "session_id": session_id,
                "measure": measure,
                "action": action,
                "params_json": json.dumps(dict(params), ensure_ascii=False),
                "reason": reason,
                "provider": provider,
                "baseline_signal_id": max_signal_id_at(conn, session_id),
            },
        )


def demo_return_delay_s(
    decision: AgentDecision | Mapping[str, object],
    *,
    row: Mapping[str, object] | None = None,
) -> float:
    """Segundos que faltan para devolver el control tras una demostración (B-032.6).

    Pura con dependencias inyectadas para probar el cálculo sin tocar el disco:
    la ventana demostrada en segundos (de `from_measure` inclusive hasta el fin
    de `to_measure`) dividida por el factor de tempo, más el margen del canal.
    Sin pieza, sin rejilla o con compases fuera de límites queda la reserva.

    Acepta una decisión del agente o un mapeo equivalente (params completos),
    para que preguntas distintas a la misma función no dupliquen la lógica.
    """
    params = decision.params if isinstance(decision, AgentDecision) else decision

    from_measure = params.get("from_measure")
    to_measure = params.get("to_measure", from_measure)
    tempo_factor = params.get("tempo_factor", 1.0)
    try:
        factor = float(tempo_factor)
        frm = int(from_measure)
        to = int(to_measure)
    except (TypeError, ValueError):
        return DEMO_RETURN_FALLBACK_S
    if not math.isfinite(factor) or factor <= 0:
        factor = 1.0
    if row is None:
        return DEMO_RETURN_FALLBACK_S

    try:
        from_s, to_s = resolve_measure_window(row, frm, to + 1)  # type: ignore[arg-type]
    except ValidationError:
        return DEMO_RETURN_FALLBACK_S
    duration_s = max(to_s - from_s, 0.0)
    return duration_s / factor + DEMO_RETURN_MARGIN_S


def _schedule_demo_return(session_id: str, decision: AgentDecision, row: Mapping[str, object] | None) -> None:
    """Programa la devolución de control al acabar la demostración (B-032.6).

    Una decisión de `demonstrate` cierra el bucle sola: pasado el tiempo de la
    ventana demostrada (más margen), el backend devuelve el control y difunde
    `return_control`. Si la sesión ya volvió a manos del estudiante por otra
    vía, la tarea no hace nada.
    """
    previous = _auto_return_tasks.get(session_id)
    if previous is not None and not previous.done():
        previous.cancel()
    delay_s = demo_return_delay_s(decision, row=row)

    async def _return_control() -> None:
        try:
            await asyncio.sleep(delay_s)
            state = practice_service.get_state(session_id)
            if state.get("control") != "agent":
                return
            new_state = practice_service.set_control(session_id, "student")
            demo_measure = decision.params.get("from_measure")
            _record_agent_decision(
                session_id,
                "return_control",
                {},
                reason="demo_return",
                measure=int(demo_measure) if isinstance(demo_measure, int) else None,
            )
            await _broadcast_agent_action(session_id, "return_control")
            await _broadcast_state(session_id, new_state)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            logger.exception("Devolución de control falló en la sesión %s", session_id)

    _auto_return_tasks[session_id] = asyncio.create_task(_return_control())


async def _execute_strike_decision(
    session_id: str,
    decision: AgentDecision,
    state: dict[str, object],
    *,
    record_action: str | None = None,
) -> dict[str, object]:
    """Valida, persiste y ejecuta una decisión de strikes en vivo (B-032.6/B-032.7).

    Devuelve el estado actualizado de la sesión. Las decisiones inválidas se
    callan (no cuentan como intervención): el front no recibe `agent_action`
    si la acción acabara bloqueando o duplicando (topes de las reglas).

    `record_action` cambia qué se graba en `agent_decisions` cuando la acción
    ejecutada y la registrada no coinciden (B-032.7): `offer_repeat` se difunde
    como `demonstrate` (el front reproduce la demo igual) pero el tope del
    «otra vez» cuenta filas de `repeat_demo`.
    """
    try:
        agent_service.validate_action(decision.action, decision.params, session_state=state)
    except ValidationError as exc:
        logger.debug(
            "Decisión de strikes descartada en la sesión %s: %s (%s)",
            session_id,
            decision.action,
            exc.message,
        )
        return state

    if decision.action == "demonstrate":
        new_state = practice_service.set_control(session_id, "agent")
    else:
        new_state = state

    _record_agent_decision(
        session_id,
        record_action if record_action is not None else decision.action,
        decision.params,
        reason=decision.reason,
        measure=_measure_from_params(decision.params, state),
    )
    await _broadcast_agent_action(session_id, decision.action, reason=decision.reason, **decision.params)
    if decision.action == "demonstrate":
        row = find_piece_by_id(str(state.get("piece_id") or ""))
        _schedule_demo_return(session_id, decision, row)
    return new_state


async def _handle_offer_event(
    session_id: str,
    event: Mapping[str, object],
    state: dict[str, object],
) -> dict[str, object]:
    """Respuesta del alumno a la oferta de demostración (B-032.7/ADR 0008).

    El sobre del cliente es mínimo (`offer_accept`, `offer_dismiss` y
    `offer_repeat` van sin parámetros): los parámetros de la demostración
    salen de las decisiones ya grabadas en `agent_decisions` (la oferta sin
    contestar para aceptar o rechazar, la última demostración para repetir).
    Con `offer_demo` el control no cambia: quien mueve el motor es siempre
    una petición del alumno. Los errores de tope viajan como sobre `error`
    sin cerrar la sesión.
    """
    choice = str(event.get("type"))

    if choice == "offer_dismiss":
        pending = _pending_offer(session_id)
        if pending is None:
            # Sin oferta que rechazar no se graba ni se difunde nada: el front
            # puede mandarlo doble (dos pestañas, un F5…).
            return state
        _record_agent_decision(
            session_id,
            "offer_dismiss",
            {},
            reason="student_declined",
            measure=_offer_measure(pending),
        )
        await _broadcast_agent_action(session_id, "offer_dismiss")
        return state

    # `offer_accept` ejecuta la demo ofertada tal cual; `offer_repeat` repite
    # la última demostración ya ejecutada, con sus parámetros guardados.
    if choice == "offer_accept":
        pending = _pending_offer(session_id)
        if pending is None:
            await _send_offer_error(
                session_id, "action_not_allowed_now", "No hay una oferta de demostración pendiente"
            )
            return state
        decision = _consented_demo_decision(pending["params_json"], reason="offer_accepted")
        return await _execute_strike_decision(session_id, decision, state)

    # choice == "offer_repeat"
    demo = _last_demo_decision(session_id)
    if demo is None:
        await _send_offer_error(
            session_id,
            "action_not_allowed_now",
            "No se ha demostrado nada todavía (primero hay que aceptar una oferta o pedir una)",
        )
        return state

    with open_db() as conn:
        repeats_in_measure = count_agent_actions(conn, session_id, demo["measure"]).get(
            "repeat_demo", 0
        )
        repeats_in_session = count_agent_action_total(conn, session_id, "repeat_demo")
    if not demo_repeat_allowed(repeats_in_measure, repeats_in_session):
        await _send_offer_error(
            session_id,
            "action_not_allowed_now",
            "Se ha alcanzado el tope de repeticiones («otra vez»): como máximo una "
            "por compás y unas pocas por sesión",
        )
        return state

    decision = _consented_demo_decision(demo["params_json"], reason="offer_repeat")
    return await _execute_strike_decision(
        session_id, decision, state, record_action="repeat_demo"
    )


def _pending_offer(session_id: str) -> sqlite3.Row | None:
    """La oferta de demostración sin responder, con su fila (B-032.7)."""
    with open_db() as conn:
        return last_pending_offer(conn, session_id)


def _last_demo_decision(session_id: str) -> dict[str, object] | None:
    """La última demostración ya ejecutada, con su compás y params (B-032.7)."""
    with open_db() as conn:
        row = conn.execute(
            "SELECT measure, params_json FROM agent_decisions"
            " WHERE session_id = ? AND action = 'demonstrate' ORDER BY id DESC LIMIT 1",
            (session_id,),
        ).fetchone()
    if row is None:
        return None
    return {"measure": row["measure"], "params_json": row["params_json"]}


def _offer_measure(row: sqlite3.Row) -> int | None:
    measure = row["measure"]
    return int(measure) if isinstance(measure, int) else None


def _consented_demo_decision(params_json: str, *, reason: str) -> AgentDecision:
    """La decisión demostrar con los parámetros guardados del backend (B-032.7).

    El servidor no recalcula la ventana ni el tempo: una oferta aceptada y
    una repetición ejecutan exactamente lo que se guarda al ofertar.
    """
    try:
        params = json.loads(params_json or "{}")
    except (TypeError, ValueError):
        params = {}
    return AgentDecision(
        action="demonstrate",
        params=params,
        reason=reason,
        state="demonstrating",
    )


async def _send_offer_error(session_id: str, code: str, message: str) -> None:
    """Avisa a todas las conexiones de una respuesta que no cabe, sin cerrar nada."""
    for websocket in list(_session_sockets.get(session_id, ())):
        try:
            await websocket.send_json({"type": "error", "code": code, "message": message})
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


# ---------------------------- Identidad (U-005) -----------------------------


def _id_token_from_header(authorization: str | None) -> str:
    """Extrae el id_token de un header `Authorization: Bearer <token>` (U-005)."""
    if not authorization or not authorization.strip():
        raise HTTPException(
            status_code=401,
            detail={"code": "auth_missing_header", "message": "Falta el token de identidad"},
        )
    parts = authorization.strip().split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise HTTPException(
            status_code=401,
            detail={"code": "auth_invalid_header", "message": "El header Authorization debe ser 'Bearer <token>'"},
        )
    return parts[1].strip()


def _auth_user_from_row(row) -> AuthUser:
    """Construye el AuthUser de la respuesta desde la fila de `users` (U-005)."""
    return AuthUser(
        id=str(row["google_sub"]),
        email=row["email"],
        name=row["name"],
        picture=row["picture"],
        bubble_color=row["bubble_color"],
    )


def _current_user(authorization: str | None):
    """Valida el token del header y devuelve el usuario persistido (U-005).

    Acepta los dos tokens que el front puede traer: el JWT propio emitido
    en el login con contraseña (HS256 con AUTH_SECRET) o el id_token de
    Google (RS256 con sus JWKS). Ambos terminan en la fila de `users`.
    """
    token = _id_token_from_header(authorization)

    claims = verify_pm_token(token)
    if claims is None:
        try:
            claims = verify_google_id_token(token)
        except AuthTokenError as exc:
            raise HTTPException(
                status_code=401,
                detail={"code": str(exc.code), "message": str(exc)},
            ) from exc

        sub = claims.get("sub")
        if not sub:
            raise HTTPException(
                status_code=401,
                detail={"code": "auth_invalid_token", "message": "El id_token no trae sub"},
            )

        with open_db() as conn:
            row = upsert_user(
                conn,
                {
                    "google_sub": str(sub),
                    "email": claims.get("email"),
                    "name": claims.get("name"),
                    "picture": claims.get("picture"),
                },
            )
        return _auth_user_from_row(row)

    sub = str(claims.get("sub") or "")
    if not sub:
        raise HTTPException(
            status_code=401,
            detail={"code": "auth_invalid_token", "message": "El token no trae sub"},
        )
    with open_db() as conn:
        row = find_user_by_google_sub(conn, sub)
    if row is None:
        raise HTTPException(
            status_code=401,
            detail={"code": "auth_invalid_token", "message": "El usuario del token ya no existe"},
        )
    return _auth_user_from_row(row)


@router.post("/auth/session", response_model=AuthSessionResponse)
def auth_session(authorization: str | None = Header(default=None)) -> AuthSessionResponse:
    """Registra (o re-registra idempotente) al usuario de un token (U-005).

    La llama el frontend tras el login: valida el token, guarda o refresca la
    fila en `users` y la devuelve con su `bubble_color`. Sin token válido es
    401: este endpoint no tiene variante anónima.
    """
    return AuthSessionResponse(user=_current_user(authorization))


INVALID_CREDENTIALS = {
    "code": "auth_invalid_credentials",
    "message": "No existe esta combinación de usuario y contraseña.",
}


@router.post("/auth/login", response_model=AuthLoginResponse)
def auth_login(payload: AuthLoginRequest) -> AuthLoginResponse:
    """Login simple con cuenta y contraseña (U-005).

    Comprueba el correo y la contraseña del usuario (correo desconocido,
    contraseña errónea o cuenta sin contraseña asignada responden lo mismo,
    como se conoce de siempre). El usuario que solo entra con Google y
    todavía no tiene contraseña no puede entrar por aquí hasta que se la den.

    Con AUTOLOGIN activo (nunca en producción), credenciales vacías y
    `autologin=True` entran directamente en la cuenta `ADMIN_EMAIL`.
    """
    email = payload.email.strip().lower()
    password = payload.password

    # Autologin: credenciales vacías y AUTOLOGIN activo fuera de producción
    # inician sesión directamente con la cuenta ADMIN_EMAIL (cuenta admin).
    use_autologin = (
        payload.autologin
        and settings.autologin
        and settings.environment != "production"
        and not email
        and not password
    )
    if use_autologin:
        email = settings.admin_email.strip().lower()
        if not email:
            raise HTTPException(
                status_code=401,
                detail={**INVALID_CREDENTIALS, "message": "Falta ADMIN_EMAIL para el autologin"},
            )
    elif not email or not password:
        raise HTTPException(status_code=401, detail=INVALID_CREDENTIALS)

    with open_db() as conn:
        row = find_user_by_email(conn, email)

    if row is None or (
        not use_autologin and not verify_user_password(password, row["password_hash"])
    ):
        raise HTTPException(status_code=401, detail=INVALID_CREDENTIALS)

    # Registro pendiente de verificar (U-006): solo se revela con la
    # contraseña correcta, como un correo en el buzón que aun no se abrió.
    if not row["email_verified"]:
        raise HTTPException(
            status_code=401,
            detail={
                "code": "auth_email_unverified",
                "message": "Verifica tu correo antes de entrar: te enviamos el enlace al registrarte.",
            },
        )

    try:
        access_token = create_pm_token(str(row["google_sub"]))
    except AuthTokenError as exc:
        raise HTTPException(
            status_code=503,
            detail={"code": str(exc.code), "message": str(exc)},
        ) from exc

    return AuthLoginResponse(user=_auth_user_from_row(row), access_token=access_token)


EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
MIN_PASSWORD_LEN = 8
EMAIL_EXISTS = {
    "code": "auth_email_exists",
    "message": "Este correo ya está registrado. Prueba a iniciar sesión.",
}


def _verification_link(token: str) -> str:
    """Enlace absoluto del email de comprobación (U-006).

    Apunta al backend (donde vive /auth/verify); la página HTML que responde
    usa APP_PUBLIC_URL para sus enlaces hacia la app. En producción son dos
    dominios (API_PUBLIC_URL y APP_PUBLIC_URL); sin API definida se asume el
    front, que es como vive el desarrollo local.
    """
    base = (settings.api_public_url or settings.app_public_url).rstrip("/")
    return f"{base}/api/v1/auth/verify?token={token}"


def _registration_fields(
    password: str, level: str, display_name: str | None, genres: list[str] | None, accepted: bool | None
) -> dict[str, object]:
    """Campos compartidos entre alta y reenvío del registro (U-006)."""
    now_iso = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {
        "name": display_name,
        "password_hash": hash_password(password),
        "level": level,
        "genres": genres or [],
        "terms_version": "PRE-P001" if accepted else None,
        "terms_accepted_at": now_iso if accepted else None,
        "verification_token": secrets.token_urlsafe(32),
        "verification_expires_at": (
            datetime.now(UTC) + timedelta(hours=settings.verification_token_ttl_h)
        ).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


@router.post("/auth/register", response_model=AuthRegisterResponse)
def auth_register(payload: AuthRegisterRequest) -> AuthRegisterResponse:
    """Registro abierto por pasos (U-006): crea la cuenta inactiva y manda el email.

    La cuenta nace sin verificar con `email_verified = 0`; quien repita el
    registro con el mismo correo de una cuenta pendiente (enlace perdido o
    caducado) reemite el token con los datos nuevos. Mientras no haya
    proveedor, el enlace queda en el log (`mailer.py`, único punto a cambiar).
    """
    email = payload.email.strip().lower()
    password = payload.password or ""

    if not EMAIL_RE.match(email):
        raise HTTPException(
            status_code=422,
            detail={"code": "auth_invalid_email", "message": "Escribe un correo válido."},
        )
    if len(password) < MIN_PASSWORD_LEN:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "auth_weak_password",
                "message": f"Usa al menos {MIN_PASSWORD_LEN} caracteres en la contraseña.",
            },
        )
    if payload.level not in AUTH_LEVELS:
        raise HTTPException(
            status_code=422,
            detail={"code": "auth_invalid_level", "message": "Elige el nivel que mejor te describe."},
        )

    genres = payload.genres
    if genres is not None:
        unknown = [g for g in genres if g not in GENRES_UI]
        if unknown:
            raise HTTPException(
                status_code=422,
                detail={"code": "auth_invalid_genre", "message": "Género no reconocido."},
            )

    display_name = (payload.display_name or "").strip() or None

    with open_db() as conn:
        existing = find_user_by_email(conn, email)
        token: str
        if existing is not None:
            # Cuenta ya activada: correo reservado; si sigue pendiente, reenvío.
            if existing["email_verified"]:
                raise HTTPException(status_code=409, detail=EMAIL_EXISTS)
            fields = _registration_fields(
                password, payload.level, display_name, genres, payload.accepted_terms
            )
            update_pending_registration(conn, str(existing["google_sub"]), fields)
            token = str(fields["verification_token"])
        else:
            fields = _registration_fields(
                password, payload.level, display_name, genres, payload.accepted_terms
            )
            try:
                create_pending_registration(conn, {**fields, "email": email})
            except ValueError as exc:
                # Carrera improbable (dos registros a la vez): trátalo como duplicado.
                raise HTTPException(status_code=409, detail=EMAIL_EXISTS) from exc
            token = str(fields["verification_token"])

    send_verification_email(email, _verification_link(token))

    return AuthRegisterResponse(status="verification_sent", email=email)


def _html_page(title: str, body: str, extra_style: str = "") -> str:
    """Página mínima de confirmación para el enlace del email (U-006)."""
    base = settings.app_public_url.rstrip("/")
    return (
        "<!doctype html><html lang='es'><head><meta charset='utf-8'>"
        "<title>PianoMentor AI</title>"
        "<style>body{background:#0e1522;color:#e8edf7;font-family:system-ui,sans-serif;"
        "display:grid;place-items:center;height:92vh;margin:0;text-align:center}"
        "main{max-width:26rem;padding:2rem}h1{color:#f5a524;font-size:1.5rem}"
        f"a{{color:#6ea8ff}}{extra_style}</style></head><body><main>"
        f"<h1>{title}</h1><p>{body}</p>"
        f"<p><a href='{base}/registro'>Volver al registro</a> · <a href='{base}'>Ir a la app</a></p>"
        "</main></body></html>"
    )


@router.get("/auth/verify")
def auth_verify(token: str = Query(min_length=1)) -> HTMLResponse:
    """Consume el enlace del email de comprobación y activa la cuenta (U-006).

    Devuelve una página HTML mínima: es lo que ve el usuario al abrir el
    correo. Caducado, sugiere reenviar (repetir el registro); el token nunca
    se reutiliza tras la activación.
    """
    with open_db() as conn:
        row = find_user_by_verification_token(conn, token)

    if row is None:
        return HTMLResponse(
            _html_page(
                "Enlace no válido",
                "Este enlace ya no existe: ciérralo y vuelve a registrarte o contacta con soporte.",
            ),
            status_code=404,
        )

    expires = row["verification_expires_at"]
    if expires:
        try:
            expired = datetime.fromisoformat(expires) < datetime.now(UTC)
        except ValueError:
            expired = True
        if expired:
            return HTMLResponse(
                _html_page(
                    "Enlace caducado",
                    "Los enlaces caducan a las 24 horas; vuelve a rellenar el formulario de registro"
                    " con el mismo correo y te mandamos uno nuevo.",
                ),
                status_code=410,
            )

    with open_db() as conn:
        mark_email_verified(conn, str(row["google_sub"]))

    return HTMLResponse(
        _html_page(
            "Cuenta activada",
            f"Ya puedes iniciar sesión con <b>{row['email']}</b> y tu contraseña.",
        )
    )


# ---------------------------- Recuperación de contraseña (U-007) -----------------------------

RESET_TOKEN_TTL_MIN = 30
RATE_LIMIT_WINDOW_MIN = 60
RATE_LIMIT_MAX_REQUESTS = 5


def _rate_limited(
    conn: sqlite3.Connection, *, email: str, ip: str | None
) -> bool:
    """Comprueba si se supera el límite de solicitudes por email/IP (ventana simple)."""
    since = (datetime.now(UTC) - timedelta(minutes=RATE_LIMIT_WINDOW_MIN)).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )
    email_count = conn.execute(
        "SELECT COUNT(*) FROM auth_tokens "
        "WHERE user_sub = (SELECT google_sub FROM users WHERE lower(email) = lower(?)) "
        "AND purpose = 'reset' AND created_at > ?",
        (email, since),
    ).fetchone()[0]
    if email_count >= RATE_LIMIT_MAX_REQUESTS:
        return True
    if ip:
        ip_count = conn.execute(
            "SELECT COUNT(*) FROM auth_tokens "
            "WHERE user_sub = ? AND purpose = 'reset' AND created_at > ?",
            (f"ip:{ip}", since),
        ).fetchone()[0]
        if ip_count >= RATE_LIMIT_MAX_REQUESTS:
            return True
    return False


def _reset_link(token: str) -> str:
    """Enlace absoluto del email de restablecimiento (U-007). Apunta al front."""
    base = settings.app_public_url.rstrip("/")
    return f"{base}/recuperar/{token}"


@router.post("/auth/forgot-password", response_model=AuthForgotPasswordResponse)
async def auth_forgot_password(
    payload: AuthForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    x_forwarded_for: str | None = Header(default=None),
) -> AuthForgotPasswordResponse:
    """Solicita enlace de restablecimiento (U-007).

    Respuesta **idéntica** exista o no la cuenta (no enumeración). El envío
    del email se lanza en segundo plano (BackgroundTasks) para tiempo de
    respuesta uniforme. Cuenta pendiente de verificación → reenvía enlace
    de verificación (U-006). Cuenta solo Google → email sugiere entrar con Google.
    """
    email = payload.email.strip().lower()
    if not EMAIL_RE.match(email):
        # Respuesta neutra igual que si existiera
        return AuthForgotPasswordResponse()

    with open_db() as conn:
        # Rate limiting básico por email/IP
        if _rate_limited(conn, email=email, ip=x_forwarded_for):
            raise HTTPException(
                status_code=429,
                detail={"code": "auth_rate_limited", "message": "Demasiadas solicitudes. Espera unos minutos."},
            )

        row = find_user_by_email(conn, email)

        # Caso 1: cuenta no existe → respuesta neutra, sin email
        if row is None:
            return AuthForgotPasswordResponse()

        # Caso 2: cuenta pendiente de verificación (email_verified = 0)
        # → reenvía enlace de verificación (U-006), no de reset
        if not row["email_verified"]:
            token = secrets.token_urlsafe(32)
            expires_at = (
                datetime.now(UTC) + timedelta(hours=settings.verification_token_ttl_h)
            ).strftime("%Y-%m-%dT%H:%M:%SZ")
            create_auth_token(
                conn, purpose="verify", user_sub=str(row["google_sub"]), token=token, expires_at=expires_at
            )
            verification_link = _verification_link(token)
            background_tasks.add_task(send_verification_email, email, verification_link)
            return AuthForgotPasswordResponse()

        # Caso 3: cuenta con contraseña → genera token de reset
        if row["password_hash"]:
            token = secrets.token_urlsafe(32)
            expires_at = (
                datetime.now(UTC) + timedelta(minutes=RESET_TOKEN_TTL_MIN)
            ).strftime("%Y-%m-%dT%H:%M:%SZ")
            create_auth_token(
                conn, purpose="reset", user_sub=str(row["google_sub"]), token=token, expires_at=expires_at
            )
            reset_link = _reset_link(token)
            background_tasks.add_task(send_password_reset_email, email, reset_link)
            return AuthForgotPasswordResponse()

        # Caso 4: cuenta solo Google (sin password_hash) → email sugiere Google
        # Mismo mensaje neutro; el email indica que use Google
        reset_link = _reset_link("google-only")
        background_tasks.add_task(send_password_reset_email, email, reset_link)
        return AuthForgotPasswordResponse()


@router.post("/auth/reset-password", response_model=AuthResetPasswordResponse)
def auth_reset_password(payload: AuthResetPasswordRequest) -> AuthResetPasswordResponse:
    """Consume el token y establece la nueva contraseña (U-007).

    Valida: token existe, no usado, no caducado. Aplica la misma política
    de contraseña que el registro (MIN_PASSWORD_LEN). Guarda hash PBKDF2,
    marca token como usado, actualiza password_changed_at (invalida JWTs
    previos) y manda email de aviso. No abre sesión automática.
    """
    token = payload.token.strip()
    password = payload.password

    if not token:
        raise HTTPException(
            status_code=400,
            detail={"code": "auth_invalid_token", "message": "Token requerido."},
        )

    # Misma política que registro
    if len(password) < MIN_PASSWORD_LEN:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "auth_weak_password",
                "message": f"Usa al menos {MIN_PASSWORD_LEN} caracteres en la contraseña.",
            },
        )

    with open_db() as conn:
        row = find_user_by_auth_token(conn, purpose="reset", token=token)

        # Token inválido, usado o caducado → mismo error neutro
        if row is None:
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "auth_invalid_token",
                    "message": "Este enlace ya no es válido. Pide uno nuevo para continuar.",
                },
            )

        # Actualiza contraseña
        password_hash = hash_password(password)
        conn.execute(
            "UPDATE users SET password_hash = ?, password_changed_at = datetime('now'), "
            "updated_at = datetime('now') WHERE google_sub = ?",
            (password_hash, str(row["google_sub"])),
        )
        # Marca token como usado
        consume_auth_token(conn, purpose="reset", token=token)
        conn.commit()

    # Email de aviso (no bloqueante)
    send_password_changed_notification(row["email"])

    return AuthResetPasswordResponse()


@router.get("/pieces", response_model=list[PieceSummary])
def list_pieces(source: str | None = Query(default=None), authorization: str | None = Header(default=None)) -> list[PieceSummary]:
    """Lista las piezas disponibles para el selector (B-027.3).

    Sin filtro incluye el corpus y las subidas (corpus primero); `source=corpus`
    limita al catálogo, que es lo que pide la Library.

    Antes de listar se siembra el corpus si la base está vacía (B-027.4), para
    que un arranque limpio no sirva la Library vacía.
    """
    ensure_catalog_loaded()
    # U-005: anónimo si no hay header; con header presente e inválido, 401
    # (igual que POST /pieces). Así el frontend puede detectar una sesión
    # caducada en lugar de recibir silenciosamente el listado anónimo.
    if authorization and authorization.strip():
        user = _current_user(authorization)
        user_sub = getattr(user, "id", None)
        if user_sub is None and isinstance(user, dict):
            user_sub = user.get("id")
    else:
        user_sub = None
    rows = find_pieces(source, owner_id=user_sub, include_anonymous=(user_sub is None))
    if user_sub is None:
        rows = [
            r
            for r in rows
            if r["source"] == "upload" or (r["difficulty"] == "principiante" and r["id"] != "p16")
        ]
    else:
        with open_db() as conn:
            allowed = {
                str(r[0])
                for r in conn.execute(
                    "SELECT piece_id FROM user_piece_library WHERE user_sub = ?",
                    (user_sub,),
                )
            }
        rows = [
            r
            for r in rows
            if r["source"] == "upload"
            or (r["difficulty"] == "principiante" and r["id"] != "p16")
            or r["id"] in allowed
        ]
    return [_piece_summary_from_row(row) for row in rows]


@router.post("/pieces", response_model=PieceResponse)
async def upload_piece(
    file: UploadFile = File(...), authorization: str | None = Header(default=None)
) -> PieceResponse:
    """Sube un MIDI y lo persiste con sus metadatos (B-002.4/B-005.4).

    La interfaz ya no lo usa —subir a mano pasa por /pieces/preview, que no
    guarda nada—, pero se mantiene a propósito: la subida persistente puede
    volver a necesitarse.

    Desde U-005, si el header `Authorization` trae un id_token de Google
    válido, `owner_id` queda asociado al usuario; sin token sigue siendo
    `NULL` (anónimo), que es lo que B-029 decidirá qué hacer.
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

    # U-005: anónimo si no hay header; con header presente e inválido, 401.
    # Se resuelve antes de guardar para poder asociar el propietario al storage.
    if authorization and authorization.strip():
        owner = _current_user(authorization)
        owner_id: str | None = owner.id
    else:
        owner_id = None

    # B-005.4: leer metadatos musicales reales. Si el MIDI no es legible, se
    # devuelve un 400 con código estable y se elimina el archivo recién guardado
    # para no dejar huérfanos en el filesystem.
    piece_id = storage.save(original_name, content, owner_id=owner_id)
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
                "owner_id": owner_id,
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


@router.get("/sessions/{session_id}/practice-report", response_model=PracticeReportResponse)
def get_session_practice_report(
    session_id: str,
    limit: int | None = Query(default=None, ge=1),
) -> PracticeReportResponse:
    """Informe consolidado de la sesión (B-033.3).

    Junta lo persistido por B-032.6 (señales del modo espera e intervenciones
    del agente) con la versión compacta de la evaluación (B-032.3) — la misma
    que consume el agente. `limit` trunca `signals.items` (default acotado;
    el agregado por compás y las decisiones nunca se truncan) y la respuesta
    es determinista: el mismo id devuelve siempre el mismo orden.
    """
    session_state = _session_state_or_404(session_id)
    try:
        # La evaluación se resuelve ANTES del informe: el `summary` de
        # B-033.4 la cita en su nacimiento (no se parchea después).
        report = session_report(
            session_id,
            normalize_limit(limit),
            evaluation=_evaluation_or_none(session_id, session_state),
        )
    except ValidationError as exc:
        raise HTTPException(
            status_code=404 if exc.code in NOT_FOUND_CODES else 400,
            detail={"code": exc.code, "message": exc.message},
        ) from exc
    return PracticeReportResponse(**report)


@router.patch("/sessions/{session_id}", response_model=SessionStateResponse)
async def update_session_practice(
    session_id: str, payload: SessionPracticeModeRequest
) -> SessionStateResponse:
    """Cambia el modo de práctica de la sesión (B-032.4).

    Es estado, no un evento: no entra en `session_events` ni viaja por
    `agent_action`. Un modo o una mano que no existen se rechazan con 400 y
    código estable (`invalid_mode`, `invalid_hand`); el estado nuevo se
    difunde por el WebSocket para que todos los clientes lo vean.
    """
    try:
        state = practice_service.set_practice_mode(
            session_id, mode=payload.mode, hand=payload.hand
        )
    except ValidationError as exc:
        raise HTTPException(
            status_code=404 if exc.code in NOT_FOUND_CODES else 400,
            detail={"code": exc.code, "message": exc.message},
        ) from exc
    await _broadcast_state(session_id, state)
    return SessionStateResponse(**state)


@router.post("/sessions/{session_id}/actions", response_model=ActionResponse)
async def execute_action(session_id: str, payload: ActionRequest) -> ActionResponse:
    """Valida y ejecuta una acción del agente en la sesión (B-012.4–B-012.7).

    Rechaza con 400 y código estable si la acción o sus params son inválidos.
    `demonstrate` y `return_control` cambian quién tiene el control del piano;
    `accompany` (B-012.7) no lo cambia —el estudiante sigue tocando— y difunde
    por WebSocket la mano de la IA y sus notas con tiempos relativos al inicio
    de la sección, que es lo que el navegador necesita para sonarla.
    """
    session_state = _session_state_or_404(session_id)
    # La mano por defecto se fija antes de validar: el agente puede proponer
    # `accompany` sin `hand` y la acción tiene que seguir siendo ejecutable.
    params = _with_accompany_defaults(payload.action, payload.params)
    try:
        agent_service.validate_action(payload.action, params, session_state=session_state)
    except ValidationError as exc:
        raise HTTPException(
            status_code=400, detail={"code": exc.code, "message": exc.message}
        ) from exc

    if payload.action in ("demonstrate", "return_control"):
        new_control = "agent" if payload.action == "demonstrate" else "student"
        practice_service.set_control(session_id, new_control)
        _record_agent_decision(
            session_id,
            payload.action,
            params,
            measure=_measure_from_params(params, session_state),
        )
        await _broadcast_agent_action(session_id, payload.action, **params)
    elif payload.action == "accompany":
        try:
            plan = accompaniment_service.plan(
                session_id,
                hand=str(params.get("hand", "left")),
                from_measure=_optional_measure(params.get("from_measure")),
                to_measure=_optional_measure(params.get("to_measure")),
                tempo_factor=float(params.get("tempo_factor", 1.0)),
            )
        except ValidationError as exc:
            raise HTTPException(
                status_code=404 if exc.code in NOT_FOUND_CODES else 400,
                detail={"code": exc.code, "message": exc.message},
            ) from exc
        params = plan.as_payload()
        _record_agent_decision(
            session_id,
            payload.action,
            params,
            measure=_measure_from_params(params, session_state),
        )
        await _broadcast_agent_action(session_id, "accompany", **params)
    else:
        # `wait`, `give_hint` y `slow_down` no cambian el control ni el sonido
        # del servidor: registrarlos y notificarlos es todo lo que toca hacer.
        _record_agent_decision(
            session_id,
            payload.action,
            params,
            measure=_measure_from_params(params, session_state),
        )
        await _broadcast_agent_action(session_id, payload.action, **params)

    return ActionResponse(action=payload.action, status="validated")


def _measure_from_params(
    params: Mapping[str, object],
    session_state: Mapping[str, object],
) -> int | None:
    """Compás de la decisión: la sección pedida o el compás vivo de la sesión."""
    measure = params.get("from_measure")
    if isinstance(measure, int):
        return measure
    live = session_state.get("current_measure")
    return int(live) if isinstance(live, int) else None


def _with_accompany_defaults(
    action: str, params: dict[str, object]
) -> dict[str, object]:
    """Añade la mano por defecto del acompañamiento si la acción no la trae."""
    if action != "accompany" or "hand" in params:
        return params
    return {**params, "hand": "left"}


def _optional_measure(value: object) -> int | None:
    """Compás opcional de una acción: `None` deja que la sección sea la de defecto."""
    if value is None:
        return None
    return int(value)  # `validate_action` ya comprobó que es convertible


def _evaluation_or_none(session_id: str, session_state: dict[str, object]) -> dict[str, object] | None:
    """Evaluación actual de la sesión para el contexto del agente (B-012.6).

    `None` si la sesión todavía no ha recibido eventos (`idle`): una partitura
    sin una sola nota no es "precisión 0 %", es ausencia de interpretación, y
    el agente no debe pedir demostrar nada antes de que el estudiante toque.
    """
    if session_state.get("status") == "idle":
        return None
    try:
        full = evaluation_service.evaluate(session_id)
    except ValidationError:
        return None
    # Versión compacta para el agente: se eliminan los arrays `notes`/`extras`
    # (muy pesados en tokens y redundantes con los agregados) y se conservan
    # los insights (drift_direction, error_type, worst_units, received_ratio)
    # para que el LLM concluya mejor con menos consumo.
    compact = {key: value for key, value in full.items() if key not in ("notes", "extras")}
    return compact


@router.post("/sessions/{session_id}/agent-step", response_model=ActionResponse)
def agent_step(session_id: str) -> ActionResponse:
    """Propone la siguiente acción de la sesión (B-012.6).

    El proveedor viene de `settings.llm_provider` (con Mock al final de la
    cadena, B-012.8) y el contexto lleva la evaluación de lo que el estudiante
    ha tocado. Si el LLM falla o la propuesta no pasa la whitelist y los
    límites, se cae a las reglas deterministas (B-012.3): el paso nunca se rompe.
    """
    session_state = _session_state_or_404(session_id)
    context = DecisionContext(
        session_state=session_state,
        evaluation=_evaluation_or_none(session_id, session_state),
        strikes=practice_service.build_strike_context(
            session_id,
            int(session_state["current_measure"])
            if isinstance(session_state.get("current_measure"), int)
            else None,
        ),
    )
    proposal = agent_service.propose_action(context, provider=get_fallback_provider())
    return ActionResponse(
        action=proposal.action,
        status="validated",
        provider=proposal.provider,
        reason=proposal.reason,
        used_fallback=proposal.used_fallback,
    )


@router.post("/sessions/{session_id}/evaluation", response_model=EvaluationResponse)
def evaluate_session(
    session_id: str,
    from_s: float | None = Query(default=None),
    to_s: float | None = Query(default=None),
    from_measure: int | None = Query(default=None, ge=0),
    to_measure: int | None = Query(default=None, ge=0),
    tolerance_ms: int | None = Query(default=None),
    hand: str | None = Query(default=None),
) -> EvaluationResponse:
    """Evalúa la interpretación registrada contra la partitura (B-012.2).

    La ventana es opcional y puede pedirse por segundos (`from_s`/`to_s`) o por
    compases (`from_measure`/`to_measure`), nunca las dos a la vez; la
    tolerancia por nota (±100 ms por defecto) es configurable para practicar
    con más o menos margen.
    """
    try:
        result = evaluation_service.evaluate(
            session_id,
            from_s=from_s,
            to_s=to_s,
            from_measure=from_measure,
            to_measure=to_measure,
            tolerance_ms=DEFAULT_TOLERANCE_MS if tolerance_ms is None else tolerance_ms,
            hand=hand,
        )
    except ValidationError as exc:
        raise HTTPException(
            status_code=404 if exc.code in NOT_FOUND_CODES else 400,
            detail={"code": exc.code, "message": exc.message},
        ) from exc
    return EvaluationResponse(**result)


@router.post("/agent/chat", response_model=ChatMessageResponse)
def agent_chat(
    payload: ChatMessageRequest,
    authorization: str | None = Header(default=None),
) -> ChatMessageResponse:
    """Turno de chat del agente: función calling sobre lo ya implementado (B-012.8, U-008.3).

    El backend propone una función de la lista blanca, la valida y, si es de
    servidor, la ejecuta; si es de navegador, devuelve la intención para que el
    front la ejecute. Nunca toca MIDI ni el reloj de reproducción.
    """
    try:
        service = ChatService(get_fallback_provider())
        user_name = None
        try:
            user = _current_user(authorization)
            user_name = getattr(user, "name", None) or (
                user.get("name") if isinstance(user, dict) else None
            )
        except Exception:
            user_name = None
        result = service.run(
            payload.message,
            chat_id=payload.chat_id,
            context=payload.context,
            user_name=user_name,
            ephemeral=payload.ephemeral,
            max_tokens=payload.max_tokens,
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

    Los mensajes van envueltos en `type` porque el mismo canal lleva las
    acciones del agente (`agent_action`: `demonstrate`, `accompany`,
    `return_control` y, desde B-032.7, la oferta `offer_demo` y su respuesta
    `offer_dismiss`) y el `pong` que mide la latencia del canal (B-012.7).
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
        # B-032.7: si una oferta de demostración quedó sin responder (p. ej.
        # tras un F5), se reenvía para que la tarjeta vuelva a la burbuja.
        pending = _pending_offer(session_id)
        if pending is not None and state.get("control") == "student":
            try:
                params = json.loads(pending["params_json"] or "{}")
            except (TypeError, ValueError):
                params = {}
            await websocket.send_json(
                {
                    "type": "agent_action",
                    "action": "offer_demo",
                    "reason": "gate_timeout_silence",
                    **params,
                }
            )
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

            # `ping`/`pong` mide la latencia del canal sin tocar la sesión: el
            # front lo usa para degradar el acompañamiento a demostración si el
            # WebSocket no es lo bastante rápido (B-012.7).
            if isinstance(event, Mapping) and event.get("type") == "ping":
                await websocket.send_json({"type": "pong", "t_s": event.get("t_s")})
                continue

            # Posición del transporte (B-032.2): se guarda siempre, pero el
            # `state` solo se difunde cuando cambia el compás o cada 500 ms.
            if isinstance(event, Mapping) and event.get("type") == "position":
                try:
                    state = practice_service.receive_position(session_id, event)
                except ValidationError as exc:
                    await websocket.send_json(
                        {"type": "error", "code": exc.code, "message": exc.message}
                    )
                    continue

                measure = state.get("current_measure")
                measure_index = measure if isinstance(measure, int) else None
                now_s = time.monotonic()
                if position_push_due(
                    _last_position_push.get(session_id), measure_index, now_s
                ):
                    _last_position_push[session_id] = (now_s, measure_index)
                    await _broadcast_state(session_id, state)
                continue

            # Respuesta del alumno a la oferta de demostración (B-032.7):
            # «Sí, muéstralo», «Sigo yo» y «otra vez». Los mensajes llegan sin
            # parámetros; el backend ejecuta con los suyos ya guardados y solo
            # mueve el motor si el alumno lo pidió.
            if isinstance(event, Mapping) and event.get("type") in (
                "offer_accept",
                "offer_dismiss",
                "offer_repeat",
            ):
                state = await _handle_offer_event(session_id, event, state)
                await _broadcast_state(session_id, state)
                continue

            # Evento de práctica del modo espera (B-032.5): se valida y se
            # guarda. Después las reglas de strikes (B-032.6) deciden en vivo:
            # bajar el tempo, dar una pista o ofrecer la demostración.
            if isinstance(event, Mapping) and event.get("type") == "practice":
                try:
                    state = practice_service.receive_practice_event(session_id, event)
                except ValidationError as exc:
                    await websocket.send_json(
                        {"type": "error", "code": exc.code, "message": exc.message}
                    )
                    continue

                strikes_context = practice_service.build_strike_context(
                    session_id, _event_measure(event)
                )
                decision = agent_service.decide(
                    DecisionContext(session_state=state, strikes=strikes_context)
                )
                if decision is not None and decision.action in STRIKE_ACTIONS:
                    new_state = await _execute_strike_decision(session_id, decision, state)
                    await _broadcast_state(session_id, new_state)
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
