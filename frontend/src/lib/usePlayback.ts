// description: Hook React del transporte (B-006.2): snapshot, notas, rejilla de compases (measures), acciones, audición y getPosition; load acepta `audible` para el acompañamiento (B-012.7). B-033.5: al montar el motor publica el tap del limitador para la grabación rec del modo depuración.
// context: B-006.2/B-007.5/B-012.7; la lógica testeable vive en playback-engine.ts, aquí solo el cableado: cadena master → limitador → destino y el sampler de muestras con su voz de reserva. `audible` deja el audio en la mano de la IA sin borrar la pieza de la cascada (B-012.7).

import { useCallback, useEffect, useRef, useState } from "react";

import {
  INITIAL_SNAPSHOT,
  PlaybackEngine,
  type NoteVoice,
  type PlaybackSnapshot,
} from "./playback-engine";
import type { PieceMeasures, PlayableNote } from "./api-client";
import { createPianoSampler, type PianoSampler } from "./piano-samples";
import { createPolySynth } from "./synth";
import { publishAudioTap } from "./practice-recorder";

/** Voz del motor sobre el sampler compartido (reutilizado en audición). */
function createEngineVoice(sampler: PianoSampler): NoteVoice {
  return {
    scheduleNote: (event, atTime_s) =>
      sampler.scheduleNote(event.pitch, event.velocity, event.duration_s, atTime_s),
    // B-032.8 ajuste (2026-11-07, vía diagnóstico con ChatGPT): el wrapper
    // DESCARTABA las opciones de `silence` — el `keepAudition: true` de
    // enterWaiting moría aquí y el congelado cortaba igualmente la tecla
    // sostenida del alumno. Ahora las traslada.
    silence: (options) => sampler.silence(options),
  };
}

/** Ejecuta en el primer hueco del navegador, con recambio si no existe la API. */
function runWhenIdle(task: () => void): void {
  const requestIdle =
    window.requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 400));
  requestIdle(() => task());
}

function createAudioContext(): AudioContext {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  return new Ctor();
}

/** Manejo del transporte que reparte PianoStage a sus dos hijos. */
export type PlaybackHandle = ReturnType<typeof usePlayback>;

/**
 * Transporte de reproducción para un componente: expone el snapshot
 * (status, position_s, tempoFactor, duration_s) y las acciones.
 * El AudioContext se crea en el primer uso (política de autoplay del navegador).
 */
