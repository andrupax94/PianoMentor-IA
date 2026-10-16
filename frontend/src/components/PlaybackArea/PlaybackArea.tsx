"use client";
// description: Columna principal: transporte de reproducción y piano.
// context: B-007.3; dueño de usePlayback. PlayerBar y PianoStage son hermanos y
// necesitan la misma posición y el mismo schedule, así que el transporte nace aquí.
// Manda la pieza publicada en el almacén —subida a mano o elegida en la Library—;
// sin ninguna, suena la demo.
//
// Es componente cliente porque el transporte vive en el navegador; page.tsx sigue
// siendo Server Component y no arrastra AppHeader ni MentorPanel al bundle cliente.

import { useEffect, useSyncExternalStore } from "react";

import { getPieceNotes } from "../../lib/api-client";
import { getPianoPiece, subscribePianoPiece } from "../../lib/piece-store";
import { usePlayback } from "../../lib/usePlayback";
import { PlayerBar } from "../PlayerBar/PlayerBar";
import { PianoStage } from "../PianoStage/PianoStage";
import styles from "./PlaybackArea.module.css";
import type { PlaybackAreaProps } from "./PlaybackArea.types";

/** Pieza demo hasta B-008/B-012 (aún no hay sesión con pieza elegida). */
const DEMO_PIECE_ID = "p01";

export function PlaybackArea({ octaves = ["C1", "C2", "C3"] }: PlaybackAreaProps) {
  const player = usePlayback();
  const { load, play } = player;
  // La pieza llega por el almacén: quien la elige puede estar en la Library y,
  // tras navegar, el transporte la encuentra ya puesta.
  const piece = useSyncExternalStore(subscribePianoPiece, getPianoPiece, getPianoPiece);

  useEffect(() => {
    // Partitura ya en memoria (subida a mano): se carga tal cual, sin backend.
    if (piece?.kind === "upload") {
      load(piece.notes, {
        tempo_bpm: piece.tempo ?? undefined,
        duration_s: piece.duration_seconds ?? undefined,
        measures: piece.measures,
      });
      if (piece.autoPlay) void play().catch(() => undefined);
      return;
    }

    // Del catálogo (o la demo): la partitura la sirve el backend.
    let cancelled = false;
    const pieceId = piece?.kind === "catalog" ? piece.id : DEMO_PIECE_ID;
    const autoPlay = piece?.kind === "catalog" && piece.autoPlay === true;
    getPieceNotes(pieceId)
      .then((score) => {
        if (cancelled) return;
        load(score.notes, {
          tempo_bpm: score.tempo ?? undefined,
          duration_s: score.duration_seconds ?? undefined,
          measures: score.measures,
        });
        if (autoPlay) void play().catch(() => undefined);
      })
      .catch(() => {
        // Sin partitura no hay resaltado ni cascada; la página sigue funcionando.
      });
    return () => {
      cancelled = true;
    };
  }, [load, play, piece]);

  // La barra anuncia el nombre del archivo o el título elegido en la Library.
  const songTitle =
    piece === null ? undefined : piece.kind === "upload" ? piece.filename : piece.title;

  return (
    <div className={styles.area}>
      <PlayerBar player={player} songTitle={songTitle} />
      <PianoStage player={player} octaves={octaves} />
    </div>
  );
}
