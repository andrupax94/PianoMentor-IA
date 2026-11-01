// description: Motor de transporte sin framework (play/pausa/stop/seek) con reloj y voz inyectados; con `audible` (B-012.7) la cascada sigue midiendo la pieza entera pero el audio sale solo de una parte (la mano de la IA).
// context: B-006.2/B-012.7; testeable con tiempo falso. usePlayback lo viste con React+WebAudio.

import {
  buildSchedule,
  clampPosition,
  clampTempoFactor,
  eventsInWindow,
  type ScheduledEvent,
} from "./playback-schedule";
import { assignMeasure, gateAt, type Gate, type GateHand } from "./practice-gate";
import type { PieceMeasures, PlayableNote } from "./api-client";

export type { ScheduledEvent };

export type PlaybackStatus = "stopped" | "playing" | "paused" | "waiting" | "preroll";

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
  /** Gate actual cuando el transporte está esperando (B-032.5). */
  currentGate: Gate | null;
  /** Tiempo restante de preroll en segundos; null fuera del preroll (B-032.5). */
  prerollRemaining_s: number | null;
  /** Instante de reloj en que entró en waiting; null si no espera (B-032.5). */
  waitingSince_wall_s: number | null;
}

const DEFAULT_HORIZON_S = 0.1;

const INITIAL_SNAPSHOT: PlaybackSnapshot = {
  status: "stopped",
  position_s: 0,
  tempoFactor: 1.0,
  duration_s: 0,
  tempo_bpm: null,
  effective_bpm: null,
  currentGate: null,
  prerollRemaining_s: null,
  waitingSince_wall_s: null,
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
  /** Opciones de gates (B-032.5). */
  private gateEnabled = false;
  private gateHand: GateHand = "both";
  private currentGate: Gate | null = null;
  private waitingSince_wall_s: number | null = null;
  /** Preroll antes del inicio real (B-032.5). */
  private preroll_s = 0;
  private prerollElapsed_s = 0;
  /**
   * B-032.6: inicios de compás de la pieza en segundos de partitura sin
   * escalar, para que los gates reporten el compás al backend (las reglas de
   * strikes cuentan por compás).
   */
  private measureStarts: number[] = [];

  constructor(clock: PlaybackClock, voice: NoteVoice, horizon_s = DEFAULT_HORIZON_S) {
    this.clock = clock;
    this.voice = voice;
    this.horizon_s = horizon_s;
  }

  /**
   * Cambia la parte audible sin tocar la partitura (B-032.4): el modo de
   * práctica cambia qué suena (la mano contraria, o nada en «dos manos») sin
   * recargar la partitura ni reiniciar la posición. Reconstruye el schedule
   * como hace `setTempoFactor`.
   */
  setAudible(audible: PlayableNote[]): void {
    if (this.status === "playing" || this.status === "waiting") {
      this.position_s = this.currentPosition();
    }
    this.audible = audible;
    this.events = buildSchedule(this.audible, this.tempoFactor);
    this.duration_s = this.scaledDuration();
    this.scheduledUpto_s = this.position_s;
    this.voice.silence();
    if (this.status === "playing" || this.status === "waiting") {
      this.anchorWall_s = this.clock.now();
      this.anchorPos_s = this.position_s;
    }
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
      /**
       * Rejilla de compases de la pieza (B-032.6): la usa el modo espera para
       * reportar el compás de cada gate al backend.
       */
      measures?: PieceMeasures | null;
    },
  ): void {
    this.voice.silence();
    this.notes = notes;
    this.audible = options?.audible ?? notes;
    this.tempoFactor = clampTempoFactor(options?.tempoFactor ?? 1.0);
    this.baseTempo_bpm = cleanTempo(options?.tempo_bpm);
    this.events = buildSchedule(this.audible, this.tempoFactor);
    this.measureStarts = [...(options?.measures?.starts_s ?? [])];
    this.scoreEnd_s = scoreEnd(notes);
    this.baseDuration_s = Math.max(options?.duration_s ?? 0, 0);
    this.duration_s = this.scaledDuration();
    this.status = "stopped";
    this.position_s = 0;
    this.scheduledUpto_s = 0;
    this.currentGate = null;
    this.waitingSince_wall_s = null;
    this.prerollElapsed_s = 0;
  }

  play(): void {
    if (this.status === "playing" || this.status === "preroll" || this.status === "waiting" || this.events.length === 0) return;
    if (this.position_s >= this.duration_s) {
      this.position_s = 0;
      this.scheduledUpto_s = 0;
    }

    // B-032.5: en modo práctica, play desde el inicio arranca la cuenta atrás.
    if (this.gateEnabled && this.position_s === 0 && this.preroll_s > 0) {
      this.status = "preroll";
      this.prerollElapsed_s = 0;
      this.anchorWall_s = this.clock.now();
      this.anchorPos_s = 0;
      this.voice.silence();
      return;
    }

    this.status = "playing";
    this.anchorWall_s = this.clock.now();
    this.anchorPos_s = this.position_s;
  }

  pause(): void {
    if (this.status === "playing") {
      this.position_s = this.currentPosition();
    } else if (this.status === "preroll") {
      this.prerollElapsed_s = Math.min(
        this.clock.now() - this.anchorWall_s,
        this.preroll_s,
      );
    } else if (this.status === "waiting") {
      // Congelar la posición en el gate.
      this.position_s = this.currentGate?.time_s ?? this.position_s;
    } else {
      return;
    }
    this.status = "paused";
    this.scheduledUpto_s = this.position_s;
    this.voice.silence();
  }

  stop(): void {
    this.status = "stopped";
    this.position_s = 0;
    this.scheduledUpto_s = 0;
    this.prerollElapsed_s = 0;
    this.currentGate = null;
    this.waitingSince_wall_s = null;
    this.voice.silence();
  }

  /** Salta a una posición (recortada a la duración); si suena, sigue sonando desde ahí. */
  seek(position_s: number): void {
    this.position_s = clampPosition(position_s, this.duration_s);
    this.scheduledUpto_s = this.position_s;
    this.currentGate = null;
    this.waitingSince_wall_s = null;
    this.voice.silence();
    if (this.status === "playing" || this.status === "waiting") {
      this.anchorWall_s = this.clock.now();
      this.anchorPos_s = this.position_s;
    }
  }

  /** Cambia el factor (recortado al rango válido) manteniendo el punto musical. */
  setTempoFactor(factor: number): void {
    if (this.status === "playing" || this.status === "waiting") {
      this.position_s = this.currentPosition();
    }
    this.tempoFactor = clampTempoFactor(factor);
    this.events = buildSchedule(this.audible, this.tempoFactor);
    this.duration_s = this.scaledDuration();
    this.scheduledUpto_s = this.position_s;
    this.voice.silence();
    if (this.status === "playing" || this.status === "waiting") {
      this.anchorWall_s = this.clock.now();
      this.anchorPos_s = this.position_s;
    }
  }

  /** Activa o desactiva los gates y la mano que gobiernan el modo espera (B-032.5). */
  setGateOptions(options: { enabled: boolean; hand?: GateHand }): void {
    this.gateEnabled = options.enabled;
    if (options.hand) this.gateHand = options.hand;
    if (!this.gateEnabled) {
      this.currentGate = null;
      this.waitingSince_wall_s = null;
    }
  }

  /** Duración de la cuenta atrás antes del primer gate (B-032.5). */
  setPreroll(seconds: number): void {
    this.preroll_s = Math.max(0, seconds);
  }

  /** El gate actual se ha satisfecho: el transporte reanuda desde ahí (B-032.5). */
  resolveGate(): void {
    if (this.status !== "waiting" || !this.currentGate) return;
    this.status = "playing";
    this.position_s = this.currentGate.time_s;
    this.scheduledUpto_s = this.position_s;
    this.currentGate = null;
    this.waitingSince_wall_s = null;
    this.anchorWall_s = this.clock.now();
    this.anchorPos_s = this.position_s;
  }

  /** Salta al gate siguiente sin esperar (recuperación manual). */
  skipGate(): void {
    if (!this.gateEnabled || !this.currentGate) return;
    const next = this.nextGate(this.currentGate.time_s);
    this.currentGate = next;
    if (next) {
      this.position_s = next.time_s;
      this.waitingSince_wall_s = this.clock.now();
    } else {
      this.status = "playing";
      this.waitingSince_wall_s = null;
    }
    this.scheduledUpto_s = this.position_s;
    this.anchorWall_s = this.clock.now();
    this.anchorPos_s = this.position_s;
  }

  /**
   * Avanza un paso: programa el audio del horizonte y actualiza la posición.
   * El llamador (un intervalo en el hook) lo invoca periódicamente.
   */
  tick(): void {
    if (this.status === "preroll") {
      const elapsed = this.clock.now() - this.anchorWall_s;
      this.prerollElapsed_s = Math.min(elapsed, this.preroll_s);
      if (this.prerollElapsed_s >= this.preroll_s) {
        this.finishPreroll();
      }
      return;
    }

    if (this.status !== "playing") return;

    const position = this.currentPosition();

    // B-032.5: si hay un gate inmediato, congelar en él en vez de avanzar.
    if (this.gateEnabled) {
      const gate = this.nextGate(position);
      if (gate && gate.time_s <= position + this.horizon_s * this.tempoFactor) {
        this.enterWaiting(gate);
        return;
      }
    }

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
      currentGate: this.currentGate,
      prerollRemaining_s: this.status === "preroll" ? this.preroll_s - this.prerollElapsed_s : null,
      waitingSince_wall_s: this.waitingSince_wall_s,
    };
    if (this.status === "playing") {
      return { status: this.status, position_s: this.currentPosition(), ...base };
    }
    return { status: this.status, position_s: this.position_s, ...base };
  }

  /**
   * Posición musical para la cascada: durante el preroll es negativa, para que
   * las notas del inicio se vean acercándose antes de la primera tecla (B-032.5).
   */
  displayPosition_s(): number {
    if (this.status === "preroll") {
      return -(this.preroll_s - this.prerollElapsed_s);
    }
    return this.position_s;
  }

  private enterWaiting(gate: Gate): void {
    this.position_s = gate.time_s;
    this.status = "waiting";
    this.currentGate = gate;
    this.waitingSince_wall_s = this.clock.now();
    this.scheduledUpto_s = this.position_s;
    this.voice.silence();
  }

  /**
   * Primer gate al que se llegaría desde `position_s`, ya con su compás real
   * (B-032.6). Los tiempos de los gates van escalados por el factor y la
   * rejilla no: se escala el mapa de inicios antes de asignar el compás.
   */
  private nextGate(position_s: number): Gate | null {
    const gate = gateAt(this.events, position_s, this.gateHand);
    if (gate === null || this.measureStarts.length === 0) return gate;
    const scaledStarts = this.measureStarts.map((start) => start / this.tempoFactor);
    return assignMeasure([gate], scaledStarts)[0] ?? null;
  }

  private finishPreroll(): void {
    this.position_s = 0;
    this.scheduledUpto_s = 0;
    this.prerollElapsed_s = this.preroll_s;
    if (this.gateEnabled) {
      const gate = this.nextGate(0);
      if (gate) {
        this.enterWaiting(gate);
        return;
      }
    }
    this.status = "playing";
    this.anchorWall_s = this.clock.now();
    this.anchorPos_s = 0;
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
