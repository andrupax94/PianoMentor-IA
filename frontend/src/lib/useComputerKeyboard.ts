// description: Adaptador del teclado del PC al puerto de entrada (B-032.2): mapa clásico de una ventana o distribución partida de dos manos ajustada a la pieza, con octava móvil y etiquetas para pintar el piano.
// context: B-007.2/B-032.2; captura keydown/keyup por `e.code`, ignora repeticiones y focos de escritura, y solo emite notas: el audio y el envío a la sesión salen del mismo evento en note-input. La distribución partida usa `[` y `]` para mover sus dos ventanas; el mapa clásico sigue con Z/X y flechas.

import { useEffect, useMemo, useRef, useState } from "react";

import {
  AUDITION_VELOCITY,
  clampOctave,
  clampSplitShift,
  DEFAULT_OCTAVE,
  OCTAVE_DOWN_CODES,
  OCTAVE_UP_CODES,
  pcCodeToPitch,
  pcKeyLabels,
  shiftOctave,
  SPLIT_OCTAVE_DOWN_CODES,
  SPLIT_OCTAVE_UP_CODES,
  splitLayoutFor,
  type HandRanges,
  type PcKeyLayout,
} from "./pc-keyboard";

export interface ComputerNoteEvent {
  pitch: number;
  velocity: number;
}

export interface UseComputerKeyboardOptions {
  onNoteOn?: (event: ComputerNoteEvent) => void;
  onNoteOff?: (pitch: number) => void;
  initialOctave?: number;
  enabled?: boolean;
  /**
   * Manos de la pieza (B-032.2). Con las dos, el teclado pasa a la distribución
   * partida; sin ellas, al mapa clásico de una sola ventana.
   */
  hands?: HandRanges | null;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}

/**
 * Captura el teclado del PC (distribución GarageBand: blancas A–;, negras
 * W E T Y U O P), Z/X o flechas para cambiar de octava, e ignora
 * repeticiones por tecla mantenida y focos de escritura.
 *
 * Con `hands` (B-032.2) manda la distribución partida: una ventana por mano,
 * izquierda en la fila inferior y derecha en la superior, y `[`/`]` mueven las
 * dos ventanas por octavas.
 */
export function useComputerKeyboard(options: UseComputerKeyboardOptions = {}) {
  const { onNoteOn, onNoteOff, initialOctave = DEFAULT_OCTAVE, enabled = true, hands = null } =
    options;
  const [octave, setOctaveState] = useState(() => clampOctave(initialOctave));
  const [splitShift, setSplitShiftState] = useState(0);

  const layout = useMemo<PcKeyLayout | null>(
    () => splitLayoutFor(hands?.left ?? null, hands?.right ?? null, splitShift),
    [hands, splitShift],
  );

  // Etiquetas del piano: las de la distribución partida o las del mapa clásico.
  const labels = useMemo(
    () => (layout ? layout.labels : pcKeyLabels(octave)),
    [layout, octave],
  );

  const liveRef = useRef({
    octave: clampOctave(initialOctave),
    layout,
    onNoteOn,
    onNoteOff,
    enabled,
    held: new Map<string, number>(),
  });
  liveRef.current = {
    octave,
    layout,
    onNoteOn,
    onNoteOff,
    enabled,
    held: liveRef.current.held,
  };

  useEffect(() => {
    if (!enabled) return;

    const shiftOctaveBy = (delta: number) => {
      setOctaveState((previous) => {
        const next = shiftOctave(previous, delta);
        liveRef.current.octave = next;
        return next;
      });
    };

    const shiftSplitBy = (delta: number) => {
      setSplitShiftState((previous) => clampSplitShift(previous + delta));
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const live = liveRef.current;
      if (!live.enabled || isTypingTarget(event.target)) return;
      if ((SPLIT_OCTAVE_UP_CODES as readonly string[]).includes(event.code)) {
        event.preventDefault();
        shiftSplitBy(1);
        return;
      }
      if ((SPLIT_OCTAVE_DOWN_CODES as readonly string[]).includes(event.code)) {
        event.preventDefault();
        shiftSplitBy(-1);
        return;
      }
      if ((OCTAVE_UP_CODES as readonly string[]).includes(event.code)) {
        event.preventDefault();
        shiftOctaveBy(1);
        return;
      }
      if ((OCTAVE_DOWN_CODES as readonly string[]).includes(event.code)) {
        event.preventDefault();
        shiftOctaveBy(-1);
        return;
      }
      if (event.repeat || live.held.has(event.code)) return;
      const pitch = live.layout
        ? (live.layout.bindings[event.code] ?? null)
        : pcCodeToPitch(event.code, live.octave);
      if (pitch === null) return;
      live.held.set(event.code, pitch);
      live.onNoteOn?.({ pitch, velocity: AUDITION_VELOCITY });
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const live = liveRef.current;
      const pitch = live.held.get(event.code);
      if (pitch === undefined) return;
      live.held.delete(event.code);
      live.onNoteOff?.(pitch);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      liveRef.current.held.clear();
    };
  }, [enabled]);

  return { octave, labels, split: layout !== null };
}
