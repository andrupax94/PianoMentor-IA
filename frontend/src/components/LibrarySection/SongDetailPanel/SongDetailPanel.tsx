// description: Panel de detalle de la pieza seleccionada, con carga de MIDI reutilizada (B-027.3).
// context: Reutiliza MidiUploader sin modificarlo; los botones de Learn siguen pendientes (B-012).

"use client";

import { useState } from "react";

import { MidiUploader } from "../../MidiUploader";

import type { SongDetailPanelProps } from "./SongDetailPanel.types";
import styles from "./SongDetailPanel.module.css";

const pct = (value: number | null) => (value === null ? "--" : `${value}%`);

export function SongDetailPanel({ song }: SongDetailPanelProps) {
  const [showUploader, setShowUploader] = useState(false);

  if (!song) {
    return (
      <aside className={styles.panel}>
        <p className={styles.empty}>Selecciona una canción.</p>
      </aside>
    );
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

      <button type="button" className={styles.primary}>
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
