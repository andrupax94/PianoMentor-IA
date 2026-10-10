// description: Cliente HTTP tipado hacia FastAPI; único punto de llamadas REST del frontend.
// context: Contratos de B-002/B-003; los tipos reflejan schemas.py del backend.

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

/** Una nota normalizada lista para reproducir; tiempos en segundos, alineada con NoteResponse. */
export interface PlayableNote {
  pitch: number;
  start_seconds: number;
  duration_seconds: number;
  velocity: number;
  channel: number;
  track: number;
}

/** Respuesta de GET /api/v1/pieces/{id}/notes, alineada con PieceNotesResponse de Pydantic. */
export interface PieceNotesResponse {
  piece_id: string;
  tempo: number | null;
  duration_seconds: number | null;
  notes_total: number;
  from_s: number | null;
  to_s: number | null;
  notes: PlayableNote[];
}

/** Respuesta de GET /health. */
export interface HealthResponse {
  status: string;
  service: string;
}

const ERROR_CODES = [
  "invalid_extension",
  "invalid_filename",
  "empty_file",
  "file_too_large",
  "persistence_error",
  "invalid_window",
  "piece_not_found",
  "piece_file_not_found",
  "invalid_midi_content",
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

/** Sube un archivo MIDI a POST /api/v1/pieces como multipart/form-data con el campo `file`. */
export async function uploadPiece(file: File): Promise<PieceResponse> {
  const form = new FormData();
  form.append("file", file, file.name);

  return request<PieceResponse>("/api/v1/pieces", { method: "POST", body: form });
}

/** Pide la partitura ordenada de una pieza, con ventana opcional por segundos. */
export async function getPieceNotes(
  pieceId: string,
  window?: { from_s?: number; to_s?: number },
): Promise<PieceNotesResponse> {
  const params = new URLSearchParams();
  if (window?.from_s !== undefined) params.set("from_s", String(window.from_s));
  if (window?.to_s !== undefined) params.set("to_s", String(window.to_s));
  const query = params.size > 0 ? `?${params.toString()}` : "";
  return request<PieceNotesResponse>(`/api/v1/pieces/${encodeURIComponent(pieceId)}/notes${query}`);
}

/** Consulta el healthcheck del backend en GET /health. */
export async function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/health");
}
