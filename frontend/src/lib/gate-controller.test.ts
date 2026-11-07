// description: Tests del gate-controller: hit, wrong, timeout y deduplicación de señales.
// context: B-032.5; puro y sin DOM.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createGateController, type PracticeEvent } from "./gate-controller";
import {
  emitNoteOff,
  emitNoteOn,
  resetNoteInput,
  subscribeNoteInput,
} from "./note-input";
import type { PlaybackSnapshot } from "./playback-engine";

function snapshot(
  overrides: Partial<PlaybackSnapshot> = {},
): PlaybackSnapshot {
  return {
    status: "waiting",
    position_s: 1.0,
    tempoFactor: 1.0,
    duration_s: 10,
    tempo_bpm: 120,
    effective_bpm: 120,
    currentGate: {
      id: "gate-1.0000",
      time_s: 1.0,
      duration_s: 0.5,
      pitches: [60],
      hands: ["left"],
      measure: 0,
    },
    prerollRemaining_s: null,
    waitingSince_wall_s: null,
    upcomingGate: null,
    ...overrides,
  };
}

const WAITING_SNAPSHOT = snapshot();
const PLAYING_SNAPSHOT = snapshot({ status: "playing", currentGate: null });

describe("gate-controller", () => {
  let events: PracticeEvent[] = [];
  let hits = 0;
  let current: PlaybackSnapshot = WAITING_SNAPSHOT;

  beforeEach(() => {
    events = [];
    hits = 0;
    current = WAITING_SNAPSHOT;
    resetNoteInput();
  });

  afterEach(() => {
    resetNoteInput();
  });

  function makeController() {
    return createGateController({
      getSnapshot: () => current,
      subscribeNoteInput,
      sendPracticeEvent: (event) => events.push(event),
      clockMs: () => 1000,
      onHit: () => {
        hits += 1;
      },
      options: { enabled: true, hand: "left" },
    });
  }

  it("emite hit y reanuda cuando se toca la nota esperada", () => {
    const controller = makeController();
    controller.start();

    emitNoteOn({ pitch: 60, velocity: 80, source: "pc" });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      gate: "gate-1.0000",
      outcome: "hit",
      hand: "left",
    });
    expect(hits).toBe(1);

    controller.stop();
  });

  it("emite wrong al tocar una tecla equivocada", () => {
    const controller = makeController();
    controller.start();

    emitNoteOn({ pitch: 61, velocity: 80, source: "pc" });

    expect(events).toHaveLength(1);
    expect(events[0].outcome).toBe("wrong");
    expect(hits).toBe(0);

    controller.stop();
  });

  it("no emite nada mientras el transporte no espera", () => {
    current = PLAYING_SNAPSHOT;
    const controller = makeController();
    controller.start();

    emitNoteOn({ pitch: 60, velocity: 80, source: "pc" });

    expect(events).toHaveLength(0);

    controller.stop();
  });

  it("pulsa bien tras agotar el margen: el strike.timeout ya salió y el late hit resuelve", () => {
    // El bloqueo del usuario: vencido el margen (strike timeout a B-032.6),
    // pulsar la tecla correcta debe reanudar el transporte, no colgarse.
    let nowMs = 1000;
    const controller = createGateController({
      getSnapshot: () => current,
      subscribeNoteInput,
      sendPracticeEvent: (event) => events.push(event),
      clockMs: () => nowMs,
      onHit: () => {
        hits += 1;
      },
      options: { enabled: true, hand: "left" },
    });
    controller.start();

    // El reloj del controlador arranca con la primera pulsación.
    emitNoteOn({ pitch: 61, velocity: 80, source: "pc" }); // equivocada: wrong
    expect(events[0].outcome).toBe("wrong");

    nowMs = 4000; // venció el margen (2 pulsos a 120 bpm = 1000 ms desde la primera)
    emitNoteOn({ pitch: 62, velocity: 80, source: "pc" }); // vences: strike timeout
    expect(events[1].outcome).toBe("timeout");
    expect(hits).toBe(0);

    emitNoteOn({ pitch: 60, velocity: 80, source: "pc" }); // correcta: rescata el gate
    expect(events[2]).toMatchObject({ gate: "gate-1.0000", outcome: "hit", hand: "left" });
    expect(hits).toBe(1);

    controller.stop();
  });

  it("la tecla pulsada antes del congelado no resuelve el gate a cero: el margen se muestra", () => {    // El usuario anticipa: pulsa la nota correcta mientras el transporte aún
    // suena; el gate deja de congelarse y la pulsación vieja no puede resolver
    // nada — si no, el rebote del 60 % desaparecía (petición del usuario).
    let nowMs = 500;
    const controller = createGateController({
      getSnapshot: () => current,
      subscribeNoteInput,
      sendPracticeEvent: (event) => events.push(event),
      clockMs: () => nowMs,
      onHit: () => {
        hits += 1;
      },
      options: { enabled: true, hand: "left" },
    });
    controller.start();

    current = PLAYING_SNAPSHOT;
    emitNoteOn({ pitch: 60, velocity: 80, source: "pc" }); // anticipación: suena, nadie evalúa

    // Congelado (2000 ms): la marca de la espera nace a partir de aquí.
    nowMs = 2000;
    current = WAITING_SNAPSHOT;
    // La sonda: una pulsación nueva (equivocada) revela el estado del gate.
    emitNoteOn({ pitch: 64, velocity: 80, source: "pc" });

    // La tecla anticipada NO resolvió el gate al entrar en espera: solo se
    // emite el wrong de la sonda, jamás un hit.
    expect(events).toHaveLength(1);
    expect(events[0].outcome).toBe("wrong");
    expect(hits).toBe(0);

    // Volver a pulsar: la re-pulsación (aunque la tecla siguiera sonando)
    // cuenta como nueva porque su marca es de la espera en curso.
    emitNoteOn({ pitch: 60, velocity: 80, source: "pc" });
    expect(events[1]).toMatchObject({ gate: "gate-1.0000", outcome: "hit" });
    expect(hits).toBe(1);

    controller.stop();
  });

  it("tecla correcta YA pulsada dentro de la ventana temprana: gate consumido sin congelar", () => {
    // Ajuste 2026-11-07: anticiparse NO es un error que detenga la pieza —
    // es un timing que apunta el agente/evaluación. El transporte pasa el
    // gate sonando (onEarlyHit) y no entra a espera nunca.
    let nowMs = 10_000;
    const earlyGates: string[] = [];
    const controller = createGateController({
      getSnapshot: () => current,
      subscribeNoteInput,
      sendPracticeEvent: (event) => events.push(event),
      clockMs: () => nowMs,
      onHit: () => {
        hits += 1;
      },
      onEarlyHit: (gate) => earlyGates.push(gate.id),
      options: { enabled: true, hand: "left" },
    });
    controller.start();

    // Suenan, el gate 60 está a 0,2 s (dentro de la ventana de 0,4 s)…
    current = snapshot({
      status: "playing",
      position_s: 0.8,
      currentGate: null,
      upcomingGate: {
        id: "gate-1.0000",
        time_s: 1.0,
        duration_s: 0.5,
        pitches: [60],
        hands: ["left"],
        measure: 0,
      },
    });
    emitNoteOn({ pitch: 60, velocity: 80, source: "pc" });

    // …la pulsación anticipada consumió el gate: NADA de espera.
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ gate: "gate-1.0000", outcome: "hit" });
    expect(hits).toBe(0); // el motor no reanuda: jamás se congeló
    expect(earlyGates).toEqual(["gate-1.0000"]);

    // Y no se repite al sondear de nuevo (dedup del propio gate).
    nowMs += 100;
    emitNoteOn({ pitch: 64, velocity: 80, source: "pc" });
    expect(events).toHaveLength(1);
    expect(earlyGates).toHaveLength(1);

    controller.stop();
  });

  it("tecla correcta ANTES de la ventana: el gate no se consume y esperará su turno", () => {
    let nowMs = 10_000;
    const earlyGates: string[] = [];
    const rigEarly = createGateController({
      getSnapshot: () => current,
      subscribeNoteInput,
      sendPracticeEvent: () => undefined,
      clockMs: () => nowMs,
      onHit: () => undefined,
      onEarlyHit: (gate) => earlyGates.push(gate.id),
      options: { enabled: true, hand: "left" },
    });
    rigEarly.start();

    // El gate venidero está a 1,5 s: fuera de la ventana de 0,4 s.
    current = snapshot({
      status: "playing",
      position_s: -0.5,
      currentGate: null,
      upcomingGate: {
        id: "gate-1.0000",
        time_s: 1.0,
        duration_s: 0.5,
        pitches: [60],
        hands: ["left"],
        measure: 0,
      },
    });
    emitNoteOn({ pitch: 60, velocity: 80, source: "pc" });

    expect(earlyGates).toEqual([]);
    expect(events).toHaveLength(0);

    rigEarly.stop();
  });

  it("no duplica el mismo outcome para el mismo gate", () => {
    const controller = makeController();
    controller.start();

    emitNoteOn({ pitch: 61, velocity: 80, source: "pc" });
    emitNoteOn({ pitch: 62, velocity: 80, source: "pc" });

    expect(events).toHaveLength(1);
    expect(events[0].outcome).toBe("wrong");

    controller.stop();
  });
});
