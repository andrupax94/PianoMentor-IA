"use client";
// description: Columna principal: nace el transporte (usePlayback) y decide qué suena, por este orden: la pieza publicada en el almacén (subida a mano, o pieza del catálogo elegida en la Library, que pide sus notas al backend), o la demo p17 (la reducción para piano de la Sinfonía n.º 5). Además gestiona las intervenciones del agente: la demostración (B-012.5) recorta con demoSubScore la ventana de compases de la pieza de la sesión y la carga al tempo pedido; el acompañamiento (B-012.7) suena solo la mano que mandó el backend desde el inicio de la sección, con la pieza entera aún en la cascada, y al acabar la sección vuelve la pieza normal. Reparte player a PlayerBar y PianoStage, se suscribe al canal de comandos del agente para pausar, reanudar y parar, y decide la portada de la barra con coverForPiece (exportada y con test).
// context: B-007.3/B-027.3/B-012.5/B-012.7; client component para no arrastrar AppHeader ni MentorPanel al bundle de cliente (page.tsx sigue siendo servidor). Si la pieza llega con autoPlay, arranca sola al cargarla. Como el transporte vive aquí, es el único punto que puede tocar el reloj de reproducción: el agente le manda órdenes por agent-commands y sus intervenciones llegan por agent-playback, sin que el WS toque el motor. Mientras una intervención está activa la carga normal no la pisa (agentActiveRef) y al terminar se fuerza con reloadKey. El título y la portada de la barra también nacen aquí (la demo, el nombre del archivo subido o la ficha elegida), así que siempre nombran la pieza que suena.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { demoSubScore } from "../../lib/agent-demo";
import { subscribeAgentPlayback } from "../../lib/agent-playback";
import { getPieceNotes } from "../../lib/api-client";
import type { PieceNotesResponse } from "../../lib/api-client";
import { subscribeAgentCommand } from "../../lib/agent-commands";
import type { AgentHand } from "../../lib/hand-color";
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
  const { load, play, pause, seek, stop } = player;
  // La pieza llega por el almacén: quien la elige puede estar en la Library y,
  // tras navegar, el transporte la encuentra ya puesta.
  const piece = useSyncExternalStore(subscribePianoPiece, getPianoPiece, getPianoPiece);
  /** Última partitura del catálogo cargada (con su rejilla); la recorta la demo (B-012.5). */
  const scoreRef = useRef<PieceNotesResponse | null>(null);
  /** true mientras manda una intervención del agente: la carga normal no debe pisarla. */
  const agentActiveRef = useRef(false);
  /** Temporizador del final de la sección acompañada (B-012.7). */
  const accompanyTimerRef = useRef<number | null>(null);
  /** Mano que toca la IA en el acompañamiento; tiñe la cascada (B-012.7). */
  const [agentHand, setAgentHand] = useState<AgentHand | null>(null);
  /** Contador para recargar la pieza normal cuando la intervención termina. */
  const [reloadKey, setReloadKey] = useState(0);

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
    // Con una intervención del agente en marcha el transporte toca lo que
    // manda el agente: la carga normal espera (y se re-ejecuta al terminar,
    // vía reloadKey).
    if (agentActiveRef.current) return;

    // Partitura ya en memoria (subida a mano): se carga tal cual, sin backend.
    if (piece?.kind === "upload") {
      scoreRef.current = null;
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
        scoreRef.current = score;
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
  }, [load, play, piece, reloadKey]);

  // Las intervenciones del agente (B-012.5/B-012.7): la demostración recorta la
  // ventana de compases; el acompañamiento deja sonando solo la mano de la IA
  // desde el inicio de la sección, con la pieza entera aún en pantalla. Al
  // terminar, se detiene y vuelve la pieza normal. Igual que los comandos del
  // chat, solo el transporte puede tocar el reloj, así que el WS no llega al motor.
  useEffect(() => {
    const clearAccompanyTimer = () => {
      if (accompanyTimerRef.current !== null) {
        window.clearTimeout(accompanyTimerRef.current);
        accompanyTimerRef.current = null;
      }
    };

    const restorePiece = () => {
      clearAccompanyTimer();
      agentActiveRef.current = false;
      // La cascada vuelve a los colores de la partitura.
      setAgentHand(null);
      stop();
      // Fuerza la recarga de la pieza normal (el efecto de arriba).
      setReloadKey((key) => key + 1);
    };

    const unsubscribe = subscribeAgentPlayback(({ event }) => {
      if (event.kind === "stop") {
        restorePiece();
        return;
      }

      clearAccompanyTimer();
      agentActiveRef.current = true;
      stop();
      // La demostración no tiñe la cascada; el acompañamiento sí.
      setAgentHand(event.kind === "accompany" ? event.plan.hand : null);
      const loaded = scoreRef.current;
      const pending =
        loaded && loaded.piece_id === event.pieceId
          ? Promise.resolve(loaded)
          : getPieceNotes(event.pieceId, undefined, { withHands: true });
      pending
        .then((score) => {
          if (!agentActiveRef.current) return;
          scoreRef.current = score;

          if (event.kind === "demo") {
            const sub = demoSubScore(score, event.window);
            if (sub.notes.length === 0) return;
            load(sub.notes, {
              tempoFactor: event.window.tempoFactor ?? undefined,
              tempo_bpm: score.tempo ?? undefined,
              duration_s: sub.duration_s,
              measures: sub.measures,
            });
            void play().catch(() => undefined);
            return;
          }

          // Acompañamiento: la cascada sigue con la pieza entera (las dos manos)
          // y el audio sale solo de las notas que mandó el backend.
          load(score.notes, {
            audible: event.plan.notes,
            tempoFactor: event.plan.tempoFactor ?? undefined,
            tempo_bpm: score.tempo ?? undefined,
            duration_s: score.duration_seconds ?? undefined,
            measures: score.measures,
          });
          seek(event.plan.from_s);
          void play().catch(() => undefined);

          // La sección acaba y la IA deja de sonar: vuelve la pieza normal.
          const factor = event.plan.tempoFactor ?? 1;
          accompanyTimerRef.current = window.setTimeout(
            restorePiece,
            (event.plan.duration_s / factor) * 1000 + 250,
          );
        })
        .catch(() => {
          // Sin partitura no hay intervención sonora; el indicador y el
          // bloqueo del teclado siguen siendo del backend.
        });
    });

    return () => {
      unsubscribe();
      clearAccompanyTimer();
    };
  }, [load, play, seek, stop]);

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
      <PianoStage player={player} octaves={octaves} agentHand={agentHand} />
    </div>
  );
}
