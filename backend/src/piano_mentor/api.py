# description: Rutas HTTP y WebSocket del MVP (/pieces, /sessions, /actions, /agent-step, /ws, /auth/*). Debe mantenerse delgado. POST /sessions/{id}/actions valida y ejecuta la acción del agente (B-012.4–B-012.7): demonstrate/return_control cambian el control y accompany difunde la mano de la IA y sus notas; el WS responde ping con pong para medir la latencia.
# context: Traduce HTTP/WS a servicios; sin lógica musical compleja. La identidad (U-005) y el registro por pasos (U-006) también viven aquí. El acompañamiento no cambia el control (el estudiante sigue tocando) y sus notas viajan con tiempos relativos al inicio de la sección.

import logging
import re
import secrets
import sqlite3
import tempfile
from collections.abc import Mapping
from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi import (
    APIRouter,
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
from .agent import AgentService, DecisionContext
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
    create_pending_registration,
    find_existing_piece,
    find_piece_by_id,
    find_pieces,
    find_user_by_email,
    find_user_by_google_sub,
    find_user_by_verification_token,
    mark_email_verified,
    open_db,
    save_piece,
    update_pending_registration,
    upsert_user,
)
from .evaluation import DEFAULT_TOLERANCE_MS, EvaluationService
from .mailer import send_verification_email
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
from .schemas import (
    AUTH_LEVELS,
    GENRES_UI,
    ActionRequest,
    ActionResponse,
    AuthLoginRequest,
    AuthLoginResponse,
    AuthRegisterRequest,
    AuthRegisterResponse,
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
evaluation_service = EvaluationService()
accompaniment_service = AccompanimentService()
midi_service = MidiService()
storage = LocalPieceStorage(Path(settings.midi_storage_path))

logger = logging.getLogger(__name__)

# Códigos de la evaluación que significan "no existe el recurso" (B-012.2).
NOT_FOUND_CODES = {"session_not_found", "piece_not_found", "piece_file_not_found"}

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


async def _broadcast_agent_action(session_id: str, action: str, **params: object) -> None:
    """Notifica una acción del agente a todas las conexiones de la sesión (B-012.5).

    El front escucha `agent_action` para mostrar el indicador de demostración,
    bloquear el teclado o devolver el control al estudiante.
    """
    for websocket in list(_session_sockets.get(session_id, ())):
        try:
            await websocket.send_json({"type": "agent_action", "action": action, **params})
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

    # U-005: anónimo si no hay header; con header presente e inválido, 401.
    if authorization and authorization.strip():
        owner = _current_user(authorization)
        owner_id: str | None = owner.id
    else:
        owner_id = None

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
        await _broadcast_agent_action(session_id, "accompany", **plan.as_payload())

    return ActionResponse(action=payload.action, status="validated")


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
        return evaluation_service.evaluate(session_id)
    except ValidationError:
        return None


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
        )
    except ValidationError as exc:
        raise HTTPException(
            status_code=404 if exc.code in NOT_FOUND_CODES else 400,
            detail={"code": exc.code, "message": exc.message},
        ) from exc
    return EvaluationResponse(**result)


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

    Los mensajes van envueltos en `type` porque el mismo canal lleva las
    acciones del agente (`agent_action`: `demonstrate`, `accompany` y
    `return_control`) y el `pong` que mide la latencia del canal (B-012.7).
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

            # `ping`/`pong` mide la latencia del canal sin tocar la sesión: el
            # front lo usa para degradar el acompañamiento a demostración si el
            # WebSocket no es lo bastante rápido (B-012.7).
            if isinstance(event, Mapping) and event.get("type") == "ping":
                await websocket.send_json({"type": "pong", "t_s": event.get("t_s")})
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
