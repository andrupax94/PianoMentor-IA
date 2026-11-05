# description: Conexión SQLite + sqlite-vec (DATABASE_URL) en modo WAL y con busy_timeout, migraciones SQL versionadas (0012 practice_signals, 0013 agent_decisions incluidas), open_db() como conexión con el esquema al día, metadatos de piezas (incluye tracks, duration_s, notes_count y tempo desde B-005.4) con búsqueda por content_hash y prioridad del corpus (find_piece_by_hash), y persistencia de sesiones y su log de eventos (insert_session, get_session, update_session_state, insert_session_event, list_session_events de B-012.1), señales de práctica (insert_practice_signal y las consultas de ventana de B-032.6), decisiones del agente (insert_agent_decision, count_agent_action_total y la oferta pendiente last_pending_offer de B-032.7) y las cuentas de usuario: find_user_by_email, upsert_user (U-005) y del registro por pasos (U-006) create_pending_registration, find_user_by_verification_token, mark_email_verified, regenerate_verification_token y update_pending_registration (reenvío).
# context: Persistencia de piezas (B-003.2/B-003.3), base de la deduplicación de subidas y de las sesiones de B-012. WAL deja leer mientras el WebSocket escribe y busy_timeout (3 s) evita fallos por lock; si el sistema de archivos no admite WAL, SQLite mantiene el modo anterior en vez de fallar.

"""Conexión reutilizable a SQLite con sqlite-vec y migraciones SQL versionadas."""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from pathlib import Path

import sqlite_vec

from .config import settings
from .passwords import random_bubble_color

MIGRATIONS_DIR = Path(__file__).parent / "migrations"
SQLITE_PREFIX = "sqlite:///"


def _database_path(database_url: str) -> str:
    """Traduce `DATABASE_URL` (`sqlite:///ruta`) a una ruta que entiende sqlite3."""
    if not database_url.startswith(SQLITE_PREFIX):
        raise ValueError(f"DATABASE_URL no soportada (se espera sqlite:///...): {database_url}")
    target = database_url[len(SQLITE_PREFIX) :]
    if not target:
        raise ValueError("DATABASE_URL sin ruta de base de datos")
    if target.endswith(":memory:"):
        return ":memory:"
    return target


def connect(database_url: str | None = None) -> sqlite3.Connection:
    """Abre una conexión SQLite con sqlite-vec cargado y filas como `sqlite3.Row`.

    Activa **WAL** para que lectores y escritor no se esperen entre sí (B-012.1:
    el WebSocket inserta eventos mientras se consulta el estado) y un
    `busy_timeout` corto como red de seguridad. Si el sistema de archivos no
    admite WAL (por ejemplo una unidad de red), SQLite devuelve el modo anterior
    en lugar de fallar, así que el PRAGMA no rompe el arranque.
    """
    path = _database_path(database_url or settings.database_url)
    if path != ":memory:":
        Path(path).expanduser().parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=3000")
    conn.enable_load_extension(True)
    try:
        sqlite_vec.load(conn)
    finally:
        conn.enable_load_extension(False)
    return conn


@contextmanager
def open_db(database_url: str | None = None) -> Iterator[sqlite3.Connection]:
    """Abre una conexión con el esquema al día y la cierra al salir del bloque."""
    conn = connect(database_url)
    try:
        init_db(conn)
        yield conn
    finally:
        conn.close()


def pending_migrations(conn: sqlite3.Connection) -> list[Path]:
    """Devuelve los scripts de migración aún no aplicados, en orden."""
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations ("
        " version TEXT PRIMARY KEY,"
        " applied_at TEXT NOT NULL DEFAULT (datetime('now'))"
        ")"
    )
    applied = {row["version"] for row in conn.execute("SELECT version FROM schema_migrations")}
    scripts = sorted(MIGRATIONS_DIR.glob("*.sql"))
    return [script for script in scripts if script.stem not in applied]


PIECE_COLUMNS = (
    "id",
    "filename",
    "stored_filename",
    "midi_path",
    "size_bytes",
    "extension",
    "title",
    "composer",
    "opus",
    "tracks",
    "duration_s",
    "notes_count",
    "tempo",
    "content_hash",
    "source",
    "owner_id",
    "license",
    "source_url",
    "difficulty",
    "cover",
)


