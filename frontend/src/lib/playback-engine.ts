// description: Motor de transporte sin framework (play/pausa/stop/seek) con reloj y voz inyectados; con `audible` (B-012.7) la cascada sigue midiendo la pieza entera pero el audio sale solo de una parte (la mano de la IA).
// context: B-006.2/B-012.7; testeable con tiempo falso. usePlayback lo viste con React+WebAudio.

import {
  buildSchedule,
  clampPosition,
  clampTempoFactor,
  eventsInWindow,
  type ScheduledEvent,
} from "./playback-schedule";
import type { PlayableNote } from "./api-client";

export type { ScheduledEvent };

export type PlaybackStatus = "stopped" | "playing" | "paused";

/** Reloj en segundos (p. ej. AudioContext.currentTime o un contador falso en tests). */
export interface PlaybackClock {
  now(): number;
}

/** Salida de audio: programa una nota en un instante del reloj o silencia todo. */
export interface NoteVoice {
  scheduleNote(event: ScheduledEvent, atTime_s: number): void;
  silence(): void;
}

export interface PlaybackSnapshot {
  status: PlaybackStatus;
  position_s: number;
  tempoFactor: number;
  duration_s: number;
  /** Tempo real de la pieza en BPM (null si se desconoce). */
  tempo_bpm: number | null;
  /** Tempo efectivo para la UI: BPM × factor (null si se desconoce la base). */
  effective_bpm: number | null;
}

const DEFAULT_HORIZON_S = 0.1;

const INITIAL_SNAPSHOT: PlaybackSnapshot = {
  status: "stopped",
  position_s: 0,
  tempoFactor: 1.0,
  duration_s: 0,
  tempo_bpm: null,
  effective_bpm: null,
};

/** Un tempo base solo vale si es un número finito y positivo. */
function cleanTempo(tempo_bpm: number | null | undefined): number | null {
  if (typeof tempo_bpm !== "number" || !Number.isFinite(tempo_bpm) || tempo_bpm <= 0) {
    return null;
  }
  return tempo_bpm;
}

/** Fin de la partitura: el mayor `start + duration` de sus notas (0 si no hay). */
function scoreEnd(notes: PlayableNote[]): number {
  return notes.reduce(
    (max, note) =>
      Number.isFinite(note.start_seconds) && Number.isFinite(note.duration_seconds)
        ? Math.max(max, note.start_seconds + note.duration_seconds)
        : max,
    0,
  );
}

/**
 * Reproductor determinista: la posición solo depende del reloj inyectado.
 * Los tiempos internos van en segundos de partitura ya escalados por el factor.
 */
export class PlaybackEngine {
  private readonly clock: PlaybackClock;
  private readonly voice: NoteVoice;
  private readonly horizon_s: number;

  private notes: PlayableNote[] = [];
  /** Notas que suenan: por defecto la partitura entera; el acompañamiento (B-012.7) suena solo una mano. */
  private audible: PlayableNote[] = [];
  /** Fin de la partitura cargada (no solo de lo audible): el transporte no se corta a media pieza. */
  private scoreEnd_s = 0;
  private events: ScheduledEvent[] = [];
  private status: PlaybackStatus = "stopped";
  private tempoFactor = 1.0;
  private baseTempo_bpm: number | null = null;
  private baseDuration_s = 0;
  private duration_s = 0;
  private position_s = 0;
  private anchorWall_s = 0;
  private anchorPos_s = 0;
  private scheduledUpto_s = 0;

  constructor(clock: PlaybackClock, voice: NoteVoice, horizon_s = DEFAULT_HORIZON_S) {
    this.clock = clock;
    this.voice = voice;
    this.horizon_s = horizon_s;
  }

  /** Carga una partitura y deja el transporte parado al inicio, a factor 1.0 salvo indicación. */
  load(
    notes: PlayableNote[],
    options?: {
      tempoFactor?: number;
      duration_s?: number;
      tempo_bpm?: number;
      /**
       * Notas que suenan, si no es toda la partitura (B-012.7): la cascada y el
       * compás siguen leyendo `notes`, pero el audio sale de esta lista. Es lo
       * que permite que la IA acompañe con una mano sin borrar la otra de la vista.
       */
      audible?: PlayableNote[];
    },
  ): void {
    this.voice.silence();
    this.notes = notes;
    this.audible = options?.audible ?? notes;
    this.tempoFactor = clampTempoFactor(options?.tempoFactor ?? 1.0);
    this.baseTempo_bpm = cleanTempo(options?.tempo_bpm);
    this.events = buildSchedule(this.audible, this.tempoFactor);
    this.scoreEnd_s = scoreEnd(notes);
    this.baseDuration_s = Math.max(options?.duration_s ?? 0, 0);
    this.duration_s = this.scaledDuration();
    this.status = "stopped";
    this.position_s = 0;
    this.scheduledUpto_s = 0;
  }

