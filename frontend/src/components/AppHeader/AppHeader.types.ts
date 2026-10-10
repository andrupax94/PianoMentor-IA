// description: Props del encabezado principal de la aplicación.
// context: B-006.4; cableado real en B-007.

export interface AppHeaderProps {
  /** true muestra "MIDI Keyboard connected". */
  midiConnected?: boolean;
  /** Inicial del avatar de usuario. */
  userInitial?: string;
}
