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
import { connectWebMidi, requestWebMidi } from "../../lib/web-midi";

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
    return () => {
      unsubscribe();
      unsubscribeGate();
      releaseAll();
    };
  }, [player.auditionOn, player.auditionOff]);

  // Web MIDI (B-032.2): si el navegador lo soporta, los teclados conectados
  // entran por el mismo puerto. Sin soporte o sin permiso, no pasa nada.
  useEffect(() => {
    let disconnect: (() => void) | null = null;
    let cancelled = false;
    void requestWebMidi()
      .then((access) => {
        if (cancelled || !access) return;
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
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      disconnect?.();
    };
  }, []);

  return <TransportContext.Provider value={player}>{children}</TransportContext.Provider>;
}
