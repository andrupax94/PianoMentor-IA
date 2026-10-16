"use client";
// description: Columna principal: transporte de reproducción y piano.
// context: B-007.3; dueño de usePlayback. PlayerBar y PianoStage son hermanos y
// necesitan la misma posición y el mismo schedule, así que el transporte nace aquí.
// La pieza demo se retira con B-008/B-012 (aún no hay selección de pieza).
//
// Es componente cliente porque el transporte vive en el navegador; page.tsx sigue
// siendo Server Component y no arrastra AppHeader ni MentorPanel al bundle cliente.

import { useEffect } from "react";

import { getPieceNotes } from "../../lib/api-client";
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

  useEffect(() => {
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
  }, [load]);

  return (
    <div className={styles.area}>
      <PlayerBar player={player} />
      <PianoStage player={player} octaves={octaves} />
    </div>
  );
}
