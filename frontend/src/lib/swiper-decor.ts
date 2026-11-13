// description: Cargador de Swiper para el carrusel decorativo del panel (B-023): import dinámico de ESM — CDN primero (jsDelivr, fuera del bundle de Vercel) con respaldo del fichero local /vendor/swiper/swiper-bundle.esm.mjs si la CDN falla. El bundle completo trae TODOS los módulos registrados (coverflow, autoplay…) y exporta Swiper: el objeto llega del propio import, sin depender de globals.
// context: Decisión del usuario (opción B): la librería no viaja en el bundle de la app — se carga en runtime. Los comentarios webpackIgnore/turbopackIgnore son obligatorios para que Next no intente resolver URLs externas en build. El CSS viaja por <link> en el mismo orden CDN → local (el JS de Swiper no lo inyecta). El único consumidor es MentorDecor (carrusel de carátulas de compositores), que solo se monta sin sesión con la subida de MIDI apagada: en sesiones nunca se carga.

/** CDN pública de Swiper 11 autocontenida (/+esm: un solo fichero con todo). */
export const URL_SWIPER_CDN =
  "https://cdn.jsdelivr.net/npm/swiper@11.2.10/swiper-bundle.mjs/+esm";

/** Respaldo servido desde /public si la CDN no responde (el mismo /+esm guardado). */
export const URL_SWIPER_LOCAL = "/vendor/swiper/swiper-bundle.esm.mjs";

/** El CSS del carrusel viaja aparte (el JS no lo inyecta): mismo orden CDN → local. */
export const URL_SWIPER_CSS_CDN =
  "https://cdn.jsdelivr.net/npm/swiper@11.2.10/swiper-bundle.min.css";
export const URL_SWIPER_CSS_LOCAL = "/vendor/swiper/swiper-bundle.min.css";

/** El usuario pide menos movimiento si su sistema lo pide: sin autoplay. */
export function prefiereMenosMovimiento(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export interface SwiperInstancia {
  destroy(deleteStyles?: boolean): void;
}

export interface SwiperConstructor {
  new (element: HTMLElement, params: Record<string, unknown>): SwiperInstancia;
}

function cargarEstilos(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const enlace = document.createElement("link");
    enlace.rel = "stylesheet";
    enlace.href = url;
    enlace.onload = () => resolve();
    enlace.onerror = () => {
      enlace.remove();
      reject(new Error(`No se pudo cargar el CSS de Swiper (${url})`));
    };
    document.head.appendChild(enlace);
  });
}

/** Importa el módulo y saca el constructor (default o Swiper, según el build). */
async function importarSwiper(url: string): Promise<SwiperConstructor> {
  // webpackIgnore/turbopackIgnore: la URL es runtime, no del bundle.
  const modulo = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url)) as {
    Swiper?: SwiperConstructor;
    default?: SwiperConstructor;
  };
  const constructor = modulo.Swiper ?? modulo.default;
  if (!constructor) {
    throw new Error(`Swiper cargó ${url} pero no exportó el constructor`);
  }
  return constructor;
}

let carga: Promise<SwiperConstructor> | null = null;

/** Carga Swiper una sola vez: CDN y, si falla, el fichero local (CSS + módulo). */
export function cargarSwiper(): Promise<SwiperConstructor> {
  carga ??= (async () => {
    if (typeof window === "undefined") {
      throw new Error("cargarSwiper solo corre en el navegador");
    }
    let fallo: unknown = null;
    for (const { css, js } of [
      { css: URL_SWIPER_CSS_CDN, js: URL_SWIPER_CDN },
      { css: URL_SWIPER_CSS_LOCAL, js: URL_SWIPER_LOCAL },
    ]) {
      try {
        await cargarEstilos(css);
        return await importarSwiper(js);
      } catch (exc) {
        fallo = exc;
      }
    }
    throw fallo instanceof Error ? fallo : new Error("Swiper no pudo cargarse");
  })();
  return carga;
}

/** Cancela la promesa pendiente (solo tests: evita estado entre tests). */
export function resetearCargaSwiper(): void {
  carga = null;
}
