// description: Indicador de estado del teclado MIDI.
// context: B-006.4; armazón estático.

import styles from "./MidiStatus.module.css";
import type { MidiStatusProps } from "./MidiStatus.types";

export function MidiStatus({ connected = false }: MidiStatusProps) {
  return (
    <p className={styles.status} role="status">
      <span className={connected ? styles.on : styles.off} aria-hidden="true" />
      {!connected ? "MIDI Keyboard connected" : "PC Keyboard connected"}
    </p>
  );
}
