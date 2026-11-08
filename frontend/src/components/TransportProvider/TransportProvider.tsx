// description: Provider del transporte único de la portada (B-032.2): crea el reproductor una sola vez, captura el teclado del PC, suena lo que llega por el puerto de entrada y engancha Web MIDI.
// context: Vive en app/(home)/layout.tsx envolviendo PlaybackArea y {children}, así que no se remonta al navegar entre / y /{id}: el reloj es el mismo para el piano y para la sesión. El audio local y el envío al WebSocket salen del mismo evento de note-input; la puerta que cierra PracticeBridge durante una demostración corta ambos. La distribución partida se activa con una sesión abierta y las dos manos de la pieza cargada.

"use client";

import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";

import {
  emitNoteOff,
  emitNoteOn,
  subscribeNoteInput,
  subscribeNoteInputGate,
} from "../../lib/note-input";
import { handRanges } from "../../lib/pc-keyboard";
import { publishPcKeyboard } from "../../lib/pc-keyboard-store";
import { getSessionSnapshot, subscribeSession } from "../../lib/session-store";
import { TransportContext } from "../../lib/transport-context";
import { useComputerKeyboard } from "../../lib/useComputerKeyboard";
import { usePlayback } from "../../lib/usePlayback";
import { connectWebMidi, requestWebMidi, type MidiAccessLike } from "../../lib/web-midi";
import { syncMidiFromAccess, updateMidi } from "../../lib/midi-store";

export function TransportProvider({ children }: { children: ReactNode }) {
  const player = usePlayback();
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot, getSessionSnapshot);
  const inSession = session.sessionId !== null;

  // Manos de la pieza cargada: con las dos, el teclado del PC se parte en dos
  // ventanas (B-032.2). Sin sesión manda el mapa clásico de una sola ventana.
  const hands = useMemo(
    () => (inSession ? handRanges(player.notes) : null),
    [inSession, player.notes],
  );

  const keyboard = useComputerKeyboard({
    hands,
    onNoteOn: ({ pitch, velocity }) => emitNoteOn({ pitch, velocity, source: "pc" }),
    onNoteOff: (pitch) => emitNoteOff({ pitch, velocity: 0, source: "pc" }),
  });

  // Keyboard se suscribe a este almacén para rotular las teclas del piano.
  useEffect(() => {
    publishPcKeyboard({
      octave: keyboard.octave,
      labels: keyboard.labels,
      split: keyboard.split,
    });
  }, [keyboard.octave, keyboard.labels, keyboard.split]);

  // Audio local: suena lo mismo que se manda a la sesión, del mismo evento.
  // Al cerrarse la puerta se libera lo que estuviera pulsado, para que una
  // demostración no deje notas colgadas del alumno.
  useEffect(() => {
    const held = new Set<number>();
    const releaseAll = () => {
      for (const pitch of held) player.auditionOff(pitch);
      held.clear();
    };
    const unsubscribe = subscribeNoteInput({
      onNoteOn: (event) => {
        held.add(event.pitch);
        player.auditionOn(event.pitch, event.velocity);
      },
      onNoteOff: (event) => {
        held.delete(event.pitch);
        player.auditionOff(event.pitch);
      },
    });
    const unsubscribeGate = subscribeNoteInputGate((enabled) => {
      if (!enabled) releaseAll();
    });
    // Red de seguridad: al perder el foco el navegador deja de entregar `keyup`
    // (pestaña en segundo plano u otra app) y la tecla quedaría sonando en
    // bucle — desde el ajuste de suelta ningún `silence()` la corta, porque
    // respetan la audición viva. Al volver se suelta lo mismo que al cerrar la
    // puerta: sin pulsación no hay nota que sostener.
    const releaseOnBlur = () => releaseAll();
    window.addEventListener("blur", releaseOnBlur);
    document.addEventListener("visibilitychange", releaseOnBlur);
    return () => {
      unsubscribe();
      unsubscribeGate();
      window.removeEventListener("blur", releaseOnBlur);
      document.removeEventListener("visibilitychange", releaseOnBlur);
      releaseAll();
    };
  }, [player.auditionOn, player.auditionOff]);

  // Web MIDI (B-032.2 + B-035): si el navegador lo soporta, los teclados
  // conectados entran por el mismo puerto. El estado visible (soporte, permiso,
  // teclados conectados) se publica en midi-store para que MidiStatus sea honesto.
  useEffect(() => {
    let disconnect: (() => void) | null = null;
    let cancelled = false;

    const supported =
      typeof navigator !== "undefined" &&
      typeof (navigator as { requestMIDIAccess?: unknown }).requestMIDIAccess === "function";

    // Estado inicial mientras se pide el acceso.
    updateMidi({ supported, permission: "unknown", inputCount: 0, firstName: null });

    if (!supported) {
      updateMidi({ supported: false, permission: "unknown", inputCount: 0, firstName: null });
      return () => {
        cancelled = true;
      };
    }

    void requestWebMidi()
      .then((access) => {
        if (cancelled) return;
        if (!access) {
          updateMidi({ supported: true, permission: "denied", inputCount: 0, firstName: null });
          return;
        }
        // Publica los teclados conectados (y los que se enchufen en caliente).
        const publishInputs = (a: MidiAccessLike) => {
          syncMidiFromAccess(a, true);
        };
        publishInputs(access);

        disconnect = connectWebMidi(access, (note) => {
          if (note.type === "note_on") {
            emitNoteOn({
              pitch: note.pitch,
              velocity: note.velocity,
              t_ms: note.t_ms,
              source: "midi",
            });
          } else {
            emitNoteOff({
              pitch: note.pitch,
              velocity: 0,
              t_ms: note.t_ms,
              source: "midi",
            });
          }
        });

        // Encadena el bind de connectWebMidi con la publicación del estado.
        const previousStateChange = access.onstatechange;
        access.onstatechange = () => {
          if (typeof previousStateChange === "function") previousStateChange();
          if (!cancelled) publishInputs(access);
        };
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      disconnect?.();
    };
  }, []);

  return <TransportContext.Provider value={player}>{children}</TransportContext.Provider>;
}
