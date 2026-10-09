// description: Selector y carga de archivos MIDI al backend.
// context: Subida con validación y errores visibles.

"use client";

export function MidiUploader() {
  return (
    <section className="panel">
      <h2>Cargar pieza</h2>
      <p>La validación y el parsing MIDI se conectarán en la siguiente iteración.</p>
      <input type="file" accept=".mid,.midi" aria-label="Archivo MIDI" />
    </section>
  );
}
