// description: Selector de un MIDI a mano para reproducirlo en el piano sin guardarlo.
// context: B-027.3; el backend lo lee en memoria (POST /pieces/preview) y la
// partitura viaja al piano por el almacén del navegador, nunca por el catálogo.

"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { ApiError, previewPiece } from "../lib/api-client";
import { publishPianoPiece } from "../lib/piece-store";
import styles from "./MidiUploader.module.css";
const ALLOWED_EXTENSIONS = [".mid", ".midi"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB, espejo orientativo del backend
/** Página del piano: donde suena lo que se elige aquí. */
const PIANO_PATH = "/";

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; filename: string; tempo: number | null; duration: number | null; notes: number }
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

export function MidiUploader() {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<LoadState>({ kind: "idle" });
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

    setState({ kind: "loading" });
    try {
      const piece = await previewPiece(file);
      publishPianoPiece({
        kind: "upload",
        filename: piece.filename,
        tempo: piece.tempo,
        duration_seconds: piece.duration_seconds,
        measures: piece.measures,
        notes: piece.notes,
        // Llega "para sonar": al terminar la navegación el piano la carga y arranca.
        autoPlay: true,
      });
      setState({
        kind: "ready",
        filename: piece.filename,
        tempo: piece.tempo,
        duration: piece.duration_seconds,
        notes: piece.notes_total,
      });
      // Desde la Library hay que ir al piano; en la página principal ya estamos.
      if (pathname !== PIANO_PATH) router.push(PIANO_PATH);
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : "No se pudo leer el archivo. Inténtalo de nuevo.";
      setState({ kind: "error", message });
    }
  }

  return (
    <section className={styles.panel}>
      <p><span></span>Arrastra un archivo MIDI para escucharlo en el piano.</p>
      <input
        type="file"
        accept=".mid,.midi"
        aria-label="Archivo MIDI"
        onChange={handleFileChange}
        disabled={state.kind === "loading"}
      />

      {selectedName && (
        <p>
          Archivo: <strong>{selectedName}</strong>
        </p>
      )}

      {state.kind === "loading" && <p role="status">Leyendo la partitura…</p>}

      {state.kind === "error" && (
        <p role="alert" style={{ color: "#ff8b8b" }}>
          {state.message}
        </p>
      )}

      {state.kind === "ready" && (
        <div>
          <p role="status">
            Listo: <strong>{state.filename}</strong> está cargada en el piano.
          </p>
          <ul>
            {state.notes > 0 && (
              <li>
                Notas: <strong>{state.notes}</strong>
              </li>
            )}
            {state.duration !== null && (
              <li>
                Duración: <strong>{state.duration.toFixed(1)} s</strong>
              </li>
            )}
            {state.tempo !== null && (
              <li>
                Tempo: <strong>{state.tempo.toFixed(0)} BPM</strong>
              </li>
            )}
          </ul>
        </div>
      )}
    </section>
  );
}
