// description: Teclado del escenario: recibe el transporte por props, entrega al SvgKeyboard las teclas sonando y las letras del teclado del PC, y emite por el puerto de entrada lo que se toca con el puntero (B-032.2).
// context: B-007.4 jubiló el PianoKeyboard temporal: sin vía de inyección, el teclado SVG es el único render. D-002.4 retiró el aviso de nota esperada. Desde B-032.2 el teclado no captura el PC (lo hace TransportProvider) ni suena por su cuenta: publica note_on/note_off en note-input, y de ahí salen el audio y el envío a la sesión. En práctica el rango visible se ensancha para que la cascada pinte la pieza entera.

"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { soundingKeyIds } from "../../../lib/key-states";
import {
  emitNoteOff,
  emitNoteOn,
  subscribeNoteInput,
  subscribeNoteInputGate,
} from "../../../lib/note-input";
import { pitchToKeyId } from "../../../lib/pitch";
import { AUDITION_VELOCITY } from "../../../lib/pc-keyboard";
import {
  EMPTY_PC_KEYBOARD,
  getPcKeyboardState,
  subscribePcKeyboard,
} from "../../../lib/pc-keyboard-store";
import { getSessionSnapshot, subscribeSession } from "../../../lib/session-store";
import { useResponsiveRange } from "../../../lib/useResponsiveRange";
import { useVisibleRange } from "../../../lib/useVisibleRange";
import { pitchSpan } from "../../../lib/visible-range";
import { SvgKeyboard } from "./SvgKeyboard/SvgKeyboard";
import styles from "./Keyboard.module.css";
import type { KeyboardProps } from "./Keyboard.types";

/** Foto del servidor: el mismo objeto, como exige useSyncExternalStore. */
const SERVER_PC_KEYBOARD = () => EMPTY_PC_KEYBOARD;

export function Keyboard({ player, schedule }: KeyboardProps) {
  const [playedIds, setPlayedIds] = useState<string[]>([]);
  const { position_s, status, notes } = player;

  // Letras del PC que pinta el piano: las publica TransportProvider, que es
  // quien captura el teclado (mapa clásico o distribución partida).
  const pcKeyboard = useSyncExternalStore(
    subscribePcKeyboard,
    getPcKeyboardState,
    SERVER_PC_KEYBOARD,
  );

  // Resaltado de lo que se toca, venga del PC, del puntero o de Web MIDI.
  useEffect(
    () =>
      subscribeNoteInput({
        onNoteOn: ({ pitch }) => {
          const id = pitchToKeyId(pitch);
          setPlayedIds((previous) =>
            previous.includes(id) ? previous : [...previous, id],
          );
        },
        onNoteOff: ({ pitch }) => {
          const id = pitchToKeyId(pitch);
          setPlayedIds((previous) => previous.filter((current) => current !== id));
        },
      }),
    [],
  );

  // Si la puerta se cierra (demostración del agente), no queda nada hundido.
  useEffect(
    () =>
      subscribeNoteInputGate((enabled) => {
        if (!enabled) setPlayedIds([]);
      }),
    [],
  );

  // Rango de octavas responsive: se mide el ancho del contenedor del teclado.
  // En práctica se ensancha lo justo para cubrir la pieza (B-032.2).
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot, getSessionSnapshot);
  const span = useMemo(
    () => (session.sessionId ? pitchSpan(notes) : null),
    [session.sessionId, notes],
  );
  const { ref: keyboardRef } = useResponsiveRange<HTMLDivElement>(span);
  const { fromKey, toKey } = useVisibleRange();

  // El piano en pantalla no suena aquí: publica en el puerto y TransportProvider
  // suena lo mismo que PracticeBridge manda a la sesión.
  const handleKeyDown = useCallback((pitch: number) => {
    emitNoteOn({ pitch, velocity: AUDITION_VELOCITY, source: "screen" });
  }, []);
  const handleKeyUp = useCallback((pitch: number) => {
    emitNoteOff({ pitch, velocity: 0, source: "screen" });
  }, []);

  // D-002.4: el teclado ya no avisa de la "nota próxima" (eso lo cuenta la
  // cascada); solo se marca la tecla que suena o la que se toca a mano.
  const sounding = status === "stopped" ? [] : soundingKeyIds(schedule, position_s);
  const active = [...sounding, ...playedIds.filter((id) => !sounding.includes(id))];

  return (
    <div ref={keyboardRef} className={styles.keyboard}>
      <SvgKeyboard
        activeIds={active}
        labels={pcKeyboard.labels}
        fromKey={fromKey}
        toKey={toKey}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
      />
    </div>
  );
}
