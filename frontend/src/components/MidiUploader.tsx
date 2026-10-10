// description: Selector y carga de archivos MIDI al backend con metadatos y errores visibles.
// context: Primer flujo web → API; usa el cliente tipado, nunca fetch directo.

"use client";

import { useState } from "react";

import { ApiError, uploadPiece, type PieceResponse } from "../lib/api-client";

const ALLOWED_EXTENSIONS = [".mid", ".midi"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB, espejo orientativo del backend

type UploadState =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "ready"; piece: PieceResponse }
  | { kind: "error"; message: string };

function validateClientSide(file: File): string | null {
  const dot = file.name.lastIndexOf(".");
  const extension = dot === -1 ? "" : file.name.slice(dot).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return `Extensión no permitida. Usa ${ALLOWED_EXTENSIONS.join(" o ")}.`;
  }
  if (file.size > MAX_FILE_SIZE) {
    return "El archivo supera el límite de 5 MB.";
  }
  return null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function MidiUploader() {
  const [state, setState] = useState<UploadState>({ kind: "idle" });
  const [selectedName, setSelectedName] = useState<string | null>(null);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Estado vacío y limpieza del error anterior al elegir un archivo nuevo.
    if (!file) {
      setSelectedName(null);
      setState({ kind: "idle" });
      return;
    }

    setSelectedName(file.name);

    const clientError = validateClientSide(file);
    if (clientError) {
      setState({ kind: "error", message: clientError });
      return;
    }

    setState({ kind: "uploading" });
    try {
      const piece = await uploadPiece(file);
      setState({ kind: "ready", piece });
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : "No se pudo completar la carga. Inténtalo de nuevo.";
      setState({ kind: "error", message });
    }
  }

  return (
    <section className="panel">
      <h2>Cargar pieza</h2>
      <p>Selecciona un archivo MIDI para ver sus metadatos.</p>
      <input
        type="file"
        accept=".mid,.midi"
        aria-label="Archivo MIDI"
        onChange={handleFileChange}
        disabled={state.kind === "uploading"}
      />

      {selectedName && <p>Archivo: <strong>{selectedName}</strong></p>}

      {state.kind === "uploading" && <p role="status">Subiendo…</p>}

      {state.kind === "error" && (
        <p role="alert" style={{ color: "#ff8b8b" }}>
          {state.message}
        </p>
      )}

      {state.kind === "ready" && (
        <div>
          <p role="status">
            {state.piece.deduplicated
              ? "Esta pieza ya existía: se ha reutilizado en lugar de duplicarla."
              : "Carga completada."}
          </p>
          <ul>
            <li>Nombre: <strong>{state.piece.filename}</strong></li>
            <li>Tamaño: <strong>{formatBytes(state.piece.size_bytes)}</strong></li>
            <li>Extensión: <strong>{state.piece.extension}</strong></li>
            <li>Origen: <strong>{state.piece.source === "corpus" ? "Catálogo" : "Subida"}</strong></li>
            {state.piece.metadata.tracks !== null && (
              <li>Pistas: <strong>{state.piece.metadata.tracks}</strong></li>
            )}
            {state.piece.metadata.duration_seconds !== null && (
              <li>Duración: <strong>{state.piece.metadata.duration_seconds.toFixed(1)} s</strong></li>
            )}
            {state.piece.metadata.tempo !== null && (
              <li>Tempo: <strong>{state.piece.metadata.tempo.toFixed(0)} BPM</strong></li>
            )}
            {state.piece.metadata.notes_count !== null && (
              <li>Notas: <strong>{state.piece.metadata.notes_count}</strong></li>
            )}
          </ul>
        </div>
      )}
    </section>
  );
}
