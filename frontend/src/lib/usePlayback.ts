// description: Hook React del transporte; viste PlaybackEngine con WebAudio y estado.
// context: B-006.2 y B-007.5; la lógica testeable vive en playback-engine.ts, aquí solo el
// cableado: cadena master → limitador → destino y el sampler de muestras con su voz de reserva.

import { useCallback, useEffect, useRef, useState } from "react";

import {
  INITIAL_SNAPSHOT,
  PlaybackEngine,
  type NoteVoice,
  type PlaybackSnapshot,
} from "./playback-engine";
import type { PlayableNote } from "./api-client";
import { createPianoSampler, type PianoSampler } from "./piano-samples";
import { createPolySynth } from "./synth";

/** Voz del motor sobre el sampler compartido (reutilizado en audición). */
function createEngineVoice(sampler: PianoSampler): NoteVoice {
  return {
    scheduleNote: (event, atTime_s) =>
      sampler.scheduleNote(event.pitch, event.velocity, event.duration_s, atTime_s),
    silence: () => sampler.silence(),
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
  const engineRef = useRef<PlaybackEngine | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const samplerRef = useRef<PianoSampler | null>(null);
  const statusRef = useRef<PlaybackSnapshot["status"]>("stopped");
  statusRef.current = snapshot.status;

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

  const ensureEngine = useCallback((): PlaybackEngine => {
    if (!engineRef.current) {
      const ctx = createAudioContext();
      ctxRef.current = ctx;
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
      });
      samplerRef.current = sampler;
      // Capa 0 (ventana visible) ya; el resto del teclado en el primer hueco libre.
      void sampler.preload("hq");
      runWhenIdle(() => void sampler.preload("lq"));
      engineRef.current = new PlaybackEngine(
        { now: () => ctx.currentTime },
        createEngineVoice(sampler),
      );
    }
    return engineRef.current;
  }, []);

  const load = useCallback(
    (
      loaded: PlayableNote[],
      options?: { tempoFactor?: number; duration_s?: number; tempo_bpm?: number },
    ) => {
      ensureEngine().load(loaded, options);
      setNotes(loaded);
      sync();
    },
    [ensureEngine, sync],
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

  // Mientras suena, un intervalo avanza el motor y refresca la posición para la UI.
  useEffect(() => {
    if (statusRef.current !== "playing") return;
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
    };
  }, []);

  return {
    ...snapshot,
    notes,
    load,
    play,
    pause,
    stop,
    seek,
    setTempoFactor,
    auditionOn,
    auditionOff,
    getPosition,
  };
}