def insert_piece(conn: sqlite3.Connection, record: Mapping[str, object]) -> None:
    """Inserta metadatos de una pieza; las columnas ausentes quedan NULL."""
    columns = [name for name in PIECE_COLUMNS if name in record]
    if "id" not in columns:
        raise ValueError("insert_piece requiere al menos el campo 'id'")
    placeholders = ", ".join("?" for _ in columns)
    conn.execute(
        f"INSERT INTO pieces ({', '.join(columns)}) VALUES ({placeholders})",
        [record[name] for name in columns],
    )
    conn.commit()


def upsert_piece(conn: sqlite3.Connection, record: Mapping[str, object]) -> None:
    """Inserta o actualiza metadatos por id (carga idempotente del catálogo, B-003.3)."""
    columns = [name for name in PIECE_COLUMNS if name in record]
    if "id" not in columns:
        raise ValueError("upsert_piece requiere al menos el campo 'id'")
    updated = [name for name in columns if name != "id"]
    assignments = ", ".join(f"{name} = excluded.{name}" for name in updated)
    placeholders = ", ".join("?" for _ in columns)
    conn.execute(
        f"INSERT INTO pieces ({', '.join(columns)}) VALUES ({placeholders}) "
        f"ON CONFLICT(id) DO UPDATE SET {assignments}",
        [record[name] for name in columns],
    )
    conn.commit()


def get_piece(conn: sqlite3.Connection, piece_id: str) -> sqlite3.Row | None:
    """Lee una pieza persistida por su id."""
    return conn.execute("SELECT * FROM pieces WHERE id = ?", (piece_id,)).fetchone()


def find_piece_by_hash(conn: sqlite3.Connection, content_hash: str) -> sqlite3.Row | None:
    """Busca una pieza por el SHA-256 de su contenido (deduplicación).

    Si varias filas compartieran hash, se prioriza la del corpus por encima de
    las subidas: el corpus es la referencia canónica de la pieza.
    """
    return conn.execute(
        "SELECT * FROM pieces WHERE content_hash = ?"
        " ORDER BY CASE WHEN source = 'corpus' THEN 0 ELSE 1 END, created_at"
        " LIMIT 1",
        (content_hash,),
    ).fetchone()


def save_piece(record: Mapping[str, object]) -> None:
    """Persiste metadatos en `DATABASE_URL` creando el esquema si hace falta (B-003.2)."""
    with open_db() as conn:
        insert_piece(conn, record)


def find_existing_piece(content_hash: str) -> sqlite3.Row | None:
    """Busca una pieza ya persistida por hash, gestionando su propia conexión.

    Es el paso previo a la deduplicación de subidas.
    """
    with open_db() as conn:
        return find_piece_by_hash(conn, content_hash)


def find_piece_by_id(piece_id: str) -> sqlite3.Row | None:
    """Lee una pieza por su id, gestionando su propia conexión (B-006.1)."""
    with open_db() as conn:
        return get_piece(conn, piece_id)


def _user_row(conn: sqlite3.Connection, google_sub: str) -> sqlite3.Row | None:
    return conn.execute("SELECT * FROM users WHERE google_sub = ?", (google_sub,)).fetchone()


def find_user_by_google_sub(
    conn: sqlite3.Connection, google_sub: str
) -> sqlite3.Row | None:
    """Lee un usuario por su identificador estable de Google (U-005)."""
    return _user_row(conn, google_sub)


def find_user_by_email(conn: sqlite3.Connection, email: str) -> sqlite3.Row | None:
    """Lee un usuario por su correo, sin distinguir mayúsculas (U-005)."""
    if not email or not email.strip():
        return None
    return conn.execute(
        "SELECT * FROM users WHERE lower(email) = lower(?)", (email.strip(),)
    ).fetchone()


