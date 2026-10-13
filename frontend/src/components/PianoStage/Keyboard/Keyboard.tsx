"use client";
// description: Teclado del escenario (SVG real + transporte + teclado del PC).
// context: B-007.3; el transporte vive en PianoStage y llega por props, porque el
// NoteFallGrid (su hermano) necesita la misma posición y el mismo schedule. El
// PianoKeyboard temporal se elimina en B-007.4.

import { useMemo, useState } from "react";

import { expectedKeyIds, HORIZON_S, soundingKeyIds } from "../../../lib/key-states";
import { pitchToKeyId } from "../../../lib/pitch";
import { AUDITION_VELOCITY, pcKeyLabels } from "../../../lib/pc-keyboard";
import { useComputerKeyboard } from "../../../lib/useComputerKeyboard";
import { useResponsiveRange } from "../../../lib/useResponsiveRange";
import { useVisibleRange } from "../../../lib/useVisibleRange";
import { SvgKeyboard } from "./SvgKeyboard/SvgKeyboard";
import styles from "./Keyboard.module.css";
import type { KeyboardProps } from "./Keyboard.types";

export function Keyboard({ player, schedule, children }: KeyboardProps) {
  const [playedIds, setPlayedIds] = useState<string[]>([]);
  const { auditionOn, auditionOff, position_s, status } = player;

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
  // El hook publica el rango; de aquí lo lee el NoteFallGrid para su cuadrícula.
  const { ref: keyboardRef } = useResponsiveRange<HTMLDivElement>();
  const { fromKey, toKey } = useVisibleRange();

  const sounding = status === "stopped" ? [] : soundingKeyIds(schedule, position_s);
  const expected =
    status === "stopped" ? [] : expectedKeyIds(schedule, position_s, HORIZON_S);
  const active = [...sounding, ...playedIds.filter((id) => !sounding.includes(id))];

  return (
    <div ref={keyboardRef} className={styles.keyboard}>
      {children ?? (
        <SvgKeyboard activeIds={active} expectedIds={expected} labels={labels} fromKey={fromKey} toKey={toKey} />
      )}
    </div>
  );
}
