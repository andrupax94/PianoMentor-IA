// description: Props del indicador de teclado MIDI (B-035: ya no recibe props; lee midi-store).
// context: B-006.4 / B-035.

export interface MidiStatusProps {
  /** Reservado por compatibilidad; el componente lee el almacén directamente. */
  connected?: boolean;
}