def new_user_google(
    conn: sqlite3.Connection, google_sub: str, email: str | None, name: str | None, picture: str | None
) -> sqlite3.Row:
    """Inserta un usuario nuevo con color de burbuja aleatorio (U-005).

    `email_verified` nace a 1: Google ya entrega el correo verificado.
    """
    conn.execute(
        "INSERT INTO users (google_sub, email, name, picture, bubble_color, email_verified) "
        "VALUES (?, ?, ?, ?, ?, 1)",
        (google_sub, email, name, picture, random_bubble_color()),
    )
    conn.commit()
    return _user_row(conn, google_sub)  # type: ignore[return-value]


def _seed_user_piece_library(conn: sqlite3.Connection, user_sub: str, email: object) -> None:
    """Siembra piezas adicionales según la cuenta (U-008.2)."""
    if not email:
        return
    em = str(email).strip().lower()
    if em == "palenciadj94@gmail.com":
        conn.execute(
            "INSERT OR IGNORE INTO user_piece_library (user_sub, piece_id) "
            "SELECT ?, id FROM pieces WHERE id != 'p16'",
            (user_sub,),
        )
    elif em == "eduardoandresp94@gmail.com":
        conn.execute(
            "INSERT OR IGNORE INTO user_piece_library (user_sub, piece_id) VALUES (?, 'p16')",
            (user_sub,),
        )
    conn.commit()


def upsert_user(
    conn: sqlite3.Connection, record: Mapping[str, object]
) -> sqlite3.Row:
    """Inserta o actualiza el usuario del id_token de Google (U-005).

    Tres casos:
    - `google_sub` ya conocido: actualiza lo que Google puede haber cambiado
      (email, nombre, foto); `created_at`, el `id` interno y `bubble_color`
      quedan intactos.
    - Correo ya registrado sin ese `google_sub` (cuenta manual con contraseña
      o correo que llegó antes por otro camino): vincula el sub de Google a la
      fila existente y refresca el perfil, sin duplicar ni tocar el color.
    - Resto: fila nueva con `bubble_color` asignado al azar.
    """
    sub = str(record.get("google_sub") or "")
    if not sub:
        raise ValueError("upsert_user requiere el campo 'google_sub'")
    email = record.get("email")

    existing = _user_row(conn, sub)
    if existing:
        conn.execute(
            "UPDATE users SET email = COALESCE(?, email), name = COALESCE(?, name), "
            "picture = COALESCE(?, picture), updated_at = datetime('now') "
            "WHERE google_sub = ?",
            (email, record.get("name"), record.get("picture"), sub),
        )
        conn.commit()
        _seed_user_piece_library(conn, sub, email)
        return _user_row(conn, sub)  # type: ignore[return-value]

    if email:
        by_email = find_user_by_email(conn, str(email))
        if by_email:
            conn.execute(
                "UPDATE users SET google_sub = ?, name = COALESCE(?, name), "
                "picture = COALESCE(?, picture), updated_at = datetime('now') "
                "WHERE google_sub = ?",
                (sub, record.get("name"), record.get("picture"), by_email["google_sub"]),
            )
            conn.commit()
            _seed_user_piece_library(conn, sub, email)
            return _user_row(conn, sub)  # type: ignore[return-value]

    row = new_user_google(conn, sub, email, record.get("name"), record.get("picture"))
    _seed_user_piece_library(conn, sub, email)
    return row


def upsert_manual_user(
    conn: sqlite3.Connection, record: Mapping[str, object]
) -> sqlite3.Row:
    """Inserta o actualiza al usuario con contraseña de la vía manual (U-005).

    Es la variante para las cuentas creadas sin Google (scripts, administrador):
    `google_sub` queda con el centinela `manual:<email en minúsculas>` hasta
    que el usuario vincule una cuenta de Google por correo. Si ya existe una
    fila con ese correo (Google, por ejemplo), solo le fija la contraseña.
    """
    email = str(record.get("email") or "").strip().lower()
    if not email:
        raise ValueError("upsert_manual_user requiere el campo 'email'")
    password_hash = record.get("password_hash")
    if not password_hash:
        raise ValueError("upsert_manual_user requiere 'password_hash'")
    sub = f"manual:{email}"

    existing = _user_row(conn, sub)
    if not existing:
        by_email = find_user_by_email(conn, email)
        if by_email:
            sub = str(by_email["google_sub"])
            existing = by_email

    if existing:
        conn.execute(
            "UPDATE users SET password_hash = ?, name = COALESCE(?, name), "
            "updated_at = datetime('now') WHERE google_sub = ?",
            (password_hash, record.get("name"), sub),
        )
        conn.commit()
        return _user_row(conn, sub)  # type: ignore[return-value]

    conn.execute(
        "INSERT INTO users (google_sub, email, name, password_hash, bubble_color, email_verified) "
        "VALUES (?, ?, ?, ?, ?, 1)",
        (sub, email, record.get("name"), password_hash, random_bubble_color()),
    )
    conn.commit()
    return _user_row(conn, sub)  # type: ignore[return-value]