  play(): void {
    if (this.status === "playing" || this.events.length === 0) return;
    if (this.position_s >= this.duration_s) {
      this.position_s = 0;
      this.scheduledUpto_s = 0;
    }
    this.status = "playing";
    this.anchorWall_s = this.clock.now();
    this.anchorPos_s = this.position_s;
  }

  pause(): void {
    if (this.status !== "playing") return;
    this.position_s = this.currentPosition();
    this.status = "paused";
    this.scheduledUpto_s = this.position_s;
    this.voice.silence();
  }

  stop(): void {
    this.status = "stopped";
    this.position_s = 0;
    this.scheduledUpto_s = 0;
    this.voice.silence();
  }

  /** Salta a una posición (recortada a la duración); si suena, sigue sonando desde ahí. */
  seek(position_s: number): void {
    this.position_s = clampPosition(position_s, this.duration_s);
    this.scheduledUpto_s = this.position_s;
    this.voice.silence();
    if (this.status === "playing") {
      this.anchorWall_s = this.clock.now();
      this.anchorPos_s = this.position_s;
    }
  }

  /** Cambia el factor (recortado al rango válido) manteniendo el punto musical. */
  setTempoFactor(factor: number): void {
    if (this.status === "playing") {
      this.position_s = this.currentPosition();
    }
    this.tempoFactor = clampTempoFactor(factor);
    this.events = buildSchedule(this.audible, this.tempoFactor);
    this.duration_s = this.scaledDuration();
    this.scheduledUpto_s = this.position_s;
    this.voice.silence();
    if (this.status === "playing") {
      this.anchorWall_s = this.clock.now();
      this.anchorPos_s = this.position_s;
    }
  }

  /**
   * Avanza un paso: programa el audio del horizonte y actualiza la posición.
   * El llamador (un intervalo en el hook) lo invoca periódicamente.
   */
  tick(): void {
    if (this.status !== "playing") return;
    const position = this.currentPosition();
    const upto = position + this.horizon_s * this.tempoFactor;
    for (const event of eventsInWindow(this.events, this.scheduledUpto_s, upto)) {
      this.voice.scheduleNote(event, this.toWallTime(event.time_s));
    }
    this.scheduledUpto_s = Math.max(this.scheduledUpto_s, upto);
    if (position >= this.duration_s) {
      this.status = "stopped";
      this.position_s = this.duration_s;
      return;
    }
    this.position_s = position;
  }

  snapshot(): PlaybackSnapshot {
    const base: Omit<PlaybackSnapshot, "status" | "position_s"> = {
      tempoFactor: this.tempoFactor,
      duration_s: this.duration_s,
      tempo_bpm: this.baseTempo_bpm,
      effective_bpm:
        this.baseTempo_bpm === null ? null : this.baseTempo_bpm * this.tempoFactor,
    };
    if (this.status === "playing") {
      return { status: this.status, position_s: this.currentPosition(), ...base };
    }
    return { status: this.status, position_s: this.position_s, ...base };
  }

  private currentPosition(): number {
    const elapsed = this.clock.now() - this.anchorWall_s;
    return clampPosition(this.anchorPos_s + elapsed * this.tempoFactor, this.duration_s);
  }

  /** Duración total al factor actual: lo que duran las notas o la duración explícita. */
  private scaledDuration(): number {
    const lastEnd = this.events.reduce(
      (max, event) => Math.max(max, event.time_s + event.duration_s),
      0,
    );
    // `scoreEnd_s` cubre el caso del acompañamiento: la IA suena una mano, pero
    // el transporte sigue midiendo la pieza entera (B-012.7). Va en tiempo de
    // partitura, así que se escala igual que la duración explícita.
    return Math.max(
      lastEnd,
      this.scoreEnd_s / this.tempoFactor,
      this.baseDuration_s / this.tempoFactor,
    );
  }

  private toWallTime(scoreTime_s: number): number {
    return this.anchorWall_s + (scoreTime_s - this.anchorPos_s) / this.tempoFactor;
  }
}

export { INITIAL_SNAPSHOT };
