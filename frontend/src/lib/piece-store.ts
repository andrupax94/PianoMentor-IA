// description: Almacén de la pieza que debe sonar en el piano (B-027.3).
// context: El subidor y la Library publican y PlaybackArea se suscribe, igual que el
// rango visible del teclado. Vive solo en memoria del navegador: al recargar se pierde
// y vuelve la pieza demo, porque nada de esto se persiste.

import type { PieceMeasures, PlayableNote } from "./api-client";

/** Partitura efímera subida a mano: viaja entera, sin tocar el catálogo. */
export interface UploadedScore {
  kind: "upload";
  /** Nombre del archivo elegido, para mostrarlo en la interfaz. */
  filename: string;
  /** Tempo inicial del MIDI en BPM; null si el motor no lo sirve. */
  tempo: number | null;
  /** Duración del transporte en segundos; null si el motor no la sirve. */
  duration_seconds: number | null;
  /** Rejilla de compases para situar el compás actual; null si no hay. */
  measures: PieceMeasures | null;
  notes: PlayableNote[];
}

/** Pieza del catálogo elegida desde la Library: la partitura la pide el piano. */
export interface CatalogScore {
  kind: "catalog";
  /** Id en el catálogo; el piano pide sus notas con GET /pieces/{id}/notes. */
  id: string;
  /** Título con el que la barra del reproductor anuncia la pieza. */
  title: string;
  /** Ruta pública de la portada para esa misma barra; null si la pieza no la tiene. */
  cover: string | null;
}

/** Pieza que el piano debe cargar. Las interfaces completas van en el catálogo. */
export type PianoPiece = (UploadedScore | CatalogScore) & {
  /**
   * true cuando la pieza llega "para sonar": el piano la carga y arranca solo.
   * Con false (u omitido) queda cargada y espera al botón de reproducir.
   */
  autoPlay?: boolean;
};

let current: PianoPiece | null = null;
const listeners = new Set<() => void>();

/** Pieza vigente; null mientras no se haya elegido ninguna. Referencia estable entre publicaciones. */
export function getPianoPiece(): PianoPiece | null {
  return current;
}

/** Se suscribe a cambios; devuelve la función de baja. */
export function subscribePianoPiece(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Publica la pieza a reproducir; con null se vuelve a la pieza demo. */
export function publishPianoPiece(piece: PianoPiece | null): void {
  if (piece === current) return;
  current = piece;
  listeners.forEach((listener) => listener());
}
