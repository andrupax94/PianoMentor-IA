// description: Cliente HTTP tipado hacia FastAPI con tipos de los contratos Pydantic (PieceResponse con source y deduplicated; PieceNotesResponse con la rejilla PieceMeasures y los opcionales tracks/chords y PlayableNote.hand de B-009.3; PieceCatalogItem para la lista del catálogo) y errores ApiError con código estable. Expone previewPiece (POST /pieces/preview, efímero), getPieceList (GET /pieces?source=corpus|upload), getPieceNotes (con opciones withHands/withChords) y uploadPiece (conservado sin uso, ahora con id_token opcional de Google para owner_id); desde B-012.1 añade createSession (POST /sessions) y getSessionState (GET /sessions/{id}/state) con los tipos SessionResponse/SessionState, los estados idle/playing/paused y el control student/agent; y desde B-012.8 añade sendAgentMessage (POST /agent/chat) con los tipos AgentChatRequest/AgentChatResponse, AgentClientAction y AgentToolCall; desde B-012.6 añade runAgentStep (POST /sessions/{id}/agent-step) con el tipo AgentStepResponse (action, status, provider, reason y used_fallback); desde U-005 añade registerAuthSession (POST /auth/session) con AuthUser/AuthSessionResponse y los códigos auth_*, y loginWithPassword (POST /auth/login) para el login simple con contraseña (AuthLoginResponse con access_token).
// context: Único punto de llamadas REST desde componentes; usado por B-004 y reutilizado por B-012. La subida persistente se conserva a propósito, aunque hoy la interfaz use previewPiece. Los campos de B-009.3 son opcionales en los tipos y no los pide ningún componente todavía: el uso visible (manos, acordes) es de B-012. Los códigos session_not_found, invalid_event_payload y ws_error se reconocen como errores estables, al igual que invalid_chat_payload, unknown_tool y tool_failed del chat; los auth_* de identidad llegan con U-005.

/** Metadatos de una pieza MIDI; los campos pueden ser nulos hasta que B-005 los rellene. */
export interface PieceMetadata {
  tracks: number | null;
  duration_seconds: number | null;
  tempo: number | null;
  notes_count: number | null;
}

/** Respuesta de POST /api/v1/pieces, alineada con PieceResponse de Pydantic. */
export interface PieceResponse {
  id: string;
  filename: string;
  stored_filename: string;
  size_bytes: number;
  extension: string;
  status: string;
  /** Procedencia de la pieza: 'corpus' (catálogo) o 'upload' (subida). */
  source: string;
  /** true cuando el contenido ya existía y se ha reutilizado en vez de duplicarlo. */
  deduplicated: boolean;
  metadata: PieceMetadata;
}

/**
 * Resumen de una pieza del catálogo, alineado con PieceSummary de Pydantic (B-027.3).
 * `cover` es la ruta pública de la portada; null en las subidas sin portada.
 */
export interface PieceCatalogItem {
  id: string;
  title: string | null;
  composer: string | null;
  opus: string | null;
  difficulty: string | null;
  license: string | null;
  cover: string | null;
  source: string | null;
  duration_seconds: number | null;
  tempo: number | null;
  notes_count: number | null;
  tracks: number | null;
}

/** Mano de una nota, derivada por el motor de la altura de su pista (B-009.2). */
export type NoteHand = "left" | "right" | "unknown";

/** Una nota normalizada lista para reproducir; tiempos en segundos, alineada con NoteResponse. */
export interface PlayableNote {
  pitch: number;
  start_seconds: number;
  duration_seconds: number;
  velocity: number;
  channel: number;
  track: number;
  /** Mano de la pista; solo llega si se pide con `withHands` (B-009.3). */
  hand?: NoteHand;
}

/** Resumen de una pista con notas y su mano (B-009.3); describe la pieza completa. */
export interface TrackSummary {
  track: number;
  hand: NoteHand;
  note_count: number;
  channels: number[];
  lowest_pitch: number;
  highest_pitch: number;
  median_pitch: number;
}

