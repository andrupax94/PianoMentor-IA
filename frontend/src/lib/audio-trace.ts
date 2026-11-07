// description: Trazas de diagnóstico del audio (2026-11-07): registra en consola las operaciones relevantes del sampler/transporte cuando el navegador abre la app con el parámetro ?traceAudio — dev-only, silencio total en producción y por defecto.
// context: Nace del corte de sonido residual con la pulsación anticipada (B-032.8): grabando el audio, este log dice QUÉ operación silenció la voz y cuándo. No toca el flujo de sonido: solo imprime pila de llamadas recortada.

const MARK = "%c[audio]";
const STYLE = "color:#d4af37;font-weight:700";

/** Clave del acceso directo (petición del usuario): el menú de depuración
 * (B-033.2) la escribe; persiste entre recargas hasta que se quita. */
const KEY = "traceAudio";

/** ¿Están las trazas activas? dev + parámetro ?traceAudio en la URL. */
function active(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (typeof window === "undefined") return false;
  return (
    window.location.search.includes("traceAudio") ||
    keyActiva()
  );
}

function keyActiva(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Estado para el alternador: true si la URL o el acceso directo lo activan. */
export function isTraceAudio(): boolean {
  return active();
}

/**
 * Alternador del menú de depuración: escribe o borra el acceso directo y
 * devuelve el estado final. Nota: con ?traceAudio en la URL, quitar el
 * acceso directo no apaga — el parámetro manda; quitarlo de la URL es la
 * vía entonces.
 */
export function setTraceAudio(enabled: boolean): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (typeof window === "undefined") return false;
  try {
    if (enabled) {
      window.localStorage.setItem(KEY, "1");
    } else {
      window.localStorage.removeItem(KEY);
    }
  } catch {
    return false;
  }
  if (enabled) {
    console.info(MARK, STYLE, "trazas activas (alternador del menú de depuración) — el rastro del sampler/transporte/robot aparecerá al empezar la práctica");
  }
  return keyActiva() || window.location.search.includes("traceAudio");
}

/**
 * Traza de audio: activada con ?traceAudio en la URL. Línea única, sin pila
 * (el facsímil de pila hacía los logs kilométricos); para las llamadas que
 * SILNCIAN el sampler sigue existiendo audioTraceStack con la pila plegable.
 */
export function audioTrace(...args: unknown[]): void {
  if (!active()) return;
  console.info(MARK, STYLE, ...args);
}

/** Igual pero evoca console.trace para la pila completa desplegable. */
export function audioTraceStack(message: string): void {
  if (!active()) return;
  console.groupCollapsed(MARK, STYLE, message);
  console.trace();
  console.groupEnd();
}

/** Banner de arranque: distingue «sin trazas» (no activas) de «trazas caídas». */
if (active()) {
  console.info(MARK, STYLE, "trazas activas (?traceAudio) — el rastro del sampler/transporte/robot aparecerá al empezar la práctica");
}
