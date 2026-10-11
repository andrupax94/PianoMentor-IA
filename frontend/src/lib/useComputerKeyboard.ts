// description: Hook del teclado del PC (keydown/keyup por e.code) con octava móvil.
// context: B-007.2; emite eventos de nota para audición y resaltado; B-013 los evaluará.

import { useEffect, useRef, useState } from "react";

import {
  AUDITION_VELOCITY,
  clampOctave,
  DEFAULT_OCTAVE,
  OCTAVE_DOWN_CODES,
  OCTAVE_UP_CODES,
  pcCodeToPitch,
  shiftOctave,
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
 */
export function useComputerKeyboard(options: UseComputerKeyboardOptions = {}) {
  const { onNoteOn, onNoteOff, initialOctave = DEFAULT_OCTAVE, enabled = true } = options;
  const [octave, setOctaveState] = useState(() => clampOctave(initialOctave));
  const liveRef = useRef({
    octave: clampOctave(initialOctave),
    onNoteOn,
    onNoteOff,
    enabled,
    held: new Map<string, number>(),
  });
  liveRef.current = {
    octave,
    onNoteOn,
    onNoteOff,
    enabled,
    held: liveRef.current.held,
  };

  useEffect(() => {
    if (!enabled) return;

    const shift = (delta: number) => {
      setOctaveState((previous) => {
        const next = shiftOctave(previous, delta);
        liveRef.current.octave = next;
        return next;
      });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const live = liveRef.current;
      if (!live.enabled || isTypingTarget(event.target)) return;
      if ((OCTAVE_UP_CODES as readonly string[]).includes(event.code)) {
        event.preventDefault();
        shift(1);
        return;
      }
      if ((OCTAVE_DOWN_CODES as readonly string[]).includes(event.code)) {
        event.preventDefault();
        shift(-1);
        return;
      }
      if (event.repeat || live.held.has(event.code)) return;
      const pitch = pcCodeToPitch(event.code, live.octave);
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

  return { octave };
}
