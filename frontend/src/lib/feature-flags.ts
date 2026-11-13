// description: Feature flags de la casa (B-023): MIDI_UPLOAD_ENABLED controla si la interfaz enseña las entradas de «Subir MIDI». Es un flag de BUILD (NEXT_PUBLIC_ENABLE_MIDI_UPLOAD inlined por Next en cliente y servidor): false en el despliegue público de la prueba, true (o ausente) en desarrollo.
// context: La decisión de la issue unida B-023: subir MIDI queda fuera de la prueba pública porque no hay tiempo de probarla como es — la entrada se deshabilita/oculta SIN quitar la funcionalidad (código, tests y rutas del backend intactos). Cuando se pruebe la subida con calma, se quita el flag o se reenciende. La lógica vive en midiUploadEnabled (pura y testeable); la constante es la que consumen los componentes.

/** True salvo que el valor explícito sea "false" (el despliegue público lo pone a false). */
export function midiUploadEnabled(raw: string | undefined): boolean {
  return raw !== "false";
}

/** Flag de build: NEXT_PUBLIC_ENABLE_MIDI_UPLOAD=false oculta las entradas de subida. */
export const MIDI_UPLOAD_ENABLED: boolean = midiUploadEnabled(
  process.env.NEXT_PUBLIC_ENABLE_MIDI_UPLOAD,
);
