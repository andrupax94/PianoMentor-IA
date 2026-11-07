// description: Tests del motor de transporte con reloj falso y voz que graba: programación, pausa, seek, fin, tempo y la parte audible del acompañamiento (B-012.7).
// context: Criterio de B-006.2/B-012.7; verifica play/pausa/stop/seek/tempo sin audio real.

import { describe, expect, it } from "vitest";

import { PlaybackEngine, type ScheduledEvent } from "./playback-engine";
import type { PlayableNote } from "./api-client";

function note(overrides: Partial<PlayableNote> = {}): PlayableNote {
  return {
    pitch: 60,
    start_seconds: 1.0,
    duration_seconds: 0.5,
    velocity: 80,
    channel: 0,
    track: 1,
    ...overrides,
  };
}

const SCORE: PlayableNote[] = [
  note({ pitch: 60, start_seconds: 1.0 }),
  note({ pitch: 62, start_seconds: 2.0 }),
];

interface Harness {
  engine: PlaybackEngine;
  scheduled: { event: ScheduledEvent; at: number }[];
  silences: () => number;
  /** Opciones pasadas a cada `silence()` (para las llamadas del congelado). */
  silenceOpts: () => unknown[];
  advance: (dt: number) => void;
}

function makeHarness(horizon_s = 0.1, prerollActivo = false): Harness {
  let now = 0;
  const scheduled: { event: ScheduledEvent; at: number }[] = [];
  let silences = 0;
  const silenceLog: unknown[] = [];
  const engine = new PlaybackEngine(
    { now: () => now },
    {
      scheduleNote: (event, at) => scheduled.push({ event, at }),
      silence: (options?: unknown) => {
        silences += 1;
        silenceLog.push(options);
      },
    },
    horizon_s,
  );
  // Los tests de transporte básico piden play inmediato (sin cuenta atrás):
  // el preroll por defecto es de la petición del 2026-11-07 y se verifica en
  // sus casos propios (los del preroll fijan el suyo con setPreroll).
  if (!prerollActivo) engine.setPreroll(0);
  return {
    engine,
    scheduled,
    silences: () => silences,
    silenceOpts: () => silenceLog,
    advance: (dt: number) => {
      now += dt;
    },
  };
}

