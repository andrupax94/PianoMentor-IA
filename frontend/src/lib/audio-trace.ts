// description: Trazas de diagnóstico del audio (2026-11-07): registra en consola las operaciones relevantes del sampler/transporte cuando el navegador abre la app con el parámetro ?traceAudio — dev-only, silencio total en producción y por defecto.
// context: Nace del corte de sonido residual con la pulsación anticipada (B-032.8): grabando el audio, este log dice QUÉ operación silenció la voz y cuándo. No toca el flujo de sonido: solo imprime pila de llamadas recortada.

const MARK = "%c[audio]";
const STYLE = "color:#d4af37;font-weight:700";

/** ¿Están las trazas activas? dev + parámetro ?traceAudio en la URL. */
function active(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (typeof window === "undefined") return false;
  return window.location.search.includes("traceAudio");
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
