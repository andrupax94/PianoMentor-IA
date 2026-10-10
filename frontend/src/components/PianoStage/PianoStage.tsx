// description: Contenedor del piano completo (cuadrícula + teclado).
// context: B-006.4; armazón estático.

import { Keyboard } from "./Keyboard/Keyboard";
import { NoteFallGrid } from "./NoteFallGrid/NoteFallGrid";
import styles from "./PianoStage.module.css";
import type { PianoStageProps } from "./PianoStage.types";

export function PianoStage({ octaves = ["C1", "C2", "C3"] }: PianoStageProps) {
  return (
    <section className={styles.stage} aria-label="Piano">
      <NoteFallGrid octaves={octaves} />
      <Keyboard />
    </section>
  );
}