def create_pending_registration(
    conn: sqlite3.Connection, record: Mapping[str, object]
) -> sqlite3.Row:
    """Crea la cuenta inactiva del registro abierto (U-006).

    Variante de `upsert_manual_user` para el formulario por pasos: nace sin
    verificar (`email_verified = 0`) y con el token del email de comprobación
    y su caducidad. La duplicidad de correo se consulta antes; aquí asume que
    no hay fila con ese email. `ui_source` registra de dónde salió la cuenta.
    """
    email = str(record.get("email") or "").strip().lower()
    if not email:
        raise ValueError("create_pending_registration requiere el campo 'email'")
    password_hash = record.get("password_hash")
    if not password_hash:
        raise ValueError("create_pending_registration requiere 'password_hash'")
    token = record.get("verification_token")
    if not token:
        raise ValueError("create_pending_registration requiere 'verification_token'")

    sub = f"manual:{email}"
    if _user_row(conn, sub) is not None or find_user_by_email(conn, email) is not None:
        raise ValueError(f"Ya existe una cuenta con el correo {email}")

    level = record.get("level")
    raw_genres = record.get("genres")
    genres_json = (
        json.dumps(raw_genres, ensure_ascii=False)
        if isinstance(raw_genres, list) and raw_genres
        else None
    )

    conn.execute(
        "INSERT INTO users (google_sub, email, name, password_hash, bubble_color, "
        "level, genres, terms_version, terms_accepted_at, email_verified, "
        "verification_token, verification_expires_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)",
        (
            sub,
            email,
            record.get("name"),
            password_hash,
            random_bubble_color(),
            level if isinstance(level, str) and level else None,
            genres_json,
            record.get("terms_version"),
            record.get("terms_accepted_at"),
            token,
            record.get("verification_expires_at"),
        ),
    )
    conn.commit()
    return _user_row(conn, sub)  # type: ignore[return-value]


def find_user_by_verification_token(
    conn: sqlite3.Connection, token: str
) -> sqlite3.Row | None:
    """Lee la cuenta pendiente cuyo token de verificación coincide (U-006)."""
    if not token or not token.strip():
        return None
    return conn.execute(
        "SELECT * FROM users WHERE verification_token = ?", (token.strip(),)
    ).fetchone()


def mark_email_verified(conn: sqlite3.Connection, google_sub: str) -> None:
    """Activa la cuenta del registro: consume el token y verifica (U-006)."""
    conn.execute(
        "UPDATE users SET email_verified = 1, verification_token = NULL, "
        "verification_expires_at = NULL, updated_at = datetime('now') "
        "WHERE google_sub = ?",
        (google_sub,),
    )
    conn.commit()


def regenerate_verification_token(
    conn: sqlite3.Connection, google_sub: str, token: str, expires_at: str
) -> None:
    """Reemite el token de un registro pendiente (reenvío del email, U-006)."""
    conn.execute(
        "UPDATE users SET verification_token = ?, verification_expires_at = ?, "
        "updated_at = datetime('now') WHERE google_sub = ?",
        (token, expires_at, google_sub),
    )
    conn.commit()


