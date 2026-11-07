// description: Motor de transporte sin framework (play/pausa/stop/seek) con reloj y voz inyectados; con `audible` (B-012.7) la cascada sigue midiendo la pieza entera pero el audio sale solo de una parte (la mano de la IA). En modo espera el gate congela cuando la posición LLEGA a su tiempo (no en horizonte), el audio no se programa más allá del gate y las notas de su instante suenan al reanudar (B-032.5/B-032.8).
// context: B-006.2/B-012.7/B-032.5/B-032.8; testeable con tiempo falso. usePlayback lo viste con React+WebAudio. La reprogramación tras silence() parte de scheduledUpto, que nace antes del t=0 para que la primera nota entre en la ventana.

import {
  buildSchedule,
  clampPosition,
  clampTempoFactor,
  eventsInWindow,
  type ScheduledEvent,
} from "./playback-schedule";
import { assignMeasure, CHORD_TOLERANCE_S, gatesForSchedule, type Gate, type GateHand } from "./practice-gate";
import { decayOffset_s, gateOvershoot_s, waitingGateOffset_s } from "./gate-display";
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
  silence(options?: { keepAudition?: boolean }): void;
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
  /**
   * Primer gate aún sin tocar que llega a la posición en curso, esté o no en
   * espera (B-033.2, robot en modo flujo): con el modo espera apagado el
   * transporte nunca llega a congelarse — no hay `currentGate` — y el pianista
   * robot se conduce por este gate venidero, igual que la cascada pasa las
   * notas. En espera coincide con `currentGate`.
   */
  upcomingGate: Gate | null;
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
  upcomingGate: null,
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
  /** Notas usadas para los gates del modo espera (B-032.5): siempre la partitura entera, filtrada por mano por `gateHand`. */
  private gateEvents: ScheduledEvent[] = [];
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
  /**
   * B-032.8: sobresalto del gate congelado (el margen fijo con el que se
   * entró; un cambio de factor de tempo mientras se espera no lo reescala).
   */
  private waitingOvershoot_s = 0;
  /** B-032.8: tecla errónea en Marcha (offset que se desvanece hasta la línea). */
  private wrongResetSince_wall_s: number | null = null;
  private wrongResetOffset_s = 0;
  /** B-032.8: exceso visual que la barra lleva cuando el hit llega antes del rebobinado. */
  private hitLead_s = 0;
  private hitLeadSince_wall_s: number = 0;
  /**
   * B-032.8: el tiempo del último gate ya tocado (hit, salto o entrada en
   * waiting). La selección de gates no repite nada hasta aquí: sin esto, un
   * gate en la posición exacta (el primero de la pieza) se repetía para
   * siempre con la nueva semántica de `gateAt`.
   */
  private gatesPlayedUntil_s = -Number.MAX_SAFE_INTEGER;
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
    this.gateEvents = buildSchedule(this.notes, this.tempoFactor);
    this.measureStarts = [...(options?.measures?.starts_s ?? [])];
    this.scoreEnd_s = scoreEnd(notes);
    this.baseDuration_s = Math.max(options?.duration_s ?? 0, 0);
    this.duration_s = this.scaledDuration();
    this.status = "stopped";
    this.position_s = 0;
    // La programación arranca antes del inicio: la ventana de eventos es
    // (from, upto], y con from=0 quedaba fuera la nota que empieza en el
    // segundo 0 (el primer MI del Prelude en A nunca sonaba).
    this.scheduledUpto_s = -CHORD_TOLERANCE_S;
    this.currentGate = null;
    this.waitingSince_wall_s = null;
    this.waitingOvershoot_s = 0;
    this.wrongResetSince_wall_s = null;
    this.wrongResetOffset_s = 0;
    this.hitLead_s = 0;
    // B-032.8: nada tocado todavía (el primero de la pieza vuelve a contar).
    this.gatesPlayedUntil_s = -Number.MAX_SAFE_INTEGER;
    this.prerollElapsed_s = 0;
  }

  play(): void {
    if (this.status === "playing" || this.status === "preroll" || this.status === "waiting" || this.notes.length === 0) return;
    if (this.position_s >= this.duration_s) {
      this.position_s = 0;
      // Antes del inicio: la nota del segundo 0 vuelve a ser programable.
      this.scheduledUpto_s = -CHORD_TOLERANCE_S;
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
    // El audio se silencia al pausar; el re-agendado parte del punto pausado
    // sin perder las notas de un instante de gate (por ejemplo si se pausó
    // desde la espera).
    this.scheduledUpto_s = Math.min(this.scheduledUpto_s, this.position_s);
    this.voice.silence();
  }

  stop(): void {
    this.status = "stopped";
    this.position_s = 0;
    // Antes del inicio: ver load() — el t=0 debe poder programarse al volver.
    this.scheduledUpto_s = -CHORD_TOLERANCE_S;
    this.prerollElapsed_s = 0;
    this.currentGate = null;
    this.waitingSince_wall_s = null;
    this.waitingOvershoot_s = 0;
    this.wrongResetSince_wall_s = null;
    this.wrongResetOffset_s = 0;
    this.hitLead_s = 0;
    this.gatesPlayedUntil_s = -Number.MAX_SAFE_INTEGER;
    this.voice.silence();
  }

  /** Salta a una posición (recortada a la duración); si suena, sigue sonando desde ahí. */
  seek(position_s: number): void {
    this.position_s = clampPosition(position_s, this.duration_s);
    this.scheduledUpto_s = this.position_s;
    this.currentGate = null;
    this.waitingSince_wall_s = null;
    this.waitingOvershoot_s = 0;
    this.wrongResetSince_wall_s = null;
    this.wrongResetOffset_s = 0;
    this.hitLead_s = 0;
    // B-032.8: los gates por debajo del punto al que se salta quedan tocados;
    // un gate justo en la posición sigue siendo alcanzable (2× la tolerancia
    // para que el filtrado del nextGate lo deje pasar).
    this.gatesPlayedUntil_s = this.position_s - 2 * CHORD_TOLERANCE_S;
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
    this.gateEvents = buildSchedule(this.notes, this.tempoFactor);
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
      this.waitingOvershoot_s = 0;
      this.wrongResetSince_wall_s = null;
      this.wrongResetOffset_s = 0;
      this.hitLead_s = 0;
      this.gatesPlayedUntil_s = -Number.MAX_SAFE_INTEGER;
    }
  }

  /** Duración de la cuenta atrás antes del primer gate (B-032.5). */
  setPreroll(seconds: number): void {
    this.preroll_s = Math.max(0, seconds);
  }

  /** El gate actual se ha satisfecho: el transporte reanuda desde ahí (B-032.5). */
  resolveGate(): void {
    if (this.status !== "waiting" || !this.currentGate) return;
    // B-032.8: si el hit llega antes del rebobinado, la barra lleva un exceso
    // por encima de la línea; se desvanece al reanudar para que la cascada no
    // salte de regreso.
    const display = this.waitingDisplayPosition_s();
    this.hitLead_s = Math.max(0, display - this.position_s);
    this.hitLeadSince_wall_s = this.clock.now();
    this.wrongResetSince_wall_s = null;
    this.wrongResetOffset_s = 0;
    this.waitingOvershoot_s = 0;
    this.status = "playing";
    this.position_s = this.currentGate.time_s;
    this.gatesPlayedUntil_s = Math.max(this.gatesPlayedUntil_s, this.position_s);
    // El audio ya quedó re-agendado por enterWaiting justo antes del gate: las
    // notas de su instante se programan ahora que vuelve a sonar (B-032.8).
    this.currentGate = null;
    this.waitingSince_wall_s = null;
    this.anchorWall_s = this.clock.now();
    this.anchorPos_s = this.position_s;
  }

  /** Salta al gate siguiente sin esperar (recuperación manual). */
  skipGate(): void {
    if (!this.gateEnabled || !this.currentGate) return;
    // B-032.8: el gate saltado cuenta como tocado; el siguiente no se repite.
    this.gatesPlayedUntil_s = Math.max(this.gatesPlayedUntil_s, this.currentGate.time_s);
    const next = this.nextGate(this.currentGate.time_s);
    this.currentGate = next;
    if (next) {
      this.position_s = next.time_s;
      this.waitingSince_wall_s = this.clock.now();
      // B-032.8: el rebote del siguiente gate lo dimensiona su propia duración.
      this.waitingOvershoot_s = gateOvershoot_s(next.duration_s);
    } else {
      this.status = "playing";
      this.waitingSince_wall_s = null;
      this.waitingOvershoot_s = 0;
    }
    this.wrongResetSince_wall_s = null;
    this.wrongResetOffset_s = 0;
    this.hitLead_s = 0;
    // Igual que en enterWaiting: las notas del instante del gate saltado van
    // pendientes y suenan al reanudar (o ya en el siguiente transporte).
    this.scheduledUpto_s = this.position_s - CHORD_TOLERANCE_S;
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

    // B-032.5: el gate congela cuando la posición LLEGA a su tiempo, no cuando
    // asoma en el horizonte. Congelar en horizonte saltaba el arranque audible
    // (el primer MI de la melodía no sonaba nunca y el transporte «saltaba» al
    // gate): así la mano de la IA suena de verdad hasta el instante del gate y
    // la cascada cae de golpe en él. Un tick que aterriza unos ms pasado su
    // tiempo también congela en él (la posición vuelve a su instante): nunca
    // se salta.
    let gate: Gate | null = null;
    if (this.gateEnabled) {
      const own = this.ownGate(position);
      if (own && own.time_s <= position + CHORD_TOLERANCE_S) {
        this.enterWaiting(own);
        return;
      }
      gate = own;
    }

    const upto = position + this.horizon_s * this.tempoFactor;
    // El audio no se programa más allá del gate pendiente: al congelar en él
    // nada posterior debe sonar, y las notas de su instante quedan pendientes
    // para reanudar tras el hit.
    const limite = gate ? Math.min(upto, gate.time_s - CHORD_TOLERANCE_S) : upto;
    for (const event of eventsInWindow(this.events, this.scheduledUpto_s, limite)) {
      this.voice.scheduleNote(event, this.toWallTime(event.time_s));
    }
    this.scheduledUpto_s = Math.max(this.scheduledUpto_s, limite);
    if (position >= this.duration_s) {
      this.status = "stopped";
      this.position_s = this.duration_s;
      return;
    }
    this.position_s = position;
  }

  snapshot(): PlaybackSnapshot {
    // B-033.2: el gate venidero se toma en la posición real del instante (en
    // reproducción el `position_s` interno queda a la zancada del tick).
    const upcomingGate = this.status === "playing"
      ? this.nextGate(this.currentPosition())
      : this.nextGate(this.position_s);
    const base: Omit<PlaybackSnapshot, "status" | "position_s"> = {
      tempoFactor: this.tempoFactor,
      duration_s: this.duration_s,
      tempo_bpm: this.baseTempo_bpm,
      effective_bpm:
        this.baseTempo_bpm === null ? null : this.baseTempo_bpm * this.tempoFactor,
      currentGate: this.currentGate,
      upcomingGate,
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
    // B-032.8: en espera la cascada rebota — sobrepasa la línea, rebobina
    // suave y queda quieta en el punto de pulsación; una tecla errónea pega
    // la barra a la línea desvaneciendo el exceso.
    if (this.status === "waiting") {
      return this.waitingDisplayPosition_s();
    }
    if (this.hitLead_s > 0) {
      const sinceLead = Math.max(0, this.clock.now() - this.hitLeadSince_wall_s);
      const lead = decayOffset_s(this.hitLead_s, sinceLead);
      if (lead > 0) return this.position_s + lead;
    }
    return this.position_s;
  }

  /** El sobresalto/rewind/held del gate congelado; puramente presentación. */
  private waitingDisplayPosition_s(): number {
    if (!this.currentGate || this.waitingSince_wall_s === null) return this.position_s;
    const elapsed = Math.max(0, this.clock.now() - this.waitingSince_wall_s);
    let offset = waitingGateOffset_s(elapsed, this.waitingOvershoot_s);
    if (this.wrongResetSince_wall_s !== null) {
      const sinceWrong = Math.max(0, this.clock.now() - this.wrongResetSince_wall_s);
      offset = decayOffset_s(this.wrongResetOffset_s, sinceWrong);
    }
    return this.currentGate.time_s + offset;
  }

  private enterWaiting(gate: Gate): void {
    this.position_s = gate.time_s;
    this.status = "waiting";
    this.currentGate = gate;
    this.waitingSince_wall_s = this.clock.now();
    // B-032.8: el margen se fija al entrar; un cambio de factor de tempo
    // mientras se espera no lo reescala (límite de la issue).
    this.waitingOvershoot_s = gateOvershoot_s(gate.duration_s);
    this.wrongResetSince_wall_s = null;
    this.wrongResetOffset_s = 0;
    this.hitLead_s = 0;
    // Las notas que arrancan en el instante del gate (la mano audible de la IA)
    // quedan pendientes: se reagenda el audio al reanudar desde el hit.
    // B-033 ajuste (petición del usuario, 2026-11-07): la tecla que el usuario
    // mantiene (pulsada antes de la línea) NO se corta: el silencio aquí es
    // del audio programado de la pieza, no de la audición viva — antes le
    // sonaba al corte por completo la tecla que llevaba pulsada.
    this.scheduledUpto_s = gate.time_s - CHORD_TOLERANCE_S;
    this.voice.silence({ keepAudition: true });
  }

  /**
   * B-032.8: tecla errónea durante la espera. La cascada pegada a la línea:
   * el exceso que llevara (sobresalto en marcha) se desvanece en el rebobo.
   */
  wrongGate(): void {
    if (this.status !== "waiting" || !this.currentGate || this.waitingSince_wall_s === null) return;
    const elapsed = Math.max(0, this.clock.now() - this.waitingSince_wall_s);
    this.wrongResetOffset_s = waitingGateOffset_s(elapsed, this.waitingOvershoot_s);
    this.wrongResetSince_wall_s = this.clock.now();
  }

  /**
   * Primer gate al que se llegaría desde `position_s`, ya con su compás real
   * (B-032.6). Los tiempos de los gates van escalados por el factor y la
   * rejilla no: se escala el mapa de inicios antes de asignar el compás.
   *
   * B-032.8: se saltan los gates ya tocados (`gatesPlayedUntil_s`), que es lo
   * que evita repetir el gate resuelto tras un hit; `gateAt` ahora sí admite
   * gates en la posición exacta (el primero de la pieza ya no se escapa).
   */
  private nextGate(position_s: number): Gate | null {
    const gates = gatesForSchedule(this.gateEvents, this.gateHand);
    let gate: Gate | null = null;
    for (const candidate of gates) {
      if (candidate.time_s <= this.gatesPlayedUntil_s + CHORD_TOLERANCE_S) continue;
      if (candidate.time_s < position_s - CHORD_TOLERANCE_S) continue;
      gate = candidate;
      break;
    }
    if (gate === null || this.measureStarts.length === 0) return gate;
    const scaledStarts = this.measureStarts.map((start) => start / this.tempoFactor);
    return assignMeasure([gate], scaledStarts)[0] ?? null;
  }

  /**
   * Primer gate aún sin tocar desde `position_s`, cruzado o no (B-032.5/B-032.8).
   * A diferencia de `nextGate` (que prepara el gate siguiente tras resolver
   * otro) no descarta los gates recién pisados: si un tick aterriza unos ms
   * pasado su tiempo, ese gate congela de todos modos y la posición vuelve a
   * su instante. Solo se saltan los ya tocados (`gatesPlayedUntil_s`).
   */
  private ownGate(position_s: number): Gate | null {
    const gates = gatesForSchedule(this.gateEvents, this.gateHand);
    for (const candidate of gates) {
      if (candidate.time_s <= this.gatesPlayedUntil_s + CHORD_TOLERANCE_S) continue;
      if (this.measureStarts.length === 0) return candidate;
      const scaledStarts = this.measureStarts.map((start) => start / this.tempoFactor);
      return assignMeasure([candidate], scaledStarts)[0] ?? candidate;
    }
    return null;
  }

  private finishPreroll(): void {
    this.position_s = 0;
    this.scheduledUpto_s = -CHORD_TOLERANCE_S;
    this.prerollElapsed_s = this.preroll_s;
    // B-032.5: al acabar la cuenta el transporte toca; si el primer gate está
    // en el segundo 0 congela al llegar, como cualquier otro (el caso especial
    // que congelaba siempre hacía saltarse el arranque audible).
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