describe("PlaybackEngine", () => {
  it("margen al empezar SIEMPRE: play desde 0 cuenta atrás sin gates (Stop→play, 2026-11-07)", () => {
    // La petición del usuario: tras Stop (gates apagados en flujo) el play
    // arrancaba en la primera tecla sin el tiempo de ver caer las barras.
    const harness = makeHarness(0.1, true);
    harness.engine.load(SCORE); // primera nota en t=1.0; target 2 s → margen 1 s.
    harness.engine.play(); // sin setGateOptions: los gates no existen aquí.
    expect(harness.engine.snapshot().status).toBe("preroll");
    expect(harness.engine.snapshot().prerollRemaining_s).toBeCloseTo(1.0, 9);

    harness.advance(1.0);
    harness.engine.tick(); // cumple el margen → toca.
    expect(harness.engine.snapshot().status).toBe("playing");
    expect(harness.engine.snapshot().position_s).toBeCloseTo(0, 9);
  });

  it("la pieza que ya trae demora no gana margen extra (se ajusta, no se dobla)", () => {
    // El silencio inicial de la obra ya es el margen: si la primera nota
    // cae en el 4.9, el objetivo 2 s no añade ni un milisegundo.
    const harness = makeHarness(0.1, true);
    harness.engine.load([note({ start_seconds: 4.9 }), note({ start_seconds: 6.0 })]);
    harness.engine.play();
    expect(harness.engine.snapshot().status).toBe("playing");
  });

  it("stop→play reinicia la cuenta atrás aunque el modo espera esté apagado", () => {
    const harness = makeHarness(0.1, true);
    harness.engine.load(SCORE);
    harness.engine.play();
    harness.advance(3);
    harness.engine.tick();
    harness.engine.stop();
    harness.engine.play(); // gates nunca activados en este arnés.
    expect(harness.engine.snapshot().status).toBe("preroll");
  });

  it("programa los eventos del horizonte con el tiempo de reloj correcto", () => {
    const harness = makeHarness();
    harness.engine.load(SCORE);
    // El reloj arranca en t=10 para que el mapeo a tiempo de reloj sea visible.
    harness.advance(10);
    harness.engine.play();
    harness.advance(0.95);
    harness.engine.tick();

    expect(harness.scheduled).toHaveLength(1);
    expect(harness.scheduled[0].event.pitch).toBe(60);
    // Evento en partitura t=1.0 con ancla (muro 10, pos 0) → muro 11.0.
    expect(harness.scheduled[0].at).toBeCloseTo(11.0, 9);
    expect(harness.engine.snapshot().position_s).toBeCloseTo(0.95, 9);
  });

  it("no programa dos veces lo ya programado", () => {
    const harness = makeHarness();
    harness.engine.load(SCORE);
    harness.engine.play();
    harness.advance(0.95);
    harness.engine.tick();
    harness.advance(0.02);
    harness.engine.tick();

    expect(harness.scheduled).toHaveLength(1);
  });

  it("la pausa congela la posición y reanuda en el mismo punto", () => {
    const harness = makeHarness();
    harness.engine.load(SCORE);
    harness.engine.play();
    harness.advance(0.5);
    harness.engine.tick();
    harness.engine.pause();

    const frozen = harness.engine.snapshot().position_s;
    harness.advance(5);
    harness.engine.tick();
    expect(harness.engine.snapshot().position_s).toBe(frozen);
    expect(harness.engine.snapshot().status).toBe("paused");

    harness.engine.play();
    harness.advance(0.5);
    harness.engine.tick();
    expect(harness.engine.snapshot().position_s).toBeCloseTo(frozen + 0.5, 9);
  });

  it("stop vuelve a cero y silencia", () => {
    const harness = makeHarness();
    harness.engine.load(SCORE);
    harness.engine.play();
    harness.advance(1);
    harness.engine.tick();
    harness.engine.stop();

    expect(harness.engine.snapshot()).toMatchObject({ status: "stopped", position_s: 0 });
    expect(harness.silences()).toBeGreaterThanOrEqual(1);
  });

  it("seek recorta a la duración y sigue sonando desde ahí", () => {
    const harness = makeHarness();
    harness.engine.load(SCORE); // duración deducida: 2.0 + 0.5 = 2.5
    harness.engine.play();
    harness.engine.seek(-5);
    expect(harness.engine.snapshot().position_s).toBe(0);
    harness.engine.seek(999);
    expect(harness.engine.snapshot().position_s).toBe(2.5);

    harness.engine.seek(1.5);
    harness.advance(0.5);
    harness.engine.tick();
    expect(harness.engine.snapshot().position_s).toBeCloseTo(2.0, 9);
    expect(harness.engine.snapshot().status).toBe("playing");
  });

  it("al llegar al final se detiene con la posición llena y replay empieza de cero", () => {
    const harness = makeHarness();
    harness.engine.load(SCORE);
    harness.engine.play();
    harness.advance(10);
    harness.engine.tick();

    expect(harness.engine.snapshot()).toMatchObject({ status: "stopped", position_s: 2.5 });

    harness.engine.play();
    expect(harness.engine.snapshot()).toMatchObject({ status: "playing", position_s: 0 });
  });

  it("el factor de tempo reescala en caliente manteniendo el punto musical", () => {
    const harness = makeHarness();
    harness.engine.load(SCORE);
    harness.engine.play();
    harness.advance(1.0);
    harness.engine.tick(); // posición 1.0 a factor 1
    harness.engine.setTempoFactor(0.5); // estudio lento: todo dura el doble

    const snapshot = harness.engine.snapshot();
    expect(snapshot.tempoFactor).toBe(0.5);
    expect(snapshot.position_s).toBeCloseTo(1.0, 9);
    expect(snapshot.duration_s).toBeCloseTo(5.0, 9);

    harness.advance(1.0);
    harness.engine.tick();
    expect(harness.engine.snapshot().position_s).toBeCloseTo(1.5, 9);
  });

  it("ignora play sin partitura y recorta factores inválidos", () => {
    const harness = makeHarness();
    harness.engine.load([]);
    harness.engine.play();
    expect(harness.engine.snapshot().status).toBe("stopped");

    harness.engine.load(SCORE);
    harness.engine.setTempoFactor(99);
    expect(harness.engine.snapshot().tempoFactor).toBe(2.0);
    harness.engine.setTempoFactor(Number.NaN);
    expect(harness.engine.snapshot().tempoFactor).toBe(1.0);
  });

  it("arranca al tempo real de la pieza y expone el tempo efectivo", () => {
    const harness = makeHarness();
    harness.engine.load(SCORE, { tempo_bpm: 120 });

    // Sin tocar nada el factor es 1.0: la pieza suena a su tempo real.
    expect(harness.engine.snapshot()).toMatchObject({
      tempoFactor: 1.0,
      tempo_bpm: 120,
      effective_bpm: 120,
    });

    harness.engine.setTempoFactor(0.5);
    expect(harness.engine.snapshot().effective_bpm).toBe(60);
    harness.engine.setTempoFactor(2.0);
    expect(harness.engine.snapshot().effective_bpm).toBe(240);
  });

  it("sin tempo base el efectivo es null y los tempos inválidos se descartan", () => {
    const harness = makeHarness();
    harness.engine.load(SCORE);
    expect(harness.engine.snapshot()).toMatchObject({ tempo_bpm: null, effective_bpm: null });

    harness.engine.load(SCORE, { tempo_bpm: 0 });
    expect(harness.engine.snapshot().tempo_bpm).toBeNull();
    harness.engine.load(SCORE, { tempo_bpm: Number.NaN });
    expect(harness.engine.snapshot().tempo_bpm).toBeNull();
  });

  it("el acompañamiento suena solo la mano audible sin acortar la pieza (B-012.7)", () => {
    const harness = makeHarness();
    // La IA toca la izquierda; la partitura entera sigue midiendo el transporte.
    const left = [note({ pitch: 48, start_seconds: 1.0, duration_seconds: 0.5 })];
    harness.engine.load(SCORE, { audible: left });

    expect(harness.engine.snapshot().duration_s).toBeCloseTo(2.5, 9);

    harness.engine.play();
    harness.advance(2.4);
    harness.engine.tick();

    expect(harness.scheduled.map((item) => item.event.pitch)).toEqual([48]);
  });

  it("cambiar el tempo conserva la mano audible y su duración (B-012.7)", () => {
    const harness = makeHarness();
    const left = [note({ pitch: 48, start_seconds: 1.0 })];
    harness.engine.load(SCORE, { audible: left, duration_s: 10 });
    harness.engine.setTempoFactor(0.5);

    harness.engine.play();
    harness.advance(4.2);
    harness.engine.tick();

    expect(harness.scheduled.map((item) => item.event.pitch)).toEqual([48]);
    // La duración explícita se escala con el factor: 10 s al 50 % son 20 s.
    expect(harness.engine.snapshot().duration_s).toBeCloseTo(20, 9);
  });

  it("setAudible cambia lo que suena sin reiniciar la posición (B-032.4)", () => {
    const harness = makeHarness();
    harness.engine.load(SCORE);
    harness.engine.play();
    harness.advance(1.2);
    harness.engine.tick();

    const position = harness.engine.snapshot().position_s;
    expect(position).toBeGreaterThan(0);

    // Cambia el modo: ahora suena solo la otra mano (una nota por delante).
    harness.engine.setAudible([note({ pitch: 48, start_seconds: 2.5 })]);

    // La posición se conserva: cambiar de modo no reinicia el transporte.
    expect(harness.engine.snapshot().position_s).toBeCloseTo(position, 6);
    // Y lo que se programa es la parte nueva.
    harness.advance(2.0);
    harness.engine.tick();
    expect(harness.scheduled.map((item) => item.event.pitch)).toContain(48);
  });

  it("setAudible con una lista vacía deja el transporte mudo (B-032.4)", () => {
    const harness = makeHarness();
    harness.engine.load(SCORE);
    harness.engine.play();
    harness.advance(0.5);

    harness.engine.setAudible([]);

    expect(harness.scheduled.map((item) => item.event.pitch)).not.toContain(60);
    // La partitura sigue midiendo el transporte: no se acorta.
    expect(harness.engine.snapshot().duration_s).toBeCloseTo(2.5, 9);
  });

  it("en «una mano» el gate es la mano del alumno aunque el audio sea el contrario (B-032.4/B-032.5)", () => {
    const harness = makeHarness();
    // El alumno practica la mano derecha (pitch bajo): el audio manda la izquierda,
    // pero el transporte se congela en la nota que el alumno debe tocar.
    harness.engine.load(SCORE, { audible: [] });
    harness.engine.setGateOptions({ enabled: true, hand: "right" });
    // Objetivo 2 s con primera nota en t=1.0 → cuenta atrás resultante 1 s.
    harness.engine.setPreroll(2);

    harness.engine.play();
    expect(harness.engine.snapshot().status).toBe("preroll");
    harness.advance(1);
    harness.engine.tick(); // fin del preroll: suena/nada y avanza
    harness.advance(1.02); // la posición llega al gate del alumno (t=1,0)
    harness.engine.tick();

    expect(harness.engine.snapshot().status).toBe("waiting");
    expect(harness.engine.snapshot().currentGate?.pitches).toEqual([60]);
  });

  it("al congelar el gate, el silencio respeta la pulsación viva del alumno (B-033 ajuste 2026-11-07)", () => {
    // El usuario pulsó antes de la línea y mantiene la tecla: el silencio del
    // congelado silencia el audio programado de la pieza, NO su tecla.
    const harness = makeHarness();
    harness.engine.load(SCORE, { audible: [] });
    harness.engine.setGateOptions({ enabled: true, hand: "both" });
    harness.engine.setPreroll(0);

    harness.engine.play();
    harness.advance(1.02); // la posición llega al gate (t=1,0)
    harness.engine.tick();
    expect(harness.engine.snapshot().status).toBe("waiting");

    // El último silencio es el del congelado y marca keepAudition.
    const lastOptions = harness.silenceOpts().at(-1);
    expect(lastOptions).toEqual({ keepAudition: true });
  });

  it("markGatePlayed: el gate anticipado NO congela y el audio cruza sonando (ajuste 2026-11-07)", () => {
    const harness = makeHarness();
    harness.engine.load(SCORE, { audible: [] }); // el audio de la pieza entera calla; lo que suena es la tecla del alumno… y en este test comprobamos que el gate no congela
    harness.engine.setGateOptions({ enabled: true, hand: "both" });
    harness.engine.setPreroll(0);
    harness.engine.play();

    // Antes de llegar al gate (t=1,0): anticipado — se marca como tocado.
    harness.advance(0.5);
    harness.engine.tick();
    expect(harness.engine.snapshot().status).toBe("playing");
    harness.engine.markGatePlayed(1.0);

    // La posición cruza el gate sin congelar nunca…
    harness.advance(0.8);
    harness.engine.tick();
    expect(harness.engine.snapshot().status).toBe("playing");
    expect(harness.engine.snapshot().position_s).toBeCloseTo(1.3, 6);
    expect(harness.engine.snapshot().currentGate).toBeNull();

    // …y el venidero ya es el segundo (el consumido no vuelve).
    expect(harness.engine.snapshot().upcomingGate?.pitches).toEqual([62]);
  });

  it("expongo el gate venidero en el snapshot también sin espera (B-033.2: robot en flujo)", () => {    const harness = makeHarness();
    // Sin gates activos (modo espera apagado): no hay currentGate, pero la
    // cascada va pasando los gates y el snapshot lo cuenta para el robot.
    harness.engine.load(SCORE);
    harness.engine.setGateOptions({ enabled: false, hand: "both" });
    harness.engine.setPreroll(0);
    harness.engine.play();

    harness.advance(0.5);
    harness.engine.tick();
    expect(harness.engine.snapshot().status).toBe("playing");
    expect(harness.engine.snapshot().currentGate).toBeNull();
    expect(harness.engine.snapshot().upcomingGate?.pitches).toEqual([60]);

    // Pasado el primero, el venidero es el siguiente (nada se congela).
    harness.advance(0.8);
    harness.engine.tick();
    expect(harness.engine.snapshot().position_s).toBeCloseTo(1.3, 6);
    expect(harness.engine.snapshot().upcomingGate?.pitches).toEqual([62]);
  });

  it("«dos manos» arranca con el audio mudo y espera la primera nota (B-032.4/B-032.5)", () => {
    const harness = makeHarness();
    // En «dos manos» el transporte calla (audible vacía) pero el transporte viva.
    harness.engine.load(SCORE, { audible: [] });
    harness.engine.setGateOptions({ enabled: true, hand: "both" });
    // Objetivo 2 s con la primera nota en t=1.0: el margen resultante es 1 s
    // (el ajuste del 2026-11-07 conserva la demora que la pieza ya trae).
    harness.engine.setPreroll(2);

    harness.engine.play();
    harness.advance(1);
    harness.engine.tick(); // fin del preroll
    harness.advance(1.02); // el transporte avanza hasta el gate, sin audio
    harness.engine.tick();

    expect(harness.engine.snapshot().status).toBe("waiting");
    expect(harness.engine.snapshot().currentGate).not.toBeNull();
  });

  it("con gates activados, play desde el inicio arranca el preroll (B-032.5)", () => {
    const harness = makeHarness();
    harness.engine.load(SCORE, { tempo_bpm: 120 });
    harness.engine.setGateOptions({ enabled: true, hand: "both" });
    // Objetivo 2 s, primera nota en 1.0 → margen resultante 1 s.
    harness.engine.setPreroll(2);

    harness.engine.play();
    expect(harness.engine.snapshot().status).toBe("preroll");
    expect(harness.engine.snapshot().prerollRemaining_s).toBeCloseTo(1, 6);

    harness.advance(0.5);
    harness.engine.tick();
    expect(harness.engine.snapshot().prerollRemaining_s).toBeCloseTo(0.5, 6);

    harness.advance(0.5);
    harness.engine.tick(); // fin del preroll: estado playing, cuenta terminada
    expect(harness.engine.snapshot().status).toBe("playing");

    harness.advance(1.02); // la posición alcanza el gate de t=1,0
    harness.engine.tick();
    expect(harness.engine.snapshot().status).toBe("waiting");
    expect(harness.engine.snapshot().currentGate).not.toBeNull();
    expect(harness.engine.snapshot().currentGate?.pitches).toEqual([60]);
  });

  it("durante el preroll la posición de display es negativa (B-032.5)", () => {
    const harness = makeHarness();
    harness.engine.load(SCORE);
    harness.engine.setGateOptions({ enabled: true, hand: "both" });
    // Objetivo 3 s, primera nota en 1.0 → cuenta atrás resultante 2 s.
    harness.engine.setPreroll(3);

    harness.engine.play();
    expect(harness.engine.displayPosition_s()).toBeCloseTo(-2, 6);

    harness.advance(1);
    harness.engine.tick();
    expect(harness.engine.displayPosition_s()).toBeCloseTo(-1, 6);
  });

  it("al llegar a un gate congela el transporte en waiting (B-032.5)", () => {
    const harness = makeHarness();
    harness.engine.load(SCORE);
    harness.engine.setGateOptions({ enabled: true, hand: "both" });
    harness.engine.setPreroll(0);

    harness.engine.play();
    harness.advance(1.02); // la posición cruza el tiempo del gate
    harness.engine.tick();
    expect(harness.engine.snapshot().status).toBe("waiting");
    expect(harness.engine.snapshot().position_s).toBeCloseTo(1.0, 6);
  });

  it("resolveGate reanuda el transporte desde el gate (B-032.5)", () => {
    const harness = makeHarness();
    harness.engine.load(SCORE);
    harness.engine.setGateOptions({ enabled: true, hand: "both" });
    harness.engine.setPreroll(0);

    harness.engine.play();
    harness.advance(1.02);
    harness.engine.tick();
    expect(harness.engine.snapshot().status).toBe("waiting");

    harness.engine.resolveGate();
    expect(harness.engine.snapshot().status).toBe("playing");
    expect(harness.engine.snapshot().position_s).toBeCloseTo(1.0, 6);

    // Con ticks regulares el transporte avanza y congela en el gate siguiente
    // en cuanto la posición alcanza su tiempo (2.1 le pasaría por encima: en
    // producción el tick lo captura al vuelo).
    harness.advance(0.95);
    harness.engine.tick();
    expect(harness.engine.snapshot().status).toBe("playing");
    expect(harness.engine.snapshot().position_s).toBeCloseTo(1.95, 6);

    harness.advance(0.1);
    harness.engine.tick();
    expect(harness.engine.snapshot().status).toBe("waiting");
    expect(harness.engine.snapshot().position_s).toBeCloseTo(2.0, 6);
  });

  it("en modo observe los gates no se activan (B-032.5)", () => {
    const harness = makeHarness();
    harness.engine.load(SCORE);
    harness.engine.setGateOptions({ enabled: false, hand: "both" });

    harness.engine.play();
    harness.advance(1.5);
    harness.engine.tick();
    expect(harness.engine.snapshot().status).toBe("playing");
  });

  it("los gates llegan con el compás real cuando la pieza trae rejilla (B-032.6)", () => {
    const harness = makeHarness();
    harness.engine.load(SCORE, {
      measures: { count: 2, starts_s: [0, 2], signatures: [[4, 4], [4, 4]], end_s: 4 },
    });
    harness.engine.setGateOptions({ enabled: true, hand: "both" });
    harness.engine.setPreroll(0);

    harness.engine.play();
    harness.advance(1.02);
    harness.engine.tick();
    expect(harness.engine.snapshot().currentGate?.measure).toBe(0);

    harness.engine.resolveGate();
    harness.advance(1.02); // al segundo gate (t=2,0 con la pieza sin escalar)
    harness.engine.tick();
    expect(harness.engine.snapshot().status).toBe("waiting");
    expect(harness.engine.snapshot().currentGate?.measure).toBe(1);
  });

  it("sin rejilla los gates siguen funcionando con compás nulo (B-032.5/B-032.6)", () => {
    const harness = makeHarness();
    harness.engine.load(SCORE);
    harness.engine.setGateOptions({ enabled: true, hand: "both" });
    harness.engine.setPreroll(0);

    harness.engine.play();
    harness.advance(1.02);
    harness.engine.tick();
    expect(harness.engine.snapshot().currentGate?.measure).toBeNull();
  });

  it("los compases de los gates salen escalados por el factor de tempo (B-032.6)", () => {
    // Con factor 0.5 el gate de 2 s de partitura suena en el segundo 1 del motor.
    const harness = makeHarness();
    harness.engine.load(
      [note({ pitch: 62, start_seconds: 2.0 })],
      {
        duration_s: 4,
        tempoFactor: 0.5,
        measures: { count: 2, starts_s: [0, 2], signatures: [[4, 4], [4, 4]], end_s: 4 },
      },
    );
    harness.engine.setGateOptions({ enabled: true, hand: "both" });
    harness.engine.setPreroll(0);

    harness.engine.play();
    harness.advance(8.2); // 4,1 s escala×: la posición alcanza el gate
    harness.engine.tick();
    const gate = harness.engine.snapshot().currentGate;
    expect(gate?.time_s).toBeCloseTo(4.0, 6); // 2 s de partitura / factor 0,5
    expect(gate?.measure).toBe(1);
  });
});

