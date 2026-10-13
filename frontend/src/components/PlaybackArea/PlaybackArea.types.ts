// description: Props de la columna principal de reproducción.
// context: B-007.3; el transporte nace en este componente, así que no recibe uno.
// El único parámetro es la ventana de octavas, que reenvía a PianoStage para que
// la página pueda fijarla (B-007.1).

export interface PlaybackAreaProps {
  /** Octavas visibles del piano; las consume PianoStage. */
  octaves?: string[];
}