/** Notas que suenan a la vez (B-009.1/B-009.3); un acorde puede cruzar manos. */
export interface ChordSummary {
  start_seconds: number;
  pitches: number[];
}

/** Lo que puede pedir el cliente además de la partitura (B-009.3). */
export interface PolyphonyOptions {
  /** Añade `hand` a cada nota y el resumen `tracks`. */
  withHands?: boolean;
  /** Añade los `chords` de la partitura devuelta. */
  withChords?: boolean;
}

/** Rejilla de compases servida por el motor para situar el compás actual (B-008.3). */
export interface PieceMeasures {
  /** Número total de compases. */
  count: number;
  /** Inicio de cada compás en segundos de partitura (sin escalar por tempo). */
  starts_s: number[];
  /** Firma [numerador, denominador] de cada compás, alineada con `starts_s`. */
  signatures: [number, number][];
  /** Fin de la pieza en segundos. */
  end_s: number;
}

/**
 * Respuesta de GET /api/v1/pieces/{id}/notes, alineada con PieceNotesResponse de Pydantic.
 * `tracks` y `chords` solo llegan si se piden con `withHands`/`withChords` (B-009.3).
 */
export interface PieceNotesResponse {
  piece_id: string;
  tempo: number | null;
  duration_seconds: number | null;
  notes_total: number;
  from_s: number | null;
  to_s: number | null;
  /** Rejilla de compases; null si el motor no la sirve. */
  measures: PieceMeasures | null;
  /** Pistas de la pieza con su mano; solo con `withHands`. */
  tracks?: TrackSummary[];
  /** Acordes de la partitura devuelta; solo con `withChords`. */
  chords?: ChordSummary[];
  notes: PlayableNote[];
}

/**
 * Respuesta de POST /api/v1/pieces/preview, alineada con PiecePreviewResponse (B-027.3).
 * Partitura efímera: no lleva `piece_id` porque no se persiste en el catálogo.
 */
export interface PiecePreviewResponse {
  filename: string;
  tempo: number | null;
  duration_seconds: number | null;
  notes_total: number;
  measures: PieceMeasures | null;
  /** Pistas de la pieza con su mano; solo con `withHands` (B-009.3). */
  tracks?: TrackSummary[];
  /** Acordes de la partitura devuelta; solo con `withChords` (B-009.3). */
  chords?: ChordSummary[];
  notes: PlayableNote[];
}

/** Respuesta de GET /health. */
export interface HealthResponse {
  status: string;
  service: string;
}

/** Estados por los que pasa una sesión de práctica (B-012.1). */
export type SessionStatus = "idle" | "playing" | "paused";

/** Quién tiene el piano: el estudiante o el agente (B-012.1). */
export type SessionControl = "student" | "agent";

/** Respuesta de POST /api/v1/sessions, alineada con SessionResponse (B-012.1). */
export interface SessionResponse {
  id: string;
  piece_id: string;
  status: SessionStatus;
}

/**
 * Estado vivo de una sesión, alineado con SessionStateResponse (B-012.1).
 * Es el mismo objeto que el WebSocket empuja envuelto en `{type: "state"}`.
 */
export interface SessionState {
  session_id: string;
  piece_id: string;
  status: SessionStatus;
  control: SessionControl;
  current_measure: number | null;
  position_s: number;
}

const ERROR_CODES = [  "invalid_extension",
  "invalid_filename",
  "empty_file",
  "file_too_large",
  "persistence_error",
  "invalid_window",
  "piece_not_found",
  "piece_file_not_found",
  "invalid_midi_content",
  "session_not_found",
  "invalid_event_payload",
  "ws_error",
  "auth_missing_header",
  "auth_invalid_header",
  "auth_not_configured",
  "auth_invalid_token",
  "auth_invalid_credentials",
  "auth_invalid_email",
  "auth_weak_password",
  "auth_invalid_level",
  "auth_invalid_genre",
  "auth_email_exists",
  "auth_email_unverified",
  "invalid_chat_payload",
  "unknown_tool",
  "tool_failed",
  "unexpected_response",
  "network_error",
] as const;

