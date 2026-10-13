// description: Props de los botones de transporte.
// context: B-006.4; los callbacks los enchufa B-007 al usePlayback de B-006.2.

export interface PlaybackControlsProps {
  onRewind?: () => void;
  /** Reproducir/pausar: un solo botón que alterna. */
  onTogglePlay?: () => void;
  onStop?: () => void;
  onForward?: () => void;
  /** true mientras suena: cambia el icono (▶/⏸) y su etiqueta accesible. */
  isPlaying?: boolean;
}