// --- B-032.8: la cascada rebota en el gate -----------------------------------

/**
 * Partitura con gates de 1 s de duración (el 40 % cae dentro del rango, sin
 * recortes): tras el hit la barra sigue con el exceso que desvanece.
 */
function makeGateHarness(): Harness {
  const harness = makeHarness();
  harness.engine.load([
    note({ pitch: 60, start_seconds: 1.0, duration_seconds: 1.0 }),
    note({ pitch: 62, start_seconds: 3.0, duration_seconds: 1.0 }),
  ]);
  harness.engine.setGateOptions({ enabled: true, hand: "both" });
  harness.engine.setPreroll(0);
  harness.engine.play();
  harness.advance(1.02);
  harness.engine.tick(); // congelado en el gate 1,0 en cuanto la posición lo alcanza
  return harness;
}

function freezeElapsed(harness: Harness, seconds: number): void {
  harness.advance(seconds);
}

describe("PlaybackEngine — rebote del gate (B-032.8)", () => {
  it("en waiting la cascada sobrepasa la línea durante el margen (60 % de la nota)", () => {
    const harness = makeGateHarness();
    expect(harness.engine.displayPosition_s()).toBeCloseTo(1.0, 6);

    freezeElapsed(harness, 0.05);
    expect(harness.engine.displayPosition_s()).toBeCloseTo(1.05, 6);

    freezeElapsed(harness, 0.15);
    expect(harness.engine.displayPosition_s()).toBeCloseTo(1.20, 6); // 0,20 del margen (0,6)
  });

  it("rebobina suave hasta la línea y se queda quieta", () => {
    const harness = makeGateHarness();
    freezeElapsed(harness, 0.6); // cima del sobresalto (60 % de 1 s)
    freezeElapsed(harness, 0.075); // mitad del rebobinado: ease-out quad
    expect(harness.engine.displayPosition_s()).toBeCloseTo(1.0 + 0.6 * 0.25, 9);

    freezeElapsed(harness, 0.075); // rebobinado terminado
    expect(harness.engine.displayPosition_s()).toBeCloseTo(1.0, 9);

    freezeElapsed(harness, 30); // quieta en el punto de pulsación
    expect(harness.engine.displayPosition_s()).toBeCloseTo(1.0, 9);
    expect(harness.engine.snapshot().position_s).toBeCloseTo(1.0, 6);
  });

  it("una tecla errónea devuelve la barra a la línea desvaneciendo (150 ms)", () => {
    const harness = makeGateHarness();
    freezeElapsed(harness, 0.1); // en pleno sobresalto, offset 0,1
    harness.engine.wrongGate();
    // El evento de practice 'wrong' ya salió; el motor solo arma el rebote.
    expect(harness.engine.displayPosition_s()).toBeCloseTo(1.1, 9);

    freezeElapsed(harness, 0.075);
    expect(harness.engine.displayPosition_s()).toBeCloseTo(1.05, 9);

    freezeElapsed(harness, 0.075);
    expect(harness.engine.displayPosition_s()).toBeCloseTo(1.0, 9);
    freezeElapsed(harness, 5);
    expect(harness.engine.displayPosition_s()).toBeCloseTo(1.0, 9);
  });

  it("el hit antes del rebobinado continúa sin salto: el exceso se desvanece", () => {
    const harness = makeGateHarness();
    freezeElapsed(harness, 0.1); // la barra está en 1,1 cuando el alumno acierta
    harness.engine.resolveGate();

    expect(harness.engine.snapshot().position_s).toBeCloseTo(1.0, 6);
    expect(harness.engine.displayPosition_s()).toBeCloseTo(1.1, 9); // nada de salto

    freezeElapsed(harness, 0.075);
    expect(harness.engine.displayPosition_s()).toBeCloseTo(1.05, 9);

    freezeElapsed(harness, 0.075);
    expect(harness.engine.displayPosition_s()).toBeCloseTo(1.0, 9);

    freezeElapsed(harness, 1.1);
    harness.engine.tick();
    // 0,15 s de reproducción tras el hit + 1,1: el exceso ya desvanecido no esconde nada.
    expect(harness.engine.snapshot().position_s).toBeCloseTo(2.25, 6);
    expect(harness.engine.displayPosition_s()).toBeCloseTo(2.25, 6);
  });

  it("al saltar el gate, el rebote lo dimensiona el gate nuevo", () => {
    const harness = makeHarness();
    harness.engine.load([
      note({ pitch: 60, start_seconds: 1.0, duration_seconds: 4.0 }),
      note({ pitch: 62, start_seconds: 3.0, duration_seconds: 0.5 }),
    ]);
    harness.engine.setGateOptions({ enabled: true, hand: "both" });
    harness.engine.setPreroll(0);

    harness.engine.play();
    harness.advance(1.02);
    harness.engine.tick();
    // Duración 4 s → sobresalto al tope de 0,5 s.
    harness.advance(0.3);
    expect(harness.engine.displayPosition_s()).toBeCloseTo(1.3, 9);

    harness.engine.skipGate(); // gate siguiente: 3,0 con duración 0,5 → margen 60 % = 0,3
    expect(harness.engine.displayPosition_s()).toBeCloseTo(3.0, 9);
    harness.advance(0.35);
    // 0,35 s > margen 0,3: rebobinado al 33 % del camino → queda 4/9 del margen.
    expect(harness.engine.displayPosition_s()).toBeCloseTo(3.0 + 0.3 * (4 / 9), 9);
  });

  it("un tick que pisa el gate por poco ms congela en él y no en el siguiente (B-032.8)", () => {
    // El fallo del usuario: la primera nota (MI) se perdía y el motor se
    // congelaba en la siguiente (Do sostenido). Un tick que aterriza justo
    // después del gate (dentro de la tolerancia de 5 ms) debe congelarse allí.
    const harness = makeHarness();
    harness.engine.load([
      note({ pitch: 60, start_seconds: 1.0, duration_seconds: 0.5 }),
      note({ pitch: 61, start_seconds: 2.0, duration_seconds: 0.5 }),
    ], { duration_s: 4, tempoFactor: 1.0 });
    harness.engine.setGateOptions({ enabled: true, hand: "both" });
    harness.engine.setPreroll(0);

    harness.engine.play();
    harness.advance(1.003); // tick tardío: aterriza 3 ms después del gate de MI
    harness.engine.tick();
    expect(harness.engine.snapshot().status).toBe("waiting");
    expect(harness.engine.snapshot().position_s).toBeCloseTo(1.0, 6);
    expect(harness.engine.snapshot().currentGate?.pitches).toEqual([60]); // MI, no 61
  });

  it("tras el hit el gate resuelto no vuelve: el siguiente gate manda", () => {
    const harness = makeGateHarness();
    harness.engine.resolveGate(); // congelado en 1,0 → el alumno acierta
    harness.advance(0.05);
    harness.engine.tick();
    // El gate de 1,0 ya se tocó: no se congela en él aunque la posición esté
    // exactamente en su tiempo; sigue jugando hacia el 3,0.
    expect(harness.engine.snapshot().status).toBe("playing");
    harness.advance(1.95);
    harness.engine.tick();
    expect(harness.engine.snapshot().status).toBe("waiting");
    expect(harness.engine.snapshot().position_s).toBeCloseTo(3.0, 6);
    expect(harness.engine.snapshot().currentGate?.pitches).toEqual([62]);
  });

  it("el primer gate de la pieza puede arrancar en el segundo 0 (B-032.8)", () => {
    const harness = makeHarness();
    harness.engine.load([
      note({ pitch: 64, start_seconds: 0.0, duration_seconds: 0.5 }),
      note({ pitch: 61, start_seconds: 1.0, duration_seconds: 0.5 }),
    ], { duration_s: 4, tempoFactor: 1.0 });
    harness.engine.setGateOptions({ enabled: true, hand: "both" });
    harness.engine.setPreroll(0);

    harness.engine.play();
    harness.engine.tick(); // posición 0: el gate de MI (t=0) aún es tocable
    expect(harness.engine.snapshot().status).toBe("waiting");
    expect(harness.engine.snapshot().position_s).toBeCloseTo(0.0, 6);
    expect(harness.engine.snapshot().currentGate?.pitches).toEqual([64]);
  });

  it("el gate congela al llegar: el acompañamiento audible suena hasta su instante (B-032.5)", () => {
    // El caso del usuario en el Prelude en A (p15): la melodía (mano derecha,
    // la que suena en «una mano») arranca con MI en t=0 y el primer gate de la
    // mano izquierda va en t=0,5. Antes el gate congelaba en cuanto asomaba en
    // el horizonte: el MI no sonaba nunca y el transporte «saltaba» al gate.
    const harness = makeHarness();
    harness.engine.load(
      [
        note({ pitch: 64, track: 1, hand: "right", start_seconds: 0.0, duration_seconds: 0.5 }),
        note({ pitch: 73, track: 1, hand: "right", start_seconds: 0.5, duration_seconds: 0.375 }),
        note({ pitch: 40, track: 2, hand: "left", start_seconds: 0.5, duration_seconds: 0.5 }),
      ],
      { duration_s: 24, tempoFactor: 1.0 },
    );
    harness.engine.setGateOptions({ enabled: true, hand: "left" });
    harness.engine.setPreroll(0);

    harness.engine.play();
    harness.advance(0.02);
    harness.engine.tick();
    // No congela porque el gate asome en el horizonte: sigue sonando.
    expect(harness.engine.snapshot().status).toBe("playing");
    // El MI de la melodía está programado: suena mientras se llega al gate.
    expect(harness.scheduled.map((s) => s.event.pitch)).toContain(64);
    // Y la nota de la IA del instante del gate no se programó por adelantado.
    expect(harness.scheduled.map((s) => s.event.pitch)).not.toContain(73);

    harness.advance(0.5);
    harness.engine.tick();
    expect(harness.engine.snapshot().status).toBe("waiting");
    expect(harness.engine.snapshot().position_s).toBeCloseTo(0.5, 6);
    expect(harness.engine.snapshot().currentGate?.pitches).toEqual([40]);
    expect(harness.scheduled.map((s) => s.event.pitch)).not.toContain(73);
  });

  it("tras el hit suena la nota de la IA del instante del gate y no se duplica", () => {
    // Continuación: resuelto el gate, la nota que arranca en su tiempo tiene
    // que sonar una vez (el scheduledUpto quedó justo antes del gate).
    const harness = makeHarness();
    harness.engine.load(
      [
        note({ pitch: 73, track: 1, hand: "right", start_seconds: 0.5, duration_seconds: 0.375 }),
        note({ pitch: 40, track: 2, hand: "left", start_seconds: 0.5, duration_seconds: 0.5 }),
      ],
      { duration_s: 4, tempoFactor: 1.0 },
    );
    harness.engine.setGateOptions({ enabled: true, hand: "left" });
    harness.engine.setPreroll(0);

    harness.engine.play();
    harness.advance(0.52);
    harness.engine.tick(); // congelado en el gate del alumno (t=0,5)
    expect(harness.engine.snapshot().status).toBe("waiting");
    expect(harness.scheduled).toHaveLength(0); // nada sonó todavía (toda la pieza va al hit)

    harness.engine.resolveGate(); // el alumno toca su MI grave
    harness.advance(0.05);
    harness.engine.tick();
    const veces = harness.scheduled.filter((s) => s.event.pitch === 73).length;
    expect(veces).toBe(1); // el DO# de la IA suena al reanudar, una sola vez
  });
});
