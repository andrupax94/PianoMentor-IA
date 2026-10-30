"use client";
// description: Contenedor del piano completo (cuadrícula + teclado), con la mano de la IA del acompañamiento teñida en la cascada (B-012.7).
// context: B-007.3; es una vista del transporte que nace en PlaybackArea: sus dos
// hijos son hermanos y por eso comparten posición y schedule por props.

import { useMemo } from "react";

import { buildSchedule } from "../../lib/playback-schedule";
import { Keyboard } from "./Keyboard/Keyboard";
import { NoteFallGrid } from "./NoteFallGrid/NoteFallGrid";
import styles from "./PianoStage.module.css";
import type { PianoStageProps } from "./PianoStage.types";

export function PianoStage({
  player,
  octaves = ["C1", "C2", "C3"],
  agentHand = null,
}: PianoStageProps) {
  // El schedule solo se reconstruye al cambiar de pieza o de factor (no en cada tick).
  const schedule = useMemo(
    () => buildSchedule(player.notes, player.tempoFactor),
    [player.notes, player.tempoFactor],
  );

  return (
    <section className={styles.stage} aria-label="Piano">
      <NoteFallGrid
        octaves={octaves}
        schedule={schedule}
        status={player.status}
        getPosition={player.getPosition}
        agentHand={agentHand}
      />
      <Keyboard player={player} schedule={schedule} />
    </section>
  );
}
