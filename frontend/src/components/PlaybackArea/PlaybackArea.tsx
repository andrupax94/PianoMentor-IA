// description: Columna principal: consume el transporte único de la portada (useTransport) y decide qué suena, por este orden: la pieza publicada en el almacén (subida a mano, o pieza del catálogo elegida en la Library, que pide sus notas al backend), o la demo p01 (el Minuet in G major, BWV Anh. 114, del catálogo). Además gestiona las intervenciones del agente: la demostración (B-012.5) recorta con demoSubScore la ventana de compases de la pieza de la sesión y la carga al tempo pedido; el acompañamiento (B-012.7) suena solo la mano que mandó el backend desde el inicio de la sección, con la pieza entera aún en la cascada, y al acabar la sección vuelve la pieza normal. Reparte player a PlayerBar y PianoStage, se suscribe al canal de comandos del agente para pausar, reanudar y parar, y decide la portada de la barra con coverForPiece (exportada y con test).
// context: B-007.3/B-027.3/B-012.5/B-012.7/B-032.2; client component para no arrastrar AppHeader ni MentorPanel al bundle de cliente (page.tsx sigue siendo servidor). Si la pieza llega con autoPlay, arranca sola al cargarla. El transporte ya no nace aquí sino en TransportProvider (layout), así que la sesión y el piano comparten reloj; este componente sigue siendo el único punto que decide qué se carga y quién puede tocar el reloj, y el agente le manda órdenes por agent-commands y sus intervenciones llegan por agent-playback, sin que el WS toque el motor. En una ruta de sesión no carga la demo mientras la pieza de la sesión viaja al almacén (B-032.2). Mientras una intervención está activa la carga normal no la pisa (agentActiveRef) y al terminar se fuerza con reloadKey. El título y la portada de la barra también nacen aquí (la demo, el nombre del archivo subido o la ficha elegida), así que siempre nombran la pieza que suena.

"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { demoSubScore } from "../../lib/agent-demo";
import { subscribeAgentPlayback } from "../../lib/agent-playback";
import { getPieceNotes } from "../../lib/api-client";
import type { PieceNotesResponse } from "../../lib/api-client";
import { subscribeAgentCommand } from "../../lib/agent-commands";
import type { AgentHand } from "../../lib/hand-color";
import { getPianoPiece, subscribePianoPiece } from "../../lib/piece-store";
import type { PianoPiece } from "../../lib/piece-store";
import { defaultPreroll_s } from "../../lib/practice-gate";
import { audibleNotes, dimmedHand, evaluatedHand } from "../../lib/practice-mode";
import { getWaitModeSnapshot, subscribeWaitMode } from "../../lib/wait-mode-store";
import { getSessionSnapshot, subscribeSession } from "../../lib/session-store";
import { useTransport } from "../../lib/transport-context";
import { usePracticeModeChange } from "../PracticeModeBridge";
import { PlayerBar } from "../PlayerBar/PlayerBar";
import { PianoStage } from "../PianoStage/PianoStage";
import styles from "./PlaybackArea.module.css";
import type { PlaybackAreaProps } from "./PlaybackArea.types";

/** Pieza demo hasta B-008/B-012 (aún no hay sesión con pieza elegida). */
const DEMO_PIECE_ID = "p01";

/** Título de la barra mientras no hay pieza elegida: el de la demo, para que
 *  lo que se anuncia y lo que suena no puedan desentonar. */
const DEMO_SONG_TITLE = "Bach – Minuet in G major";

/** Autor de la demo (p01, Minuet de Bach): el subtítulo de la barra. */
const DEMO_SONG_COMPOSER = "Johann Sebastian Bach";

/** Portada de la demo: la misma de su ficha en el catálogo (p01). */
const DEMO_COVER = "/assets/covers/bach.jpg";

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

/** Ruta de una sesión de práctica: el id es un UUID4 (POST /sessions). */
const SESSION_PATH =
  /^\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Índice de compás acotado al final real de la rejilla (B-032.6). */