export function usePlayback(tickMs = 25) {
  const [snapshot, setSnapshot] = useState<PlaybackSnapshot>(INITIAL_SNAPSHOT);
  const [notes, setNotes] = useState<PlayableNote[]>([]);
  const [measures, setMeasures] = useState<PieceMeasures | null>(null);
  const engineRef = useRef<PlaybackEngine | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const [soundProgress, setSoundProgress] = useState(0);
  const [soundReady, setSoundReady] = useState(false);
  const samplerRef = useRef<PianoSampler | null>(null);
  const statusRef = useRef<PlaybackSnapshot["status"]>("stopped");
  statusRef.current = snapshot.status;
  /**
   * Época del motor: cambia cada vez que `ensureEngine` crea uno nuevo. Con el
   * doble montaje de StrictMode en desarrollo el primer motor se destruye (su
   * partitura va con él) y el que sobrevive está vacío; un consumidor que aún
   * no vuelva a montarse se quedaría a play mudo. Subir esta época obliga al
   * efecto de carga del piano a volver a ejecutarse contra el motor vigente.
   */
  const [engineEpoch, setEngineEpoch] = useState(1);

  const sync = useCallback(() => {
    if (engineRef.current) setSnapshot(engineRef.current.snapshot());
  }, []);

  /**
   * Posición viva del motor, sin pasar por estado de React. La usa la cascada
   * de notas para animar por frame sin re-renderizar el árbol.
   */
  const getPosition = useCallback(
    () => engineRef.current?.snapshot().position_s ?? 0,
    [],
  );

  /**
   * Posición para la cascada, incluyendo el preroll negativo (B-032.5).
   */
  const getDisplayPosition = useCallback(
    () => engineRef.current?.displayPosition_s() ?? 0,
    [],
  );

  const ensureEngine = useCallback((): PlaybackEngine => {
    if (!engineRef.current) {
      const ctx = createAudioContext();
      ctxRef.current = ctx;
      if (ctx.state === "suspended") void ctx.resume();
      const master = ctx.createGain();
      master.gain.value = 0.9;
      // Un acorde de muestras pica más fuerte que una onda simple: el limitador
      // evita el clip sin bajar el volumen de las notas sueltas.
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.knee.value = 12;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.25;
      master.connect(limiter);
      limiter.connect(ctx.destination);
      // La voz de reserva suena mientras no hay muestra decodificada: nunca silencio.
      const sampler = createPianoSampler(ctx, master, {
        fallback: createPolySynth(ctx, master),
        onProgress: (p) => {
          setSoundProgress(p);
          if (p >= 1) setSoundReady(true);
        },
      });
      samplerRef.current = sampler;
      // B-033.5: el nodo por donde TODO el piano pasa ya mezclado (el
      // limitador, justo antes del destino) es el tap de la grabación rec:
      // el almacén de la grabación lo recibe aquí y conecta/desconecta su
      // propio cable sin tocar el grafo de sonido real.
      publishAudioTap({ ctx, node: limiter });
      // La carga se dispara al montar (useEffect), no aquí, para que la barra
      // avance aunque no se pulse ninguna tecla.
      engineRef.current = new PlaybackEngine(
        { now: () => ctx.currentTime },
        createEngineVoice(sampler),
      );
      // Motor nuevo: se notifica a los consumidores para que la partitura se
      // cargue aquí también (los consumers del contexto se re-renderizan).
      setEngineEpoch((epoch) => epoch + 1);
    }
    return engineRef.current;
  }, []);

  const load = useCallback(
    (
      loaded: PlayableNote[],
      options?: {
        tempoFactor?: number;
        duration_s?: number;
        tempo_bpm?: number;
        /** Notas que suenan si no es toda la partitura (B-012.7). */
        audible?: PlayableNote[];
        measures?: PieceMeasures | null;
      },
    ) => {
      ensureEngine().load(loaded, options);
      const sampler = samplerRef.current;
      if (sampler) {
        sampler.warmup(loaded.map((note) => note.pitch));
      }
      setNotes(loaded);
      setMeasures(options?.measures ?? null);
      sync();
    },
    [ensureEngine, sync],
  );

  /**
   * Cambia la parte audible sin recargar la partitura (B-032.4): el modo de
   * práctica decide qué mano suena y el cambio no reinicia la posición.
   */
  const setAudible = useCallback(
    (audible: PlayableNote[]) => {
      ensureEngine().setAudible(audible);
      sync();
    },
    [ensureEngine, sync],
  );

  /**
   * Activa o desactiva los gates del modo espera (B-032.5).
   */
  const setGateOptions = useCallback(
    (options: { enabled: boolean; hand?: import("./practice-gate").GateHand }) => {
      ensureEngine().setGateOptions(options);
      sync();
    },
    [ensureEngine, sync],
  );

  /**
   * Duración de la cuenta atrás antes del primer gate (B-032.5).
   */
  const setPreroll = useCallback(
    (seconds: number) => {
      ensureEngine().setPreroll(seconds);
      sync();
    },
    [ensureEngine, sync],
  );

  /**
   * Reanuda el transporte tras satisfacer un gate (B-032.5).
   */
  const resolveGate = useCallback(() => {
    engineRef.current?.resolveGate();
    sync();
  }, [sync]);

  /**
   * B-032.8: tecla errónea durante la espera; la cascada pegada a la línea.
   */
  const wrongGate = useCallback(() => {
    engineRef.current?.wrongGate();
    sync();
  }, [sync]);

  /**
   * B-032.8 ajuste (2026-11-07): gate satisfecho por anticipación — se marca
   * como tocado y el transporte lo cruza sonando, sin congelar.
   */
  const markGatePlayed = useCallback((time_s: number) => {
    engineRef.current?.markGatePlayed(time_s);
    sync();
  }, [sync]);

  /**
   * Salta al gate siguiente (recuperación manual; B-032.5).
   */
  const skipGate = useCallback(() => {
    engineRef.current?.skipGate();
    sync();
  }, [sync]);

  /** Snapshot actual del motor, útil para controladores puros (B-032.5). */
  const getEngineSnapshot = useCallback(
    () => engineRef.current?.snapshot() ?? INITIAL_SNAPSHOT,
    [],
  );

  const play = useCallback(async () => {
    const engine = ensureEngine();
    if (ctxRef.current && ctxRef.current.state === "suspended") {
      await ctxRef.current.resume();
    }
    engine.play();
    sync();
  }, [ensureEngine, sync]);

  const pause = useCallback(() => {
    engineRef.current?.pause();
    sync();
  }, [sync]);

  const stop = useCallback(() => {
    engineRef.current?.stop();
    sync();
  }, [sync]);

  const seek = useCallback(
    (position_s: number) => {
      engineRef.current?.seek(position_s);
      sync();
    },
    [sync],
  );

  const setTempoFactor = useCallback(
    (factor: number) => {
      engineRef.current?.setTempoFactor(factor);
      sync();
    },
    [sync],
  );

  /** Suena una tecla del PC al instante (audición, fuera del transporte). */
  const auditionOn = useCallback(
    (pitch: number, velocity: number) => {
      ensureEngine();
      // Política de autoplay: si el contexto arrancó suspendido, este gesto lo desbloquea.
      if (ctxRef.current?.state === "suspended") {
        void ctxRef.current.resume().catch(() => undefined);
      }
      samplerRef.current?.noteOn(pitch, velocity);
    },
    [ensureEngine],
  );

  /** Suelta una tecla del PC. */
  const auditionOff = useCallback((pitch: number) => {
    samplerRef.current?.noteOff(pitch);
  }, []);

  // Carga las muestras al montar para que la barra de progreso avance aunque no
  // se haya pulsado ninguna tecla (U-004). El AudioContext puede arrancar
  // suspendido; el resume se hace en el primer gesto del usuario.
  useEffect(() => {
    const engine = ensureEngine();
    void engine;
    const sampler = samplerRef.current;
    if (sampler) {
      void sampler.ready
        .then(() => sampler.loadAll())
        .then(() => setSoundReady(true))
        .catch(() => setSoundReady(true));
    } else {
      setSoundReady(true);
    }
  }, [ensureEngine]);

  // Mientras suena, un intervalo avanza el motor y refresca la posición para la UI.
  useEffect(() => {
    // El preroll también necesita tick para avanzar la cuenta atrás (B-032.5).
    if (statusRef.current !== "playing" && statusRef.current !== "preroll") return;
    const timer = window.setInterval(() => {
      engineRef.current?.tick();
      sync();
    }, tickMs);
    return () => window.clearInterval(timer);
  }, [snapshot.status, sync, tickMs]);

  // Al desmontar: parar todo y cerrar el contexto de audio.
  useEffect(() => {
    return () => {
      engineRef.current?.stop();
      engineRef.current = null;
      samplerRef.current?.silence();
      samplerRef.current = null;
      void ctxRef.current?.close().catch(() => undefined);
      ctxRef.current = null;
      // Tap inválido: el grafo de sonido acaba de morir y una grabación en
      // curso queda huérfana; el almacén rompe el cable (B-033.5).
      publishAudioTap(null);
    };
  }, []);

  return {
    ...snapshot,
    notes,
    measures,
    load,
    play,
    pause,
    stop,
    seek,
    setAudible,
    setTempoFactor,
    setGateOptions,
    setPreroll,
    resolveGate,
    wrongGate,
    markGatePlayed,
    skipGate,
    auditionOn,
    auditionOff,
    getPosition,
    getDisplayPosition,
    getEngineSnapshot,
    soundProgress,
    soundReady,
    engineEpoch,
  };
}
