// description: Props del selector de modo del mentor.
// context: B-006.4; los modos reales los gobierna el agente después.

export type MentorMode = "observar" | "duo" | "control";

export interface ModeSelectorProps {
  /** Modo activo. */
  mode?: MentorMode;
}
