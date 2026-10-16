"use client";
// description: Columna principal: transporte de reproducción y piano.
// context: B-007.3; dueño de usePlayback. PlayerBar y PianoStage son hermanos y
// necesitan la misma posición y el mismo schedule, así que el transporte nace aquí.
// Si hay una pieza subida a mano manda ella (B-027.3); si no, suena la demo
// hasta que B-012 traiga la selección desde la Library.
//
// Es componente cliente porque el transporte vive en el navegador; page.tsx sigue
// siendo Server Component y no arrastra AppHeader ni MentorPanel al bundle cliente.

import { useEffect, useSyncExternalStore } from "react";

import { getPieceNotes } from "../../lib/api-client";
import { getUploadedPiece, subscribeUploadedPiece } from "../../lib/piece-store";
import { usePlayback } from "../../lib/usePlayback";
import { PlayerBar } from "../PlayerBar/PlayerBar";
import { PianoStage } from "../PianoStage/PianoStage";
import styles from "./PlaybackArea.module.css";
import type { PlaybackAreaProps } from "./PlaybackArea.types";

/** Pieza demo hasta B-008/B-012 (aún no hay selección de pieza). */
const DEMO_PIECE_ID = "p01";

export function PlaybackArea({ octaves = ["C1", "C2", "C3"] }: PlaybackAreaProps) {
  const player = usePlayback();
  const { load } = player;
  // La pieza subida a mano llega por el almacén: el subidor puede estar en la
  // Library y, tras navegar, el transporte la encuentra ya puesta.
  const uploaded = useSyncExternalStore(subscribeUploadedPiece, getUploadedPiece, getUploadedPiece);

  useEffect(() => {
    if (!uploaded) return;
    load(uploaded.notes, {
      tempo_bpm: uploaded.tempo ?? undefined,
      duration_s: uploaded.duration_seconds ?? undefined,
      measures: uploaded.measures,
    });
  }, [load, uploaded]);

  useEffect(() => {
    if (uploaded) return;
    let cancelled = false;
    getPieceNotes(DEMO_PIECE_ID)
      .then((score) => {
        if (cancelled) return;
        load(score.notes, {
          tempo_bpm: score.tempo ?? undefined,
          duration_s: score.duration_seconds ?? undefined,
          measures: score.measures,
        });
      })
      .catch(() => {
        // Sin pieza demo no hay resaltado ni cascada; la página sigue funcionando.
      });
    return () => {
      cancelled = true;
    };
  }, [load, uploaded]);

  return (
    <div className={styles.area}>
      {/* Con una pieza cargada a mano, la barra anuncia su archivo en vez del marcador. */}
      <PlayerBar player={player} songTitle={uploaded?.filename} />
      <PianoStage player={player} octaves={octaves} />
    </div>
  );
}
