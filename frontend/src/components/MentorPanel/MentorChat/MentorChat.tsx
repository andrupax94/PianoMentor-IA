// description: Chat del mentor (avatar, burbuja e input de placeholder).
// context: B-006.4; armazón estático.

import styles from "./MentorChat.module.css";
import type { MentorChatProps } from "./MentorChat.types";

export function MentorChat({
  exampleMessage = "Aquí hablará tu profesor de piano IA.",
}: MentorChatProps) {
  return (
    <section className={styles.chat} aria-label="Chat del mentor">
      <div className={styles.heading}>
        <span className={styles.avatar} aria-hidden="true">
          🤖
        </span>
        <div>
          <strong>PianoMentor Chat</strong>
          <p>Tu Profesor de piano IA</p>
        </div>
      </div>
      <p className={styles.bubble}>{exampleMessage}</p>
      <input
        className={styles.input}
        type="text"
        placeholder="Habla con PianoMentor…"
        aria-label="Habla con PianoMentor"
        readOnly
      />
    </section>
  );
}
