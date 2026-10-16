// description: Panel de detalle de la pieza seleccionada, con acceso al piano y carga de MIDI (B-027.3).
// context: "Continuar en Learn" manda la pieza al piano por el almacén del navegador;
// el subidor reutilizado deja una pieza a mano sin guardarla en el catálogo.

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { publishPianoPiece } from "../../../lib/piece-store";
import { MidiUploader } from "../../MidiUploader";

import type { SongDetailPanelProps } from "./SongDetailPanel.types";
import styles from "./SongDetailPanel.module.css";

/** Página del piano: donde suena lo que se elige en la Library. */
const PIANO_PATH = "/";

const pct = (value: number | null) => (value === null ? "--" : `${value}%`);

export function SongDetailPanel({ song }: SongDetailPanelProps) {
  const router = useRouter();
  const [showUploader, setShowUploader] = useState(false);

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
    publishPianoPiece({ kind: "catalog", id: song.id, title: song.title, autoPlay: true });
    router.push(PIANO_PATH);
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
        aria-expanded={showUploader}
        onClick={() => setShowUploader((open) => !open)}
      >
        Subir archivo MIDI
      </button>

      {showUploader && <MidiUploader />}
    </aside>
  );
}