function clampMeasure(index: number, max: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(Math.trunc(index), 0), Math.max(max, 0));
}

export function PlaybackArea({ octaves = ["C1", "C2", "C3"] }: PlaybackAreaProps) {
  const player = useTransport();
  const pathname = usePathname();
  // B-032.2: en una ruta de sesión no se carga la demo mientras la pieza de la
  // sesión viaja al almacén; antes se veía `p01` un instante en cada F5.
  const inSession = SESSION_PATH.test(pathname ?? "");
  const { load, play, pause, seek, stop, setAudible, setGateOptions, setPreroll, setTempoFactor } =
    player;
  // La pieza llega por el almacén: quien la elige puede estar en la Library y,
  // tras navegar, el transporte la encuentra ya puesta.
  const piece = useSyncExternalStore(subscribePianoPiece, getPianoPiece, getPianoPiece);
  // B-032.4: el modo de práctica de la sesión (si hay sesión) gobierna la
  // cascada (qué mano se atenúa) y el audio del transporte (qué mano suena).
  const session = useSyncExternalStore(
    subscribeSession,
    getSessionSnapshot,
    getSessionSnapshot,
  );
  const practiceMode = session.sessionId === null ? null : session.practiceMode;
  const studentHand = session.studentHand;
  const dimmed = practiceMode === null ? null : dimmedHand(practiceMode, studentHand);
  // B-033.2: el switch «Modo espera» del PlayerBar puede congelar-apagar la
  // espera del transporte en los gates de práctica (default: activado).
  const waitMode = useSyncExternalStore(subscribeWaitMode, getWaitModeSnapshot, getWaitModeSnapshot);
  // B-032.4: el selector publica el cambio; el puente lo manda al backend.
  const changePracticeMode = usePracticeModeChange();
  /** true si la partitura ya está cargada (para poder cambiar solo el audio). */
  const loadedRef = useRef(false);
  /** Última partitura del catálogo cargada (con su rejilla); la recorta la demo (B-012.5). */
  const scoreRef = useRef<PieceNotesResponse | null>(null);
  /** true mientras manda una intervención del agente: la carga normal no debe pisarla. */
  const agentActiveRef = useRef(false);
  /** Temporizador del final de la sección acompañada (B-012.7). */
  const accompanyTimerRef = useRef<number | null>(null);
  /** Temporizador del final de la demo local de un compás pedido por chat (B-033.8). */
  const localDemoTimerRef = useRef<number | null>(null);
  /**
   * B-033.8: pieza cuyo autoPlay está suprimido. Tras la demo de un compás
   * pedido por chat la pieza se recarga parada: el `autoPlay` con que se
   * publicó no vuelve a arrancar la canción por su cuenta. El autoPlay de una
   * publicación NUEVA (otra referencia de pieza) sigue mandando.
   */
  const suppressAutoPlayRef = useRef<PianoPiece | null>(null);
  /** Mano que toca la IA en el acompañamiento; tiñe la cascada (B-012.7). */
  const [agentHand, setAgentHand] = useState<AgentHand | null>(null);
  /** Contador para recargar la pieza normal cuando la intervención termina. */
  const [reloadKey, setReloadKey] = useState(0);
  /**
   * B-032.6: destino de la práctica tras la demostración. Al devolver el
   * control, la pieza se recarga y el transporte reanuda al inicio del compás
   * demostrado (con el tempo vigente) para que el gate se rearme.
   */
  const resumeRef = useRef<{
    fromMeasure: number;
    tempoFactor: number | null;
  } | null>(null);
  /**
   * B-032.6: si había un destino pendiente, lo aplica tras la recarga y
   * devuelve true (así el autoPlay de la pieza no dispara dos veces).
   */
  const resumeReturn = useCallback(
    (measures: { starts_s: number[] } | null): boolean => {
      const resume = resumeRef.current;
      resumeRef.current = null;
      if (resume === null || !measures || measures.starts_s.length === 0) return false;
      const target =
        measures.starts_s[clampMeasure(resume.fromMeasure, measures.starts_s.length - 1)];
      if (!Number.isFinite(target)) return false;
      const factor = resume.tempoFactor ?? 1;
      setTempoFactor(factor);
      // Los segundos de la rejilla son de partitura; el motor los pide escalados.
      seek(target / factor);
      void play().catch(() => undefined);
      return true;
    },
    [play, seek, setTempoFactor],
  );

  // El chat manda pausar/reanudar/parar por su propio canal: solo el transporte
  // puede tocar el reloj, así que el agente no llega al motor de otra forma.
  // B-033.8: `mostrar_compas` demuestra localmente UN compás de la pieza
  // cargada, dentro o fuera de sesión — fuera de sesión es la única vía, y en
  // sesión solo se usa si el POST del agente no está disponible.
  useEffect(() => {
    const clearLocalDemo = () => {
      if (localDemoTimerRef.current !== null) {
        window.clearTimeout(localDemoTimerRef.current);
        localDemoTimerRef.current = null;
      }
    };

    // Fin de la demo local: vuelve la pieza con el modo del alumno, igual que
    // al terminar una intervención del agente (sin destino de reanudación).
    // B-033.8: la pieza vuelve PARADA — se suprime su autoPlay para que la
    // recarga de restauración no reinicie la canción sola.
    const restoreFromLocalDemo = () => {
      clearLocalDemo();
      agentActiveRef.current = false;
      if (piece !== null) suppressAutoPlayRef.current = piece;
      stop();
      setGateOptions({
        enabled:
          waitMode.enabled && (practiceMode === "one_hand" || practiceMode === "both_hands"),
        hand: evaluatedHand(practiceMode ?? "observe", studentHand) ?? "both",
      });
      setReloadKey((key) => key + 1);
    };

    /** Demuestra el compás `measure` (1-based, como lo cuenta el alumno). */
    const showMeasureLocal = (measure: number) => {
      clearLocalDemo();
      agentActiveRef.current = true;
      stop();
      setGateOptions({ enabled: false });
      const loaded = scoreRef.current;
      const pieceId = piece?.kind === "catalog" ? piece.id : DEMO_PIECE_ID;
      const pending = loaded
        ? Promise.resolve(loaded)
        : getPieceNotes(pieceId, undefined, { withHands: true });
      pending
        .then((score) => {
          if (!agentActiveRef.current) return;
          scoreRef.current = score;
          const sub = demoSubScore(score, {
            fromMeasure: measure - 1,
            toMeasure: measure - 1,
            tempoFactor: null,
          });
          if (sub.notes.length === 0) {
            restoreFromLocalDemo();
            return;
          }
          load(sub.notes, {
            tempo_bpm: score.tempo ?? undefined,
            duration_s: sub.duration_s,
            measures: sub.measures,
          });
          loadedRef.current = true;
          void play().catch(() => undefined);
          // Al acabar el compás vuelve la pieza normal (como la sección demo).
          localDemoTimerRef.current = window.setTimeout(
            restoreFromLocalDemo,
            sub.duration_s * 1000 + 250,
          );
        })
        .catch(() => {
          // Sin partitura no hay compás que demostrar; se recupera el estado.
          restoreFromLocalDemo();
        });
    };

    return subscribeAgentCommand(({ command, measure }) => {
      if (command === "pausar") pause();
      else if (command === "reanudar") play();
      else if (command === "parar") stop();
      else if (command === "mostrar_compas" && typeof measure === "number") {
        showMeasureLocal(measure);
      }
    });
  }, [
    piece,
    load,
    play,
    pause,
    stop,
    setGateOptions,
    setReloadKey,
    practiceMode,
    studentHand,
    waitMode.enabled,
  ]);

  useEffect(() => {
    // Con una intervención del agente en marcha el transporte toca lo que
    // manda el agente: la carga normal espera (y se re-ejecuta al terminar,
    // vía reloadKey).
    if (agentActiveRef.current) return;

    // B-032.2: en /{id} sin pieza publicada todavía (F5, URL directa) se espera
    // a la reconciliación de PracticeBridge; cargar la demo hacía parpadear p01.
    if (inSession && piece === null) return;

    // Partitura ya en memoria (subida a mano): se carga tal cual, sin backend.
    if (piece?.kind === "upload") {
      scoreRef.current = null;
      load(piece.notes, {
        // B-032.4: el modo decide qué parte suena; la cascada sigue con todo.
        audible: audibleNotes(piece.notes, practiceMode ?? "observe", studentHand),
        tempo_bpm: piece.tempo ?? undefined,
        duration_s: piece.duration_seconds ?? undefined,
        measures: piece.measures,
      });
      loadedRef.current = true;
      if (resumeReturn(piece.measures)) return;
      // B-033.8: el autoPlay suprimido (demo de compás ya restaurada) no
      // reinicia la canción; una publicación nueva (otra referencia) sí.
      if (piece.autoPlay && suppressAutoPlayRef.current !== piece) {
        void play().catch(() => undefined);
      }
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
          // B-032.4: en «una mano» suena la contraria y en «dos manos» calla el
          // transporte; la cascada sigue mostrando la pieza entera.
          audible: audibleNotes(score.notes, practiceMode ?? "observe", studentHand),
          tempo_bpm: score.tempo ?? undefined,
          duration_s: score.duration_seconds ?? undefined,
          measures: score.measures,
        });
        loadedRef.current = true;
        if (resumeReturn(score.measures)) return;
        // B-033.8: el autoPlay suprimido (demo de compás ya restaurada) no
        // reinicia la canción; una publicación nueva (otra referencia) sí.
        if (autoPlay && suppressAutoPlayRef.current !== piece) {
          void play().catch(() => undefined);
        }
      })
      .catch(() => {
        // Sin partitura no hay resaltado ni cascada; la página sigue funcionando.
      });
    return () => {
      cancelled = true;
    };
    // `practiceMode` y `studentHand` no entran: cambiar de modo no recarga la
    // partitura (eso lo hace el efecto de `setAudible` de más abajo), así que
    // la posición del transporte no se reinicia (B-032.4). `engineEpoch` entra
    // para que, si el motor se recrea, la partitura se vuelva a cargar en él.
  }, [inSession, load, play, piece, reloadKey, resumeReturn, player.engineEpoch]);

  /**
   * B-032.4: cambiar de modo o de mano cambia solo lo que suena. La partitura
   * no se recarga y el transporte no se reinicia: el motor recibe la nueva
   * parte audible (`setAudible`) y conserva la posición.
   *
   * `reloadKey` entra porque al terminar una intervención del agente el
   * audio vuelve al modo del alumno (no a «la pieza normal»).
   */
  useEffect(() => {
    if (practiceMode === null) return;
    if (agentActiveRef.current) return;
    const notes = piece?.kind === "upload" ? piece.notes : scoreRef.current?.notes;
    if (!notes) return;
    setAudible(audibleNotes(notes, practiceMode, studentHand));
  }, [practiceMode, studentHand, piece, setAudible, reloadKey]);

  /**
   * B-032.5: activa los gates en modos de práctica. En «observar» se desactivan
   * y no hay preroll. La duración del preroll es un compás (o 2 s sin tempo).
   */
  useEffect(() => {
    if (practiceMode === null || practiceMode === "observe") {
      setGateOptions({ enabled: false, hand: "both" });
      setPreroll(0);
      return;
    }
    const hand = evaluatedHand(practiceMode, studentHand) ?? "both";
    // B-033.2: el switch «Modo espera» multiplica aquí — apagarlo quita la
    // espera (el transporte no se congela en los gates) sin tocar el modo.
    setGateOptions({ enabled: waitMode.enabled, hand });
    setPreroll(defaultPreroll_s(player.tempo_bpm));
  }, [practiceMode, studentHand, setGateOptions, setPreroll, player.tempo_bpm, player.engineEpoch, waitMode.enabled]);

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

    const restorePiece = (
      resumeFromMeasure?: number | null,
      tempoFactor?: number | null,
    ) => {
      clearAccompanyTimer();
      agentActiveRef.current = false;
      // La cascada vuelve a los colores de la partitura.
      setAgentHand(null);
      stop();
      // B-032.6: los gates vuelven al modo de práctica, que es lo que el
      // estudiante estaba haciendo. B-033.2: con el switch «espera» apagado,
      // tampoco aquí se reactiva la espera.
      setGateOptions({
        enabled:
          waitMode.enabled && (practiceMode === "one_hand" || practiceMode === "both_hands"),
        hand: evaluatedHand(practiceMode ?? "observe", studentHand) ?? "both",
      });
      // B-032.6: reanudar al inicio del compás que se estaba demostrando; sin
      // destino, la recarga del B-032.4 repone el modo del alumno como antes.
      if (typeof resumeFromMeasure === "number" && Number.isFinite(resumeFromMeasure)) {
        resumeRef.current = {
          fromMeasure: resumeFromMeasure,
          tempoFactor: typeof tempoFactor === "number" ? tempoFactor : null,
        };
      }
      // B-032.4: recarga la pieza con el modo del alumno (el efecto de
      // arriba): no con «la pieza normal», sino con lo que el alumno estaba
      // practicando (audio y atenuación).
      setReloadKey((key) => key + 1);
    };

    const unsubscribe = subscribeAgentPlayback(({ event }) => {
      if (event.kind === "stop") {
        restorePiece(event.resumeFromMeasure ?? null, event.tempoFactor ?? null);
        return;
      }

      clearAccompanyTimer();
      agentActiveRef.current = true;
      stop();
      // B-032.6: los gates se desactivan mientras interviene la IA: quien
      // toca la demo no es el estudiante y una espera congelaría la demo.
      setGateOptions({ enabled: false });
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
            loadedRef.current = true;
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
          loadedRef.current = true;
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
  }, [load, play, seek, stop, setGateOptions, practiceMode, studentHand, waitMode.enabled]);

  // La barra anuncia la demo, el nombre del archivo subido o el título elegido
  // en la Library: el título siempre es la pieza que suena, nunca un marcador.
  const songTitle =
    piece === null
      ? inSession
        ? "Cargando pieza…"
        : DEMO_SONG_TITLE
      : piece.kind === "upload"
        ? piece.filename
        : piece.title;
  // Y la portada sigue la misma historia (null → SongInfo dibuja su glifo).
  const songCover = coverForPiece(piece);
  // El subtítulo de la barra es el AUTOR de la pieza: el de la ficha elegida
  // (Library, chat o sesión), nada en las subidas y el de la demo en la
  // portada sin pieza. Nada de "Piano Arrangement" inventado.
  const songComposer =
    piece === null
      ? DEMO_SONG_COMPOSER
      : piece.kind === "catalog"
        ? piece.composer ?? null
        : null;

  return (
    <div className={styles.area}>
      <PlayerBar
        player={player}
        songTitle={songTitle}
        songCover={songCover}
        arrangement={songComposer}
        practiceMode={practiceMode}
        studentHand={studentHand}
        practiceSuspended={agentHand !== null}
        onPracticeModeChange={changePracticeMode}
      />
      {process.env.NODE_ENV === "production" && player.soundProgress < 1 && (
        <div
          style={{
            height: 4,
            background: "rgba(255,255,255,0.15)",
            borderRadius: 2,
            overflow: "hidden",
            margin: "4px 0",
          }}
          aria-label="Cargando sonidos del piano"
          role="progressbar"
          aria-valuenow={Math.round(player.soundProgress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            style={{
              width: `${Math.round(player.soundProgress * 100)}%`,
              height: "100%",
              background: "#d4af37",
              transition: "width 0.2s ease",
            }}
          />
        </div>
      )}
      <PianoStage
        player={player}
        octaves={octaves}
        agentHand={agentHand}
        dimmedHand={dimmed}
      />
    </div>
  );
}