export type ApiErrorCode = (typeof ERROR_CODES)[number];

/** Error tipado que el cliente entrega al llamador: código estable y mensaje legible. */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number | null;

  constructor(code: ApiErrorCode, message: string, status: number | null = null) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

function getBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/+$/, "");
}

/** Extrae el detalle {code, message} que FastAPI devuelve en los HTTPException del backend. */
async function toApiError(response: Response): Promise<ApiError> {
  let code: ApiErrorCode = "unexpected_response";
  let message = `El servidor respondió ${response.status}`;

  try {
    const body: unknown = await response.json();
    const detail = (body as { detail?: unknown }).detail;
    if (detail && typeof detail === "object") {
      const { code: rawCode, message: rawMessage } = detail as { code?: unknown; message?: unknown };
      if (typeof rawCode === "string" && (ERROR_CODES as readonly string[]).includes(rawCode)) {
        code = rawCode as ApiErrorCode;
      }
      if (typeof rawMessage === "string" && rawMessage.trim().length > 0) {
        message = rawMessage;
      }
    } else if (typeof detail === "string" && detail.trim().length > 0) {
      // Errores de validación nativos de FastAPI/Pydantic: {detail: [{msg, loc, ...}]}
      message = detail;
    }
  } catch {
    // Respuesta sin cuerpo JSON: mantenemos el mensaje genérico.
  }

  return new ApiError(code, message, response.status);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${getBaseUrl()}${path}`, init);
  } catch {
    throw new ApiError("network_error", "No se pudo conectar con el servicio. Inténtalo de nuevo más tarde.");
  }

  if (!response.ok) {
    throw await toApiError(response);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError("unexpected_response", "La respuesta del servidor no tiene el formato esperado.");
  }
}

/**
 * Sube un archivo MIDI a POST /api/v1/pieces como multipart/form-data con el campo `file`.
 * Hoy la interfaz no lo usa (subir a mano va por `previewPiece`, que no persiste nada),
 * pero se conserva a propósito: la subida persistente puede volver a necesitarse.
 */
export async function uploadPiece(file: File, accessToken?: string): Promise<PieceResponse> {
  const form = new FormData();
  form.append("file", file, file.name);

  // U-005: con id_token de Google la pieza queda asociada a su dueño.
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  return request<PieceResponse>("/api/v1/pieces", { method: "POST", body: form, headers });
}

// ---------------------------------------------------------------------------
// Identidad con Google (U-005)
// ---------------------------------------------------------------------------

/** Respuesta de POST /api/v1/auth/session, alineada con AuthSessionResponse de Pydantic. */
export interface AuthSessionResponse {
  user: AuthUser;
}

/** Usuario identificado por el backend; `id` es el `google_sub` de Google. */
export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  picture: string | null;
  /** Color del avatar asignado al crear la cuenta (formato #rrggbb). */
  bubble_color: string | null;
}

/** Respuesta de POST /api/v1/auth/login, alineada con AuthLoginResponse de Pydantic. */
export interface AuthLoginResponse {
  user: AuthUser;
  /** JWT propio del backend; viaja como `Authorization: Bearer` en lo que sigue. */
  access_token: string;
}

/**
 * Registra (o re-registra, idempotente) al usuario dueño de un id_token de
 * Google en POST /api/v1/auth/session (U-005). Usa los códigos de error
 * auth_missing_header, auth_invalid_header, auth_invalid_token y
 * auth_not_configured, además de los comunes.
 */
export async function registerAuthSession(idToken: string): Promise<AuthUser> {
  const response = await request<AuthSessionResponse>("/api/v1/auth/session", {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}` },
  });
  return response.user;
}

