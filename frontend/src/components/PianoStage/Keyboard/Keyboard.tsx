// description: Teclado del escenario: recibe el transporte por props, entrega al SvgKeyboard las teclas sonando y añade el teclado del PC.
// context: B-007.4 jubiló el PianoKeyboard temporal: sin vía de inyección, el teclado SVG es el único render. D-002.4 retiró el aviso de nota esperada; Keyboard solo pasa soundingKeyIds.

"use client";

import { useMemo, useState } from "react";

import { soundingKeyIds } from "../../../lib/key-states";
import { pitchToKeyId } from "../../../lib/pitch";
import { AUDITION_VELOCITY, pcKeyLabels } from "../../../lib/pc-keyboard";
import { useComputerKeyboard } from "../../../lib/useComputerKeyboard";
import { useResponsiveRange } from "../../../lib/useResponsiveRange";
import { useVisibleRange } from "../../../lib/useVisibleRange";
import { SvgKeyboard } from "./SvgKeyboard/SvgKeyboard";
import styles from "./Keyboard.module.css";
import type { KeyboardProps } from "./Keyboard.types";

export function Keyboard({ player, schedule }: KeyboardProps) {
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

  // D-002.4: el teclado ya no avisa de la "nota próxima" (eso lo cuenta la
  // cascada); solo se marca la tecla que suena o la que se toca a mano.
  const sounding = status === "stopped" ? [] : soundingKeyIds(schedule, position_s);
  const active = [...sounding, ...playedIds.filter((id) => !sounding.includes(id))];

  return (
    <div ref={keyboardRef} className={styles.keyboard}>
      <SvgKeyboard activeIds={active} labels={labels} fromKey={fromKey} toKey={toKey} />
    </div>
  );
}