def update_pending_registration(
    conn: sqlite3.Connection, google_sub: str, record: Mapping[str, object]
) -> None:
    """Refresca los datos de un registro pendiente y reemite el token (U-006).

    Es lo que concede el reenvío: quien repite el formulario con un correo
    pendiente sobrescribe su contraseña, nivel, géneros y términos con los
    nuevos y recibe un token fresco. Nunca toca una cuenta verificada.
    """
    conn.execute(
        "UPDATE users SET name = ?, password_hash = ?, level = ?, genres = ?, "
        "terms_version = ?, terms_accepted_at = ?, verification_token = ?, "
        "verification_expires_at = ?, updated_at = datetime('now') "
        "WHERE google_sub = ? AND email_verified = 0",
        (
            record.get("name"),
            record.get("password_hash"),
            record.get("level"),
            (
                json.dumps(record.get("genres"), ensure_ascii=False)
                if isinstance(record.get("genres"), list) and record.get("genres")
                else None
            ),
            record.get("terms_version"),
            record.get("terms_accepted_at"),
            record.get("verification_token"),
            record.get("verification_expires_at"),
            google_sub,
        ),
    )
    conn.commit()


def list_pieces(
    conn: sqlite3.Connection,
    source: str | None = None,
    owner_id: str | None = None,
    include_anonymous: bool = False,
) -> list[sqlite3.Row]:
    """Lista las piezas persistidas (B-027.3, B-029).

    Ordena el corpus antes que las subidas y, dentro de cada grupo, por
    compositor, opus e id, que es el orden natural del selector del frontend.

    Visibilidad (B-029): el corpus es visible para todos; las subidas solo son
    visibles para su propietario (`owner_id`) o, si se pide, las anónimas
    (`owner_id IS NULL`). Así un usuario autenticado no ve las subidas de
    otros, y las subidas anónimas no se exponen a usuarios identificados.
    """
    conditions: list[str] = []
    params: list[object] = []
    if source is not None:
        conditions.append("source = ?")
        params.append(source)

    visibility: list[str] = ["source = 'corpus'"]
    if owner_id is not None:
        visibility.append("(source = 'upload' AND owner_id = ?)")
        params.append(owner_id)
    if include_anonymous:
        visibility.append("(source = 'upload' AND owner_id IS NULL)")
    conditions.append("(" + " OR ".join(visibility) + ")")

    sql = "SELECT * FROM pieces WHERE " + " AND ".join(conditions)
    sql += " ORDER BY CASE WHEN source = 'corpus' THEN 0 ELSE 1 END, composer, opus, id"
    return conn.execute(sql, params).fetchall()


def find_pieces(
    source: str | None = None,
    owner_id: str | None = None,
    include_anonymous: bool = False,
) -> list[sqlite3.Row]:
    """Lista las piezas gestionando su propia conexión (B-027.3, B-029)."""
    with open_db() as conn:
        return list_pieces(conn, source, owner_id, include_anonymous)


SESSION_COLUMNS = (
    "id",
    "piece_id",
    "status",
    "control",
    "current_measure",
    "position_s",
    "mode",
    "hand",
    "created_at",
    "updated_at",
)

# Campos que el servicio puede cambiar una vez creada la sesión (B-012.1).
SESSION_UPDATABLE = ("status", "control", "current_measure", "position_s", "mode", "hand")

SESSION_EVENT_COLUMNS = ("session_id", "type", "pitch", "velocity", "t_s")


def insert_session(conn: sqlite3.Connection, record: Mapping[str, object]) -> None:
    """Inserta una sesión de práctica; las columnas ausentes quedan NULL."""
    columns = [name for name in SESSION_COLUMNS if name in record]
    if "id" not in columns or "piece_id" not in columns:
        raise ValueError("insert_session requiere al menos 'id' y 'piece_id'")
    placeholders = ", ".join("?" for _ in columns)
    conn.execute(
        f"INSERT INTO sessions ({', '.join(columns)}) VALUES ({placeholders})",
        [record[name] for name in columns],
    )
    conn.commit()


def get_session(conn: sqlite3.Connection, session_id: str) -> sqlite3.Row | None:
    """Lee una sesión por su id."""
    return conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()


