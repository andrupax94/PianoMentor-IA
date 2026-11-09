// description: Codificador WAV 16-bit mono (B-033.5): encodeWav16BitMono convierte muestras Float32 [-1..1] en un fichero .wav PCM mono 16-bit con cabecera RIFF/WAVE completa (44 bytes + datos). Puro y determinista: la grabación del modo depuración se convierte aquí a un formato sonable, universal y directo para la IA, sin librerías externas.
// context: B-033.5; el mediaRecorder del navegador graba webm/opus, que ni suena ya bien en Windows ni conviene para archivar; decodificar y bajar a WAV mono 16-bit (~5.5 MB/min en 44.1 kHz) lo resuelve en el mismo navegador. Vive en src/lib por ser matemática de bytes, no DOM: PracticeRecorder la consume tras desconectar la grabación.

/** Cabecera estándar de un WAV PCM mono 16-bit: 44 bytes antes de los datos. */
export const WAV_HEADER_BYTES = 44;

/** `str` ASCII al hueco dado (los campos de la cabecera son literales). */
function writeString(view: DataView, offset: number, text: string): void {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

/** Convierte un entero a Little Endian Infinity en el hueco. */
export function clippedSample(sample: number): number {
  if (!Number.isFinite(sample)) return 0;
  if (sample > 1) return 1;
  if (sample < -1) return -1;
  return sample;
}

/**
 * Bytes WAV (mono, 16-bit PCM). `samples` llega ya mezclado a un canal;
 * el item 32768 es el rango silente (sin clip: los valores fuera de
 * [-1, 1] se acotan, nunca saltan a otro rango).
 */
export function encodeWav16BitMono(samples: Float32Array, sampleRate: number): Uint8Array {
  const dataSize = samples.length * 2; // 16-bit → 2 bytes por muestra
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, WAV_HEADER_BYTES + dataSize - 8, true); // RIFF chunk size
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // tamaño del bloque fmt (PCM sin extras)
  view.setUint16(20, 1, true); // formato PCM
  view.setUint16(22, 1, true); // canales: 1 (mono)
  view.setUint32(24, sampleRate, true);
  // byte rate: sampleRate × canales × bytes por muestra
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); // block align: 1 canal × 2 bytes
  view.setUint16(34, 16, true); // bits por muestra
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  for (let index = 0; index < samples.length; index += 1) {
    const sample = clippedSample(samples[index]);
    view.setInt16(WAV_HEADER_BYTES + index * 2, Math.round(sample * 32767), true);
  }
  return new Uint8Array(buffer);
}

/** Mezcla n canales a uno (promedio sencillo): la grabación del piano no es estéreo de verdad. */
export function downmixToMono(channels: readonly Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  const length = Math.max(...channels.map((channel) => channel.length));
  const mixed = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    let sum = 0;
    for (const channel of channels) sum += channel[index] ?? 0;
    mixed[index] = sum / channels.length;
  }
  return mixed;
}
