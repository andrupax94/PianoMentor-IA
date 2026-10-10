// description: Teclado del escenario (temporal: reutiliza el PianoKeyboard existente).
// context: B-006.4; no modifica PianoKeyboard, B-007 lo sustituye por el teclado C1–C6.

import { PianoKeyboard } from "../../PianoKeyboard";
import styles from "./Keyboard.module.css";
import type { KeyboardProps } from "./Keyboard.types";

export function Keyboard({ children }: KeyboardProps) {
  return <div className={styles.keyboard}>{children ?? <PianoKeyboard />}</div>;
}