def update_session_state(conn: sqlite3.Connection, session_id: str, **fields: object) -> None:
    """Actualiza el estado vivo de una sesión (solo `SESSION_UPDATABLE`)."""
    invalid = set(fields) - set(SESSION_UPDATABLE)
    if invalid:
        raise ValueError(f"Campos de sesión no actualizables: {', '.join(sorted(invalid))}")
    if not fields:
        return
    assignments = ", ".join(f"{name} = ?" for name in fields)
    conn.execute(
        f"UPDATE sessions SET {assignments}, updated_at = datetime('now') WHERE id = ?",
        [*fields.values(), session_id],
    )
    conn.commit()


def insert_session_event(conn: sqlite3.Connection, record: Mapping[str, object]) -> None:
    """Añade un evento MIDI al log de una sesión."""
    columns = [name for name in SESSION_EVENT_COLUMNS if name in record]
    if "session_id" not in columns or "type" not in columns:
        raise ValueError("insert_session_event requiere al menos 'session_id' y 'type'")
    placeholders = ", ".join("?" for _ in columns)
    conn.execute(
        f"INSERT INTO session_events ({', '.join(columns)}) VALUES ({placeholders})",
        [record[name] for name in columns],
    )
    conn.commit()


def list_session_events(conn: sqlite3.Connection, session_id: str) -> list[sqlite3.Row]:
    """Devuelve los eventos de una sesión en orden de llegada."""
    return conn.execute(
        "SELECT * FROM session_events WHERE session_id = ? ORDER BY id",
        (session_id,),
    ).fetchall()


PRACTICE_SIGNAL_COLUMNS = ("session_id", "gate", "measure", "outcome", "wait_ms", "hand")


def insert_practice_signal(conn: sqlite3.Connection, record: Mapping[str, object]) -> None:
    """Añade una señal de práctica del modo espera (B-032.5)."""
    columns = [name for name in PRACTICE_SIGNAL_COLUMNS if name in record]
    if "session_id" not in columns or "gate" not in columns or "outcome" not in columns:
        raise ValueError("insert_practice_signal requiere al menos 'session_id', 'gate' y 'outcome'")
    placeholders = ", ".join("?" for _ in columns)
    conn.execute(
        f"INSERT INTO practice_signals ({', '.join(columns)}) VALUES ({placeholders})",
        [record[name] for name in columns],
    )
    conn.commit()


def list_practice_signals_since(
    conn: sqlite3.Connection,
    session_id: str,
    min_signal_id: int = 0,
) -> list[sqlite3.Row]:
    """Señales de una sesión por encima de un id, viejas primero (B-032.6).

    `min_signal_id` es la marca que dejó la última decisión del agente: las
    señales anteriores ya la motivaron y no cuentan otra vez.
    """
    return conn.execute(
        "SELECT id, gate, measure, outcome, wait_ms, hand FROM practice_signals"
        " WHERE session_id = ? AND id > ? ORDER BY id",
        (session_id, min_signal_id),
    ).fetchall()


def max_signal_id_at(
    conn: sqlite3.Connection,
    session_id: str,
) -> int:
    """Último id de señal de la sesión (marca para reiniciar el contador)."""
    row = conn.execute(
        "SELECT COALESCE(MAX(id), 0) FROM practice_signals WHERE session_id = ?",
        (session_id,),
    ).fetchone()
    return int(row[0] if row else 0)


def last_strikes_baseline(
    conn: sqlite3.Connection,
    session_id: str,
    measure: int | None,
) -> int:
    """Marca de reinicio de strikes de un compás: la última decisión de ese compás.

    `measure IS ?` para que `None` paree con `None` (pieza sin rejilla).
    """
    row = conn.execute(
        "SELECT COALESCE(MAX(baseline_signal_id), 0) FROM agent_decisions"
        " WHERE session_id = ? AND measure IS ?",
        (session_id, measure),
    ).fetchone()
    return int(row[0] if row else 0)


