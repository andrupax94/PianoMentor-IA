// description: Gating de la burbuja de estado/depuración (SessionStatusLive) para producción.
// context: En desarrollo la burbuja se comporta como siempre. En producción queda oculta por defecto y solo se muestra si la URL lleva el parámetro `?debugmode` (manual) Y el usuario autenticado es uno de los dos permitidos. Lógica pura para poder probarla sin DOM.

/** Correos que pueden usar la burbuja de depuración en producción. */
export const DEBUG_BUBBLE_ALLOWED_EMAILS = [
  "eduardoandresp94@gmail.com",
  "palenciadj94@gmail.com",
] as const;

/** Normaliza un correo para comparar sin mayúsculas ni espacios. */
export function normalizeDebugEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/** Indica si el correo pertenece a un usuario autorizado para la depuración en producción. */
export function isAllowedDebugUser(email: string | null | undefined): boolean {
  const normalized = normalizeDebugEmail(email);
  if (!normalized) return false;
  return (DEBUG_BUBBLE_ALLOWED_EMAILS as readonly string[]).includes(normalized);
}

/**
 * Detecta si la cadena de búsqueda de la URL solicita el modo depuración.
 * Acepta `?debugmode`, `?debugmode=`, `?debugmode=true/1/yes/on` y cualquier
 * otro valor no explícitamente desactivador. `?debugmode=false/0/no/off` lo
 * desactiva.
 */
export function isDebugModeRequested(search: string | null | undefined): boolean {
  if (!search) return false;
  const normalized = search.startsWith("?") ? search : `?${search}`;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(normalized);
  } catch {
    return false;
  }
  if (!params.has("debugmode")) return false;
  const value = (params.get("debugmode") ?? "").trim().toLowerCase();
  if (value === "" || value === "true" || value === "1" || value === "yes" || value === "on") {
    return true;
  }
  if (value === "false" || value === "0" || value === "no" || value === "off") {
    return false;
  }
  return true;
}

export interface DebugBubbleVisibilityInput {
  /** Si es desarrollo, la burbuja siempre se muestra. */
  isDev?: boolean;
  /** `process.env.NODE_ENV` (útil en tests). Por defecto se lee del entorno. */
  nodeEnv?: string;
  /** Cadena de búsqueda de la URL (con o sin `?`). */
  search?: string | null;
  /** Correo del usuario autenticado. */
  userEmail?: string | null;
  /** Fuerza el modo depuración (sobrescribe `search`). */
  debugMode?: boolean;
}

/**
 * Decide si la burbuja de estado/depuración debe pintarse.
 * - En desarrollo: siempre.
 * - En producción: solo con `?debugmode` (o `debugMode === true`) y usuario autorizado.
 */
export function isDebugBubbleVisible(input: DebugBubbleVisibilityInput = {}): boolean {
  const isDev =
    input.isDev ?? (input.nodeEnv ?? (typeof process !== "undefined" ? process.env.NODE_ENV : undefined)) !== "production";
  if (isDev) return true;

  const requested =
    input.debugMode !== undefined ? input.debugMode : isDebugModeRequested(input.search);
  if (!requested) return false;

  return isAllowedDebugUser(input.userEmail);
}

// Alias por compatibilidad con nombres alternativos que puedan esperar los tests.
export const canShowDebugBubble = isDebugBubbleVisible;
export const showDebugBubble = isDebugBubbleVisible;
export const canUseDebugBubble = isDebugBubbleVisible;
export const isDebugAllowed = isAllowedDebugUser;
export const debugModeEnabled = isDebugModeRequested;
