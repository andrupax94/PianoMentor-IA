// description: Hook React del transporte; viste PlaybackEngine con WebAudio y estado.
// context: B-006.2; la lógica testeable vive en playback-engine.ts, aquí solo el cableado.

import { useCallback, useEffect, useRef, useState } from "react";

import {
  INITIAL_SNAPSHOT,
  PlaybackEngine,
  type NoteVoice,
  type PlaybackSnapshot,
} from "./playback-engine";
import type { PlayableNote } from "./api-client";
import { createPolySynth, type PolySynth } from "./synth";

/** Voz del motor sobre el sintetizador compartido (reutilizado en audición). */
function createEngineVoice(synth: PolySynth): NoteVoice {
  return {
    scheduleNote: (event, atTime_s) =>
      synth.scheduleNote(event.pitch, event.velocity, event.duration_s, atTime_s),
    silence: () => synth.silence(),
  };
}

function createAudioContext(): AudioContext {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  return new Ctor();
}

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
  const synthRef = useRef<PolySynth | null>(null);
  const statusRef = useRef<PlaybackSnapshot["status"]>("stopped");
  statusRef.current = snapshot.status;

  const sync = useCallback(() => {
    if (engineRef.current) setSnapshot(engineRef.current.snapshot());
  }, []);

  const ensureEngine = useCallback((): PlaybackEngine => {
    if (!engineRef.current) {
      const ctx = createAudioContext();
      ctxRef.current = ctx;
      const master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      const synth = createPolySynth(ctx, master);
      synthRef.current = synth;
      engineRef.current = new PlaybackEngine(
        { now: () => ctx.currentTime },
        createEngineVoice(synth),
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
      synthRef.current?.noteOn(pitch, velocity);
    },
    [ensureEngine],
  );

  /** Suelta una tecla del PC. */
  const auditionOff = useCallback((pitch: number) => {
    synthRef.current?.noteOff(pitch);
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
    const getCtx = () => ctxRef.current;
    return () => {
      engineRef.current?.stop();
      engineRef.current = null;
      synthRef.current = null;
      void getCtx()?.close().catch(() => undefined);
      ctxRef.current = null;
    };
  }, []);

  return { ...snapshot, notes, load, play, pause, stop, seek, setTempoFactor, auditionOn, auditionOff };
}
