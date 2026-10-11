"use client";
// description: Teclado del escenario (SVG real + transporte + teclado del PC).
// context: B-007.2; el PianoKeyboard temporal se elimina en B-007.4.

import { useEffect, useMemo, useState } from "react";

import { getPieceNotes } from "../../../lib/api-client";
import { expectedKeyIds, soundingKeyIds } from "../../../lib/key-states";
import { buildSchedule } from "../../../lib/playback-schedule";
import { pitchToKeyId } from "../../../lib/pitch";
import { AUDITION_VELOCITY, pcKeyLabels } from "../../../lib/pc-keyboard";
import { useComputerKeyboard } from "../../../lib/useComputerKeyboard";
import { usePlayback } from "../../../lib/usePlayback";
import { useResponsiveRange } from "../../../lib/useResponsiveRange";
import { SvgKeyboard } from "./SvgKeyboard/SvgKeyboard";
import styles from "./Keyboard.module.css";
import type { KeyboardProps } from "./Keyboard.types";

/** Pieza demo hasta B-008/B-012 (aún no hay selección de pieza). */
const DEMO_PIECE_ID = "p01";
/** Horizonte de nota esperada en segundos de partitura. */
const EXPECTED_HORIZON_S = 2.0;

export function Keyboard({ children }: KeyboardProps) {
  const player = usePlayback();
  const [playedIds, setPlayedIds] = useState<string[]>([]);
  const { auditionOn, auditionOff } = player;

  useEffect(() => {
    let cancelled = false;
    getPieceNotes(DEMO_PIECE_ID)
      .then((score) => {
        if (cancelled) return;
        player.load(score.notes, {
          tempo_bpm: score.tempo ?? undefined,
          duration_s: score.duration_seconds ?? undefined,
        });
      })
      .catch(() => {
        // Sin pieza demo no hay resaltado; la página sigue funcionando.
      });
    return () => {
      cancelled = true;
    };
    // load es estable; se carga una sola vez al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { octave } = useComputerKeyboard({
    onNoteOn: ({ pitch }) => {
      auditionOn(pitch, AUDITION_VELOCITY);
      const id = pitchToKeyId(pitch);
      setPlayedIds((previous) => (previous.includes(id) ? previous : [...previous, id]));
    },
    onNoteOff: (pitch) => {
      auditionOff(pitch);
      const id = pitchToKeyId(pitch);
      setPlayedIds((previous) => previous.filter((current) => current !== id));
    },
  });

  // Etiquetas de tecla del PC sobre el piano; cambian con la octava activa.
  const labels = useMemo(() => pcKeyLabels(octave), [octave]);

  // Rango de octavas responsive: se mide el ancho del contenedor del teclado.
  const { ref: keyboardRef, fromKey, toKey } = useResponsiveRange<HTMLDivElement>();

  // El schedule solo se reconstruye al cambiar de pieza o de factor (no en cada tick).
  const schedule = useMemo(
    () => buildSchedule(player.notes, player.tempoFactor),
    [player.notes, player.tempoFactor],
  );
  const sounding = player.status === "stopped" ? [] : soundingKeyIds(schedule, player.position_s);
  const expected =
    player.status === "stopped" ? [] : expectedKeyIds(schedule, player.position_s, EXPECTED_HORIZON_S);
  const active = [...sounding, ...playedIds.filter((id) => !sounding.includes(id))];

  return (
    <div ref={keyboardRef} className={styles.keyboard}>
      {children ?? (
        <SvgKeyboard activeIds={active} expectedIds={expected} labels={labels} fromKey={fromKey} toKey={toKey} />
      )}
    </div>
  );
}
