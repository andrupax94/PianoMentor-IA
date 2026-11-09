// description: Trazas de diagnóstico del audio (2026-11-07): registra en consola las operaciones relevantes del sampler/transporte cuando el navegador abre la app con el parámetro ?traceAudio — dev-only, silencio total en producción y por defecto. Desde B-033.5 publica la misma línea en el Registro del menú de depuración.
// context: Nace del corte de sonido residual con la pulsación anticipada (B-032.8): grabando el audio, este log dice QUÉ operación silenció la voz y cuándo. No toca el flujo de sonido: solo imprime pila de llamadas recortada. Desde B-033.5 la misma línea va también al Registro del menú de depuración (practice-debug, canal audio) cuando la traza está activa — se escribe en los dos lados a la vez y el registro conserva su anillo.

import { publishDebugLog } from "./practice-debug";

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
 * B-033.5: además de la consola, la misma línea entra en el Registro del menú
 * de depuración (canal `audio`), con la traza activada — un solo texto, los
 * dos lados; el anillo del registro decide cuántas conserva.
 */
export function audioTrace(...args: unknown[]): void {
  if (!active()) return;
  // El texto se compone una vez sin estilos: la consola recibe el color
  // aparte y el registro el texto plano igual al que se ve en consola.
  const text = args
    .map((value) => (typeof value === "string" ? value : JSON.stringify(value) ?? String(value)))
    .join(" ");
  console.info(MARK, STYLE, ...args);
  publishDebugLog("audio", `[audio] ${text}`);
}

/** Igual pero evoca console.trace para la pila completa desplegable. */
export function audioTraceStack(message: string): void {
  if (!active()) return;
  console.groupCollapsed(MARK, STYLE, message);
  console.trace();
  console.groupEnd();
  // Aunque la pila quedase plegable solo en consola, el mensaje entra al
  // registro: los alias que silencian son los más útiles y curiosos ahí.
  publishDebugLog("audio", `[audio] ${message} (pila en la consola)`);
}

/** Banner de arranque: distingue «sin trazas» (no activas) de «trazas caídas». */
if (active()) {
  console.info(MARK, STYLE, "trazas activas (?traceAudio) — el rastro del sampler/transporte/robot aparecerá al empezar la práctica");
}