def count_agent_actions(
    conn: sqlite3.Connection,
    session_id: str,
    measure: int | None,
) -> dict[str, int]:
    """Intervenciones ya ejecutadas, por acción: en el compás y en la sesión (B-032.6)."""
    counts: dict[str, int] = {}
    for statement, args in (
        (
            "SELECT action, COUNT(*) FROM agent_decisions"
            " WHERE session_id = ? AND measure IS ? GROUP BY action",
            (session_id, measure),
        ),
    ):
        for action, total in conn.execute(statement, args).fetchall():
            counts[str(action)] = int(total)
    row = conn.execute(
        "SELECT COUNT(*) FROM agent_decisions"
        " WHERE session_id = ? AND action IN ('slow_down', 'give_hint', 'demonstrate')",
        (session_id,),
    ).fetchone()
    counts["__session__"] = int(row[0] if row else 0)
    return counts


def count_agent_action_total(conn: sqlite3.Connection, session_id: str, action: str) -> int:
    """Veces que una acción se ha ejecutado en toda la sesión (B-032.7).

    El tope de sesión del «otra vez» cuenta `repeat_demo` en todos los
    compases; las demás intervenciones de strikes usan `count_agent_actions`.
    """
    row = conn.execute(
        "SELECT COUNT(*) FROM agent_decisions WHERE session_id = ? AND action = ?",
        (session_id, action),
    ).fetchone()
    return int(row[0] if row else 0)


def last_pending_offer(conn: sqlite3.Connection, session_id: str) -> sqlite3.Row | None:
    """La última oferta de demostración sin resolver (B-032.7).

    `offer_demo` queda grabada en `agent_decisions` como cualquier decisión;
    se resuelve cuando después llega un `offer_dismiss` («Sigo yo») o una
    `demonstrate`/`repeat_demo` («Sí, muéstralo»/«Otra vez») de cualquier
    compás, que es lo mismo que el front manda al aceptar o rechazar. Sin
    oferta nueva o ya resuelta devuelve `None`.
    """
    offer = conn.execute(
        "SELECT id, measure, params_json FROM agent_decisions"
        " WHERE session_id = ? AND action = 'offer_demo' ORDER BY id DESC LIMIT 1",
        (session_id,),
    ).fetchone()
    if offer is None:
        return None
    answered = conn.execute(
        "SELECT id FROM agent_decisions"
        " WHERE session_id = ? AND id > ? AND action IN"
        " ('offer_dismiss', 'demonstrate', 'repeat_demo')"
        " ORDER BY id LIMIT 1",
        (session_id, offer["id"]),
    ).fetchone()
    return None if answered is not None else offer


AGENT_DECISION_COLUMNS = (
    "session_id",
    "measure",
    "action",
    "params_json",
    "reason",
    "provider",
    "baseline_signal_id",
)


def insert_agent_decision(conn: sqlite3.Connection, record: Mapping[str, object]) -> None:
    """Registra una intervención ejecutada del agente (B-012.4/B-032.6)."""
    columns = [name for name in AGENT_DECISION_COLUMNS if name in record]
    if "session_id" not in columns or "action" not in columns:
        raise ValueError("insert_agent_decision requiere al menos 'session_id' y 'action'")
    placeholders = ", ".join("?" for _ in columns)
    conn.execute(
        f"INSERT INTO agent_decisions ({', '.join(columns)}) VALUES ({placeholders})",
        [record[name] for name in columns],
    )
    conn.commit()


CHAT_MESSAGE_COLUMNS = ("chat_id", "role", "content", "tool_name")


def insert_chat_message(conn: sqlite3.Connection, record: Mapping[str, object]) -> None:
    """Añade un mensaje al log de una conversación (B-012.8)."""
    columns = [name for name in CHAT_MESSAGE_COLUMNS if name in record]
    if "chat_id" not in columns or "role" not in columns:
        raise ValueError("insert_chat_message requiere al menos 'chat_id' y 'role'")
    placeholders = ", ".join("?" for _ in columns)
    conn.execute(
        f"INSERT INTO chat_messages ({', '.join(columns)}) VALUES ({placeholders})",
        [record[name] for name in columns],
    )
    conn.commit()


def list_chat_messages(conn: sqlite3.Connection, chat_id: str, limit: int = 20) -> list[sqlite3.Row]:
    """Devuelve los últimos `limit` mensajes de una conversación, más recientes primero."""
    return conn.execute(
        "SELECT * FROM chat_messages WHERE chat_id = ? ORDER BY id DESC LIMIT ?",
        (chat_id, limit),
    ).fetchall()


