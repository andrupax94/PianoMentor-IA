// description: Indicador honesto del estado del teclado MIDI (B-035): sin soporte, denegado, sin teclado o conectado con su nombre, consumido del almacén midi-store.
// context: Antes mentía con default true. Ahora lee midi-store, sincronizado por TransportProvider.

"use client";

import { useSyncExternalStore } from "react";

import {
  EMPTY_MIDI,
  getMidiState,
  subscribeMidi,
} from "../../../lib/midi-store";

import styles from "./MidiStatus.module.css";

const SERVER_SNAPSHOT = () => EMPTY_MIDI;

export function MidiStatus() {
  const state = useSyncExternalStore(subscribeMidi, getMidiState, SERVER_SNAPSHOT);

  let label: string;
  let connected: boolean;
  if (!state.supported) {
    label = "MIDI no soportado";
    connected = false;
  } else if (state.permission === "denied") {
    label = "Permiso MIDI denegado";
    connected = false;
  } else if (state.inputCount === 0) {
    label = "Sin teclado MIDI";
    connected = false;
  } else {
    label = state.firstName ? `MIDI: ${state.firstName}` : "Teclado MIDI conectado";
    connected = true;
  }

  return (
    <p className={styles.status} role="status">
      <span className={connected ? styles.on : styles.off} aria-hidden="true" />
      {label}
    </p>
  );
}