/**
 * Login simple con cuenta y contraseña (U-005): POST /api/v1/auth/login.
 * Devuelve el usuario (con su color de burbuja) y el token del backend.
 * Con `autologin` y credenciales vacías, el backend entra en la cuenta
 * ADMIN_EMAIL solo si AUTOLOGIN está activo fuera de producción.
 * El error con credenciales erróneas, correo desconocido o cuenta de
 * Google sin contraseña es siempre auth_invalid_credentials (401), con el
 * típico mensaje de combinación incorrecta.
 */
export async function loginWithPassword(
  email: string,
  password: string,
  autologin = false,
): Promise<AuthLoginResponse> {
  return request<AuthLoginResponse>("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, autologin }),
  });
}

/**
 * Carga del registro por pasos (U-006): POST /api/v1/auth/register.
 * La cuenta queda creada pero inactiva; el usuario la activa con el enlace
 * del email (step 5 del wizard). El backend puede devolver cuatro códigos
 * propios del formulario (auth_invalid_email, auth_weak_password,
 * auth_invalid_level, auth_invalid_genre) más auth_email_exists cuando el
 * correo ya pertenece a una cuenta verificada: son los que la UI mapea.
 */
export interface AuthRegisterRequest {
  email: string;
  password: string;
  display_name?: string | null;
  level: string;
  genres?: string[] | null;
  accepted_terms?: boolean | null;
}

export interface AuthRegisterResponse {
  status: "verification_sent";
  email: string;
}

export async function registerUser(payload: AuthRegisterRequest): Promise<AuthRegisterResponse> {
  return request<AuthRegisterResponse>("/api/v1/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/**
 * Prepara un MIDI a mano para escucharlo en el piano sin guardarlo (B-027.3).
 * El backend lo lee en memoria: no entra en el almacén ni en el catálogo, así que
 * la Library sigue mostrando solo las piezas del corpus. Con `options` puede
 * pedirse la mano de cada nota y los acordes (B-009.3).
 */
export async function previewPiece(
  file: File,
  options: PolyphonyOptions = {},
): Promise<PiecePreviewResponse> {
  const form = new FormData();
  form.append("file", file, file.name);

  const params = polyphonyParams(options);
  const query = params.size > 0 ? `?${params.toString()}` : "";
  return request<PiecePreviewResponse>(`/api/v1/pieces/preview${query}`, {
    method: "POST",
    body: form,
  });
}

/**
 * Pide la partitura ordenada de una pieza, con ventana opcional por segundos.
 * Con `options` añade la mano de cada nota y/o los acordes (B-009.3).
 */
export async function getPieceNotes(
  pieceId: string,
  window?: { from_s?: number; to_s?: number },
  options: PolyphonyOptions = {},
): Promise<PieceNotesResponse> {
  const params = new URLSearchParams();
  if (window?.from_s !== undefined) params.set("from_s", String(window.from_s));
  if (window?.to_s !== undefined) params.set("to_s", String(window.to_s));
  for (const [key, value] of polyphonyParams(options)) params.set(key, value);
  const query = params.size > 0 ? `?${params.toString()}` : "";
  return request<PieceNotesResponse>(`/api/v1/pieces/${encodeURIComponent(pieceId)}/notes${query}`);
}

/** Traduce las opciones de polifonía a los parámetros que entiende el backend (B-009.3). */
function polyphonyParams(options: PolyphonyOptions): URLSearchParams {
  const params = new URLSearchParams();
  if (options.withHands) params.set("with_hands", "true");
  if (options.withChords) params.set("with_chords", "true");
  return params;
}

/**
 * Lista las piezas del catálogo en GET /api/v1/pieces (B-027.3).
 * Sin `source` devuelve corpus y subidas (el corpus primero).
 */
export async function getPieceList(
  source?: "corpus" | "upload",
): Promise<PieceCatalogItem[]> {
  const query = source ? `?${new URLSearchParams({ source }).toString()}` : "";
  return request<PieceCatalogItem[]>(`/api/v1/pieces${query}`);
}

/** Consulta el healthcheck del backend en GET /health. */
export async function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/health");
}

/**
 * Abre una sesión de práctica sobre una pieza en POST /api/v1/sessions (B-012.1).
 * El backend rechaza con `piece_not_found` si la pieza no existe.
 */
export async function createSession(pieceId: string): Promise<SessionResponse> {
  return request<SessionResponse>("/api/v1/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ piece_id: pieceId }),
  });
}