def save_chat_message(chat_id: str, role: str, content: str, tool_name: str | None = None) -> None:
    """Guarda un mensaje de conversación gestionando su propia conexión (B-012.8)."""
    with open_db() as conn:
        insert_chat_message(
            conn,
            {"chat_id": chat_id, "role": role, "content": content, "tool_name": tool_name},
        )


def get_chat_history(chat_id: str, limit: int = 20) -> list[sqlite3.Row]:
    """Lee el historial de una conversación en orden cronológico (B-012.8)."""
    with open_db() as conn:
        rows = list_chat_messages(conn, chat_id, limit)
        return list(reversed(rows))


# --- Tokens de autenticación (U-007) ----------------------------------------
# Tabla auth_tokens: propósito (verify | reset), hash SHA-256, user_sub, expiración, uso.

import hashlib


def _hash_token(token: str) -> str:
    """SHA-256 del token en claro; solo el hash se guarda en BD."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_auth_token(
    conn: sqlite3.Connection,
    *,
    purpose: str,
    user_sub: str,
    token: str,
    expires_at: str,
) -> None:
    """Guarda un nuevo token (solo su hash) e invalida los anteriores del mismo propósito."""
    if purpose not in ("verify", "reset"):
        raise ValueError("purpose debe ser 'verify' o 'reset'")
    token_hash = _hash_token(token)
    # Invalida tokens previos del mismo usuario y propósito (no usados ni caducados)
    conn.execute(
        "UPDATE auth_tokens SET used_at = datetime('now') "
        "WHERE user_sub = ? AND purpose = ? AND used_at IS NULL "
        "AND (expires_at IS NULL OR expires_at > datetime('now'))",
        (user_sub, purpose),
    )
    conn.execute(
        "INSERT INTO auth_tokens (purpose, token_hash, user_sub, expires_at) "
        "VALUES (?, ?, ?, ?)",
        (purpose, token_hash, user_sub, expires_at),
    )
    conn.commit()


def find_user_by_auth_token(
    conn: sqlite3.Connection, *, purpose: str, token: str
) -> sqlite3.Row | None:
    """Busca el usuario cuyo token coincide (hash), sin usar y no caducado."""
    if purpose not in ("verify", "reset"):
        return None
    token_hash = _hash_token(token)
    return conn.execute(
        "SELECT u.* FROM users u "
        "JOIN auth_tokens t ON u.google_sub = t.user_sub "
        "WHERE t.purpose = ? AND t.token_hash = ? "
        "AND t.used_at IS NULL AND (t.expires_at IS NULL OR t.expires_at > datetime('now'))",
        (purpose, token_hash),
    ).fetchone()


def consume_auth_token(conn: sqlite3.Connection, *, purpose: str, token: str) -> None:
    """Marca el token como usado (one-time)."""
    if purpose not in ("verify", "reset"):
        return
    token_hash = _hash_token(token)
    conn.execute(
        "UPDATE auth_tokens SET used_at = datetime('now') "
        "WHERE purpose = ? AND token_hash = ? AND used_at IS NULL",
        (purpose, token_hash),
    )
    conn.commit()


def update_password_changed_at(conn: sqlite3.Connection, google_sub: str) -> None:
    """Actualiza la marca de cambio de contraseña para invalidar JWTs previos."""
    conn.execute(
        "UPDATE users SET password_changed_at = datetime('now'), updated_at = datetime('now') "
        "WHERE google_sub = ?",
        (google_sub,),
    )
    conn.commit()


def init_db(conn: sqlite3.Connection) -> list[str]:
    """Aplica las migraciones pendientes y devuelve sus versiones aplicadas."""
    applied: list[str] = []
    for script in pending_migrations(conn):
        conn.executescript(script.read_text(encoding="utf-8"))
        conn.execute("INSERT INTO schema_migrations (version) VALUES (?)", (script.stem,))
        conn.commit()
        applied.append(script.stem)
    return applied
