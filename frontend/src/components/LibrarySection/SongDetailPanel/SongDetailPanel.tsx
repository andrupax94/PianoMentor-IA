// description: Panel de detalle de la pieza seleccionada, con acceso al piano, la práctica y carga de MIDI (B-027.3).
// context: "Continuar en Learn" manda la pieza al piano por el almacén del navegador;
// "Practicar" abre una sesión real (B-012.1), publica la pieza en el almacén para que el
// piano la cargue al entrar (B-032.1) y lleva a su vista.

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ApiError, createSession } from "../../../lib/api-client";
import { publishPianoPiece } from "../../../lib/piece-store";
import { publishPracticePiece } from "../../../lib/session-piece";
import { MidiUploader } from "../../MidiUploader";

import type { SongDetailPanelProps } from "./SongDetailPanel.types";
import styles from "./SongDetailPanel.module.css";

/** Página del piano: donde suena lo que se elige en la Library. */
const PIANO_PATH = "/";

const pct = (value: number | null) => (value === null ? "--" : `${value}%`);

export function SongDetailPanel({ song }: SongDetailPanelProps) {
  const router = useRouter();
  const [showUploader, setShowUploader] = useState(false);
  const [openingSession, setOpeningSession] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!song) {
    return (
      <aside className={styles.panel}>
        <p className={styles.empty}>Selecciona una canción.</p>
      </aside>
    );
  }

  /** Manda la pieza al piano: al llegar se carga sola y arranca en Learn. */
  function continueInLearn() {
    if (!song) return;
    publishPianoPiece({
      kind: "catalog",
      id: song.id,
      title: song.title,
      cover: song.cover,
      autoPlay: true,
    });
    router.push(PIANO_PATH);
  }

  /** Abre una sesión de práctica sobre la pieza y navega a la portada con ella activa. */
  async function practice() {
    if (!song || openingSession) return;
    setOpeningSession(true);
    setError(null);
    try {
      const session = await createSession(song.id);
      // B-032.1: el piano es la vista de la sesión. La pieza se publica antes
      // de navegar, cargada y parada, para que al entrar no se vea la demo
      // `p17` mientras se practica y se evalúa otra pieza.
      publishPracticePiece(song);
      router.push(`/${session.id}`);
    } catch (failure: unknown) {
      setError(failure instanceof ApiError ? failure.message : "No se pudo abrir la sesión.");
      setOpeningSession(false);
    }
  }

  return (
    <aside className={styles.panel}>
      <div className={styles.cover}>
        {song.cover ? (
          <img className={styles.coverImg} src={song.cover} alt="" />
        ) : (
          song.initials
        )}
      </div>

      <div>
        <h2 className={styles.title}>{song.title}</h2>
        <p className={styles.sub}>
          {song.composer}
          {song.subtitle ? ` · ${song.subtitle}` : ""}
        </p>
      </div>

      <dl className={styles.stats}>
        <div>
          <dt>Tempo</dt>
          <dd>{song.bpm === null ? "--" : `${song.bpm} BPM`}</dd>
        </div>
        <div>
          <dt>Duración</dt>
          <dd>{song.duration}</dd>
        </div>
        <div>
          <dt>Timing</dt>
          <dd>{pct(song.timing)}</dd>
        </div>
        <div>
          <dt>Notas</dt>
          <dd>{pct(song.notes)}</dd>
        </div>
      </dl>

      <button type="button" className={styles.primary} onClick={continueInLearn}>
        Continuar en Learn
      </button>

      <button
        type="button"
        className={styles.secondary}
        onClick={practice}
        disabled={openingSession}
      >
        {openingSession ? "Abriendo sesión…" : "Practicar esta pieza"}
      </button>

      {error && (
        <p role="alert" style={{ color: "#ff8b8b" }}>
          {error}
        </p>
      )}

      <button
        type="button"
        className={styles.secondary}
        aria-expanded={showUploader}
        onClick={() => setShowUploader((open) => !open)}
      >
        Subir archivo MIDI
      </button>

      {showUploader && <MidiUploader />}
    </aside>
  );
}
