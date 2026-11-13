// description: Frases musicales de espera del chat (B-036.2): la lista que la burbuja rota mientras el turno del agente está en vuelo y el selector puro fraseDeEspera, que reparte las frases en rondas (round-robin) cada INTERVALO_ESPERA_MS.
// context: Puras y testeables sin DOM, al estilo de agent-hint.ts; las consume MentorChat. La rotación solo cambia el texto del mensaje de espera (sin re-render de la conversación) y se limpia al llegar la respuesta. Tono de la skill piano-mentor-chat-burbuja: mentor cercano, musical, sin prometer tiempos ni tecnicismos. Los reintentos del backend (B-036.1) alargan el turno unos segundos: estas frases visten esa espera.

/** Intervalo de rotación del mensaje de espera (~2,5 s por frase). */
export const INTERVALO_ESPERA_MS = 2_500;

/** Frases musicales de la casa: variadas, cortas, sin prometer tiempos. */
export const FRASES_ESPERA: readonly string[] = [
  "Estamos afinando tu respuesta 🎻",
  "Poniendo a punto el metrónomo ⏱",
  "Buscando la tonalidad justa 🎹",
  "Contando los compases… 1, 2, 3, 4 🥁",
  "Calentando los dedos de la IA 🖐️",
  "Afinando el La de 440 Hz 🎵",
  "Subiendo el telón 🎭",
  "Ajustando el pedal de resonancia 🦶",
];

/** La frase que toca para el índice dado: rondas sin repetir hasta cerrar el ciclo.

 * Acepta índices negativos y absurdos (el módulo normaliza), así que el
 * componente puede hacer índice += 1 sin mirar el largo de la lista. */
export function fraseDeEspera(indice: number): string {
  const largo = FRASES_ESPERA.length;
  const normalizado = ((Math.floor(indice) % largo) + largo) % largo;
  return FRASES_ESPERA[normalizado];
}
