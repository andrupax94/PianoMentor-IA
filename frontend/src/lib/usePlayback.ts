// description: Hook React del transporte; viste PlaybackEngine con WebAudio y estado.
// context: B-006.2; la lógica testeable vive en playback-engine.ts, aquí solo el cableado.

import { useCallback, useEffect, useRef, useState } from "react";

import {
  INITIAL_SNAPSHOT,
  PlaybackEngine,
  type NoteVoice,
  type PlaybackSnapshot,
} from "./playback-engine";
import { pitchToFrequency, type ScheduledEvent } from "./playback-schedule";
import type { PlayableNote } from "./api-client";

interface ActiveVoice {
  osc: OscillatorNode;
  gain: GainNode;
}

/** Voz WebAudio: oscilador triangular con envolvente según velocity y duración. */
function createWebAudioVoice(ctx: AudioContext, master: GainNode): NoteVoice {
  const active = new Set<ActiveVoice>();

  return {
    scheduleNote(event: ScheduledEvent, atTime_s: number): void {
      const startAt = Math.max(atTime_s, ctx.currentTime);
      const sounding = Math.max(event.duration_s, 0.05);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = pitchToFrequency(event.pitch);
      const peak = Math.max(0.5 * (event.velocity / 127), 0.0011);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + sounding);
      osc.connect(gain);
      gain.connect(master);
      const handle: ActiveVoice = { osc, gain };
      active.add(handle);
      osc.onended = () => active.delete(handle);
      osc.start(startAt);
      osc.stop(startAt + sounding + 0.05);
    },
    silence(): void {
      const now = ctx.currentTime;
      for (const handle of active) {
        try {
          handle.gain.gain.cancelScheduledValues(now);
          handle.gain.gain.setTargetAtTime(0.0001, now, 0.01);
          handle.osc.stop(now + 0.05);
        } catch {
          // Un oscilador ya detenido no debe romper la pausa.
        }
      }
      active.clear();
    },
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
  const engineRef = useRef<PlaybackEngine | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
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
      engineRef.current = new PlaybackEngine(
        { now: () => ctx.currentTime },
        createWebAudioVoice(ctx, master),
      );
    }
    return engineRef.current;
  }, []);

  const load = useCallback(
    (
      notes: PlayableNote[],
      options?: { tempoFactor?: number; duration_s?: number; tempo_bpm?: number },
    ) => {
      ensureEngine().load(notes, options);
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
      void getCtx()?.close().catch(() => undefined);
      ctxRef.current = null;
    };
  }, []);

  return { ...snapshot, load, play, pause, stop, seek, setTempoFactor };
}
