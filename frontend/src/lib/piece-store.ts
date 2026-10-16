// description: Almacén de la pieza MIDI subida a mano para escucharla en el piano (B-027.3).
// context: El subidor la publica y PlaybackArea se suscribe, igual que el rango
// visible del teclado. Vive solo en memoria del navegador: al recargar se pierde
// y vuelve la pieza demo, porque nada de esto se persiste.

import type { PieceMeasures, PlayableNote } from "./api-client";

/** Partitura efímera que el piano reproduce sin pasar por el catálogo. */
export interface UploadedPiece {
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

let current: UploadedPiece | null = null;
const listeners = new Set<() => void>();

/** Pieza vigente; null mientras no se haya subido ninguna. Referencia estable entre publicaciones. */
export function getUploadedPiece(): UploadedPiece | null {
  return current;
}

/** Se suscribe a cambios; devuelve la función de baja. */
export function subscribeUploadedPiece(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Publica la pieza a reproducir; con null se vuelve a la pieza demo. */
export function publishUploadedPiece(piece: UploadedPiece | null): void {
  if (piece === current) return;
  current = piece;
  listeners.forEach((listener) => listener());
}
