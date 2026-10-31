// description: Pieza que la sesión manda al piano (B-032.1): publica la pieza elegida en la Library al abrir la práctica y reconcilia el almacén con el `piece_id` de la sesión por id, no por referencia, para no recargar la partitura en cada mensaje de estado.
// context: "Practicar esta pieza" publica antes de navegar y PracticeBridge reconcilia al recibir el primer `state` (URL directa, F5). No existe GET /pieces/{id}: el título y la portada se resuelven con un resolvedor inyectado (fetchPieceInfo, B-012.8) y, si no está en el catálogo, la pieza se publica con el id y sin portada.

import { getPianoPiece, publishPianoPiece } from "./piece-store";
import type { PianoPiece } from "./piece-store";

/** Título y portada de una pieza del catálogo, resueltos fuera de este módulo. */
export interface SessionPieceInfo {
  title: string;
  cover: string | null;
}

/** Resuelve título y portada de una pieza; en la app es `fetchPieceInfo`. */
export type SessionPieceResolver = (pieceId: string) => Promise<SessionPieceInfo>;

/** Pieza que representa a la sesión: del catálogo, cargada y sin arrancar sola. */
export function pieceForSession(pieceId: string, info: SessionPieceInfo): PianoPiece {
  return {
    kind: "catalog",
    id: pieceId,
    title: info.title,
    cover: info.cover,
    autoPlay: false,
  };
}

/** true si el almacén ya tiene la pieza de la sesión (por id, no por referencia). */
export function isPieceOfSession(piece: PianoPiece | null, pieceId: string): boolean {
  return piece !== null && piece.kind === "catalog" && piece.id === pieceId;
}

/**
 * Publica la pieza elegida en la Library antes de navegar a la sesión: el piano
 * la encuentra cargada y parada (`autoPlay: false`), lista para practicar.
 * Reutiliza el mismo almacén que «Continuar en Learn» (B-027.3).
 */
export function publishPracticePiece(song: {
  id: string;
  title: string;
  cover: string | null;
}): void {
  publishPianoPiece({
    kind: "catalog",
    id: song.id,
    title: song.title,
    cover: song.cover,
    autoPlay: false,
  });
}

/**
 * Reconcilia el almacén con la pieza de la sesión. Devuelve true si publicó.
 *
 * Idempotente por id: `publishPianoPiece` solo descarta la misma referencia y
 * `PlaybackArea` recarga la partitura cuando cambia la identidad de la pieza,
 * así que publicar un objeto nuevo en cada mensaje de `state` la recargaría en
 * bucle. Se vuelve a comprobar después del `await` porque dos mensajes de
 * estado seguidos pueden coincidir mientras se resuelve el título.
 */
export async function syncSessionPiece(
  pieceId: string,
  resolve: SessionPieceResolver,
): Promise<boolean> {
  if (isPieceOfSession(getPianoPiece(), pieceId)) return false;
  const info = await resolve(pieceId);
  if (isPieceOfSession(getPianoPiece(), pieceId)) return false;
  publishPianoPiece(pieceForSession(pieceId, info));
  return true;
}
