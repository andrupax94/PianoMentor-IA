// description: Tests del gate-controller: hit, wrong, timeout y deduplicación de señales; desde B-033.9, los gates que el transporte deja atrás sin congelarse (el bot toca con el modo espera auto-apagado) también emiten su señal — hit anticipated si sus teclas fueron pulsadas en la ventana razonable, miss si nadie las pulsó — sin duplicar con el ANTICIPADO ni interferir con la vía de espera.
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

  // -- B-033.9: gates que pasan SIN congelación (el bot toca con el modo
  //    espera auto-apagado). Cada gate que el transporte deja atrás emite su
  //    señal: la captura deja de depender de la carrera de la ventana.

  describe("gate pasado sin congelación (B-033.9)", () => {
    let nowMs: number;
    let current: PlaybackSnapshot;

    beforeEach(() => {
      vi.useFakeTimers();
      nowMs = 1_000;
      current = snapshot({ status: "playing", currentGate: null });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    function gateEn(time_s: number, pitches: number[]) {
      return {
        id: `gate-${time_s.toFixed(4)}`,
        time_s,
        duration_s: 0.5,
        pitches,
        hands: ["unknown" as const],
        measure: 0,
      };
    }

    function makeRig() {
      return createGateController({
        getSnapshot: () => current,
        subscribeNoteInput,
        sendPracticeEvent: (event) => events.push(event),
        clockMs: () => nowMs,
        onHit: () => undefined,
        options: { enabled: true, hand: "both" },
      });
    }

    /** Un paso del sondeo (100 ms, el intervalo real del controlador). */
    const sondeo = () => vi.advanceTimersByTime(100);

    it("el gate que pasa con sus teclas pulsadas emite hit anticipated", () => {
      const controller = makeRig();
      controller.start();

      // El gate 1.0 viene de camino; el bot pulsa su nota a tiempo.
      current = snapshot({
        status: "playing",
        position_s: 0.9,
        currentGate: null,
        upcomingGate: gateEn(1.0, [60]),
      });
      sondeo(); // cola el gate pendiente
      emitNoteOn({ pitch: 60, velocity: 80, source: "debug" });

      // El transporte avanza 0,5 s (score) y el gate queda atrás sin congelarse.
      nowMs += 500;
      current = snapshot({
        status: "playing",
        position_s: 1.4,
        currentGate: null,
        upcomingGate: gateEn(2.0, [62]),
      });
      sondeo(); // drena: gate-1.0 pasó → hit anticipated

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        gate: "gate-1.0000",
        outcome: "hit",
        anticipated: true,
        wait_ms: 0,
      });
      // El gate siguiente queda en cola, no emitido antes de tiempo.
      expect(events.some((event) => event.gate === "gate-2.0000")).toBe(false);

      controller.stop();
    });

    it("el gate que pasa sin que nadie pulse sus teclas emite miss", () => {
      const controller = makeRig();
      controller.start();

      current = snapshot({
        status: "playing",
        position_s: 0.9,
        currentGate: null,
        upcomingGate: gateEn(1.0, [60]),
      });
      sondeo(); // en cola, sin pulsaciones

      nowMs += 500;
      current = snapshot({
        status: "playing",
        position_s: 1.4,
        currentGate: null,
        upcomingGate: null,
      });
      sondeo(); // pasó vacío → miss

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ gate: "gate-1.0000", outcome: "miss" });
      expect(events[0].anticipated).toBeUndefined(); // un miss no lleva flag

      controller.stop();
    });

    it("el ANTICIPADO no duplica señal cuando el gate pasa después", () => {
      const controller = makeRig();
      controller.start();

      // El gate 1.0 a 0,2 s (dentro de la ventana): la pulsación lo consume.
      current = snapshot({
        status: "playing",
        position_s: 0.8,
        currentGate: null,
        upcomingGate: gateEn(1.0, [60]),
      });
      emitNoteOn({ pitch: 60, velocity: 80, source: "debug" });
      expect(events).toHaveLength(1); // hit anticipado

      // El gate pasa: la cola no vuelve a emitirlo.
      nowMs += 500;
      current = snapshot({
        status: "playing",
        position_s: 1.4,
        currentGate: null,
        upcomingGate: null,
      });
      sondeo();

      expect(events).toHaveLength(1);
      expect(events[0].anticipated).toBe(true);

      controller.stop();
    });

    it("al congelarse el transporte la cola de paso se descarta (vía de espera manda)", () => {
      const controller = makeRig();
      controller.start();

      current = snapshot({
        status: "playing",
        position_s: 0.9,
        currentGate: null,
        upcomingGate: gateEn(1.0, [60]),
      });
      sondeo(); // en cola

      // El motor congela en el gate: la resolución va por la vía de espera.
      current = snapshot(); // waiting en gate-1.0
      sondeo();
      emitNoteOn({ pitch: 60, velocity: 80, source: "pc" });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ gate: "gate-1.0000", outcome: "hit" });
      expect(events[0].anticipated).toBeUndefined(); // resuelto en espera

      controller.stop();
    });

    it("al parar la pieza, los gates alcanzados y sin señal cierran la suya", () => {
      const controller = makeRig();
      controller.start();

      current = snapshot({
        status: "playing",
        position_s: 0.9,
        currentGate: null,
        upcomingGate: gateEn(1.0, [60]),
      });
      sondeo(); // en cola, sin pulsar

      // La pieza termina con el gate alcanzado (la posición lo cubrió).
      current = snapshot({
        status: "stopped",
        position_s: 1.2,
        currentGate: null,
        upcomingGate: null,
      });
      sondeo();

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ gate: "gate-1.0000", outcome: "miss" });

      controller.stop();
    });

    it("una pulsación muy anterior a su gate no la resuelve al pasar", () => {
      const controller = makeRig();
      controller.start();

      // La nota se pulsó 1 s antes del gate (fuera de la ventana de 0,4 s):
      // al pasar, la captura honesta es miss, no hit inventado.
      current = snapshot({
        status: "playing",
        position_s: 0.0,
        currentGate: null,
        upcomingGate: gateEn(1.0, [60]),
      });
      sondeo(); // el gate entra en cola
      emitNoteOn({ pitch: 60, velocity: 80, source: "debug" });

      nowMs += 1_500; // la pulsación queda a 1.5 s de score del gate
      current = snapshot({
        status: "playing",
        position_s: 1.5,
        currentGate: null,
        upcomingGate: null,
      });
      sondeo();

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ gate: "gate-1.0000", outcome: "miss" });

      controller.stop();
    });
  });
});
