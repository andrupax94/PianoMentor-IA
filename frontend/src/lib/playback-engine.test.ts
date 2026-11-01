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
  advance: (dt: number) => void;
}

function makeHarness(horizon_s = 0.1): Harness {
  let now = 0;
  const scheduled: { event: ScheduledEvent; at: number }[] = [];
  let silences = 0;
  const engine = new PlaybackEngine(
    { now: () => now },
    {
      scheduleNote: (event, at) => scheduled.push({ event, at }),
      silence: () => {
        silences += 1;
      },
    },
    horizon_s,
  );
  return {
    engine,
    scheduled,
    silences: () => silences,
    advance: (dt: number) => {
      now += dt;
    },
  };
}

describe("PlaybackEngine", () => {
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
    harness.engine.setPreroll(1);

    harness.engine.play();
    expect(harness.engine.snapshot().status).toBe("preroll");
    harness.advance(1);
    harness.engine.tick();

    expect(harness.engine.snapshot().status).toBe("waiting");
    expect(harness.engine.snapshot().currentGate?.pitches).toEqual([60]);
  });

  it("«dos manos» arranca con el audio mudo y espera la primera nota (B-032.4/B-032.5)", () => {
    const harness = makeHarness();
    // En «dos manos» el transporte calla (audible vacía) pero el transporte viva.
    harness.engine.load(SCORE, { audible: [] });
    harness.engine.setGateOptions({ enabled: true, hand: "both" });
    harness.engine.setPreroll(1);

    harness.engine.play();
    harness.advance(1);
    harness.engine.tick();

    expect(harness.engine.snapshot().status).toBe("waiting");
    expect(harness.engine.snapshot().currentGate).not.toBeNull();
  });

  it("con gates activados, play desde el inicio arranca el preroll (B-032.5)", () => {
    const harness = makeHarness();
    harness.engine.load(SCORE, { tempo_bpm: 120 });
    harness.engine.setGateOptions({ enabled: true, hand: "both" });
    harness.engine.setPreroll(1);

    harness.engine.play();
    expect(harness.engine.snapshot().status).toBe("preroll");
    expect(harness.engine.snapshot().prerollRemaining_s).toBeCloseTo(1, 6);

    harness.advance(0.5);
    harness.engine.tick();
    expect(harness.engine.snapshot().prerollRemaining_s).toBeCloseTo(0.5, 6);

    harness.advance(0.5);
    harness.engine.tick();
    expect(harness.engine.snapshot().status).toBe("waiting");
    expect(harness.engine.snapshot().currentGate).not.toBeNull();
    expect(harness.engine.snapshot().currentGate?.pitches).toEqual([60]);
  });

  it("durante el preroll la posición de display es negativa (B-032.5)", () => {
    const harness = makeHarness();
    harness.engine.load(SCORE);
    harness.engine.setGateOptions({ enabled: true, hand: "both" });
    harness.engine.setPreroll(2);

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
    harness.advance(0.95);
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
    harness.advance(0.95);
    harness.engine.tick();
    expect(harness.engine.snapshot().status).toBe("waiting");

    harness.engine.resolveGate();
    expect(harness.engine.snapshot().status).toBe("playing");
    expect(harness.engine.snapshot().position_s).toBeCloseTo(1.0, 6);

    harness.advance(1.1);
    harness.engine.tick();
    expect(harness.engine.snapshot().position_s).toBeCloseTo(2.1, 6);
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
    harness.advance(0.95);
    harness.engine.tick();
    expect(harness.engine.snapshot().currentGate?.measure).toBe(0);

    harness.engine.resolveGate();
    harness.advance(0.9);
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
    harness.advance(0.95);
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
    harness.advance(7.9); // 3,95 s escala×: el gate de 2 s de partitura pisa el congelado
    harness.engine.tick();
    const gate = harness.engine.snapshot().currentGate;
    expect(gate?.time_s).toBeCloseTo(4.0, 6); // 2 s de partitura / factor 0,5
    expect(gate?.measure).toBe(1);
  });
});
