"use client";
// description: Columna principal: transporte de reproducción y piano.
// context: B-007.3; dueño de usePlayback. PlayerBar y PianoStage son hermanos y
// necesitan la misma posición y el mismo schedule, así que el transporte nace aquí.
// Manda la pieza publicada en el almacén —subida a mano o elegida en la Library—;
// sin ninguna, suena la demo.
//
// Es componente cliente porque el transporte vive en el navegador; page.tsx sigue
// siendo Server Component y no arrastra AppHeader ni MentorPanel al bundle cliente.

import { useEffect, useSyncExternalStore } from "react";

import { getPieceNotes } from "../../lib/api-client";
import { subscribeAgentCommand } from "../../lib/agent-commands";
import { getPianoPiece, subscribePianoPiece } from "../../lib/piece-store";
import type { PianoPiece } from "../../lib/piece-store";
import { usePlayback } from "../../lib/usePlayback";
import { PlayerBar } from "../PlayerBar/PlayerBar";
import { PianoStage } from "../PianoStage/PianoStage";
import styles from "./PlaybackArea.module.css";
import type { PlaybackAreaProps } from "./PlaybackArea.types";

/** Pieza demo hasta B-008/B-012 (aún no hay sesión con pieza elegida). */
const DEMO_PIECE_ID = "p17";

/** Título de la barra mientras no hay pieza elegida: el de la demo, para que
 *  lo que se anuncia y lo que suena no puedan desentonar. */
const DEMO_SONG_TITLE = "Beethoven – Symphony No. 5";

/** Portada de la demo: la misma de su ficha en el catálogo (p17). */
const DEMO_COVER = "/assets/covers/beethoven.jpg";

/**
 * Portada que acompaña al título en la barra: la de la pieza elegida en la
 * Library, la de la demo mientras no haya ninguna, o null cuando la pieza no
 * tiene (subidas): entonces SongInfo pinta su glifo de reserva.
 * Pura, sin DOM, para poder testearla como shouldShowDock.
 */
export function coverForPiece(piece: PianoPiece | null): string | null {
  if (piece === null) return DEMO_COVER;
  if (piece.kind === "upload") return null;
  return piece.cover;
}

export function PlaybackArea({ octaves = ["C1", "C2", "C3"] }: PlaybackAreaProps) {
  const player = usePlayback();
  const { load, play, pause, stop } = player;
  // La pieza llega por el almacén: quien la elige puede estar en la Library y,
  // tras navegar, el transporte la encuentra ya puesta.
  const piece = useSyncExternalStore(subscribePianoPiece, getPianoPiece, getPianoPiece);

  // El chat manda pausar/reanudar/parar por su propio canal: solo el transporte
  // puede tocar el reloj, así que el agente no llega al motor de otra forma.
  useEffect(
    () =>
      subscribeAgentCommand(({ command }) => {
        if (command === "pausar") pause();
        else if (command === "reanudar") play();
        else if (command === "parar") stop();
      }),
    [pause, play, stop],
  );

  useEffect(() => {
    // Partitura ya en memoria (subida a mano): se carga tal cual, sin backend.
    if (piece?.kind === "upload") {
      load(piece.notes, {
        tempo_bpm: piece.tempo ?? undefined,
        duration_s: piece.duration_seconds ?? undefined,
        measures: piece.measures,
      });
      if (piece.autoPlay) void play().catch(() => undefined);
      return;
    }

    // Del catálogo (o la demo): la partitura la sirve el backend.
    let cancelled = false;
    const pieceId = piece?.kind === "catalog" ? piece.id : DEMO_PIECE_ID;
    const autoPlay = piece?.kind === "catalog" && piece.autoPlay === true;
    // Con la mano de cada nota para teñir la cascada por lado (D-002.1).
    getPieceNotes(pieceId, undefined, { withHands: true })
      .then((score) => {
        if (cancelled) return;
        load(score.notes, {
          tempo_bpm: score.tempo ?? undefined,
          duration_s: score.duration_seconds ?? undefined,
          measures: score.measures,
        });
        if (autoPlay) void play().catch(() => undefined);
      })
      .catch(() => {
        // Sin partitura no hay resaltado ni cascada; la página sigue funcionando.
      });
    return () => {
      cancelled = true;
    };
  }, [load, play, piece]);

  // La barra anuncia la demo, el nombre del archivo subido o el título elegido
  // en la Library: el título siempre es la pieza que suena, nunca un marcador.
  const songTitle =
    piece === null
      ? DEMO_SONG_TITLE
      : piece.kind === "upload"
        ? piece.filename
        : piece.title;
  // Y la portada sigue la misma historia (null → SongInfo dibuja su glifo).
  const songCover = coverForPiece(piece);

  return (
    <div className={styles.area}>
      <PlayerBar player={player} songTitle={songTitle} songCover={songCover} />
      <PianoStage player={player} octaves={octaves} />
    </div>
  );
}