/**
 * Lee el estado de una sesión en GET /api/v1/sessions/{id}/state (B-012.1).
 * Es el mismo estado que el WebSocket empuja en tiempo real; sirve para el
 * primer pintado sin esperar a que abra el socket.
 */
export async function getSessionState(sessionId: string): Promise<SessionState> {
  return request<SessionState>(`/api/v1/sessions/${encodeURIComponent(sessionId)}/state`);
}

/**
 * Acción propuesta por el agente, alineada con `ActionResponse` (B-012.4/B-012.6).
 * `provider` dice quién la propuso (`deterministic`, `mock`, `groq`…) y
 * `used_fallback` si hubo que caer en las reglas deterministas porque el LLM
 * falló o propuso algo fuera de límites.
 */
export interface AgentStepResponse {
  action: string;
  status: string;
  provider: string;
  reason: string;
  used_fallback: boolean;
}

/**
 * Pide el siguiente paso del agente en POST /api/v1/sessions/{id}/agent-step (B-012.6).
 * El backend decide con el proveedor de `LLM_PROVIDER` y valida la propuesta:
 * la respuesta es siempre una acción de la lista blanca.
 */
export async function runAgentStep(sessionId: string): Promise<AgentStepResponse> {
  return request<AgentStepResponse>(
    `/api/v1/sessions/${encodeURIComponent(sessionId)}/agent-step`,
    { method: "POST" },
  );
}

// ---------------------------------------------------------------------------
// Chat del agente (B-012.8)
// ---------------------------------------------------------------------------

/**
 * Una función invocada por el modelo, alineada con ToolCallResult de Pydantic.
 * `rejected` es true cuando el registro la rechazó por estar fuera de la lista
 * blanca; en ese caso no se ejecutó nada.
 */
export interface AgentToolCall {
  name: string;
  arguments: Record<string, unknown>;
  rejected?: boolean;
}

/**
 * Orden que el navegador debe ejecutar tras un turno del agente, alineada con
 * ToolCallResult. El backend nunca la ejecuta: solo devuelve la intención
 * (reproducir, pausar, abrir práctica…), porque el transporte vive aquí.
 */
export interface AgentClientAction {
  name: string;
  arguments: Record<string, unknown>;
}

/** Contexto opcional que el front cuenta al agente: dónde está el usuario. */
export interface AgentChatContext {
  page?: string;
  piece_id?: string | null;
  session_id?: string | null;
  transport?: string | null;
}

/** Petición a POST /api/v1/agent/chat, alineada con ChatMessageRequest. */
export interface AgentChatRequest {
  message: string;
  chat_id?: string | null;
  context?: AgentChatContext | null;
}

/** Respuesta de POST /api/v1/agent/chat, alineada con ChatMessageResponse. */
export interface AgentChatResponse {
  chat_id: string;
  reply: string;
  provider: string;
  used_fallback: boolean;
  client_action: AgentClientAction | null;
  used_tools: AgentToolCall[];
}

/**
 * Envía un mensaje al chat del agente en POST /api/v1/agent/chat (B-012.8).
 * El backend valida contra la lista blanca, ejecuta las funciones de servidor
 * y devuelve `client_action` cuando la orden es del navegador.
 */
export async function sendAgentMessage(payload: AgentChatRequest): Promise<AgentChatResponse> {
  return request<AgentChatResponse>("/api/v1/agent/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
