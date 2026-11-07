// description: Tests del runner de escenarios sintéticos (B-033.1): qué teclas pulsa el robot en cada escenario, cuándo (reloj falso), la suspensión con la IA al piano y la reproducibilidad de `mezcla`.
// context: B-033.1; puro y sin DOM, con `submit` apuntado a un registro local en vez del puerto real (el contrato del runner no cambia).

import { afterEach, describe, expect, it, vi } from "vitest";

import { createPracticeScenarioRunner, type PracticeScenarioRunner } from "./practice-scenarios";
import type { PlaybackSnapshot } from "./playback-engine";

type Submission = { pitch: number; velocity: number };

function snapshot(overrides: Partial<PlaybackSnapshot> = {}): PlaybackSnapshot {
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
    upcomingGate: null,
    prerollRemaining_s: null,
    waitingSince_wall_s: null,
    ...overrides,
  };
}

describe("practice-scenarios", () => {
  vi.useFakeTimers();

  afterEach(() => {
    vi.clearAllTimers();
  });

  /** Banco de pruebas: reloj manual + registro de pulsaciones. */
  function rig(scenario: Parameters<typeof createPracticeScenarioRunner>[0], seed?: number) {
    let current = snapshot();
    let nowMs = 1000;
    let canEmit = true;
    const submissions: Submission[] = [];
    const releases: Submission[] = [];

    const runner: PracticeScenarioRunner = createPracticeScenarioRunner(
      scenario,
      {
        getSnapshot: () => current,
        submitNoteOn: (event) => submissions.push({ ...event }),
        submitNoteOff: (event) => releases.push({ ...event, velocity: 0 }),
        clockMs: () => nowMs,
        canEmit: () => canEmit,
      },
      { seed },
    );

    /** Hace avanzar el reloj manual y el del runner juntos. */
    const advance = (ms: number) => {
      nowMs += ms;
      vi.advanceTimersByTime(ms);
    };

    return {
      advance,
      runner,
      submissions,
      releases,
      setGate: (gate: PlaybackSnapshot["currentGate"]) => {
        current = snapshot({ currentGate: gate });
      },
      setStatus: (status: PlaybackSnapshot["status"]) => {
        current = snapshot({ status, currentGate: status === "waiting" ? current.currentGate : null });
      },
      /** Modo flujo (espera apagada): reproducción con el gate venidero que pasa la cascada. */
      setFlow: (position_s: number, gate: NonNullable<PlaybackSnapshot["upcomingGate"]>) => {
        current = snapshot({ status: "playing", position_s, currentGate: null, upcomingGate: gate });
      },
      setControl: (allowed: boolean) => {
        canEmit = allowed;
      },
    };
  }

  it("perfecta pulsa el gate completo en cuanto aparece y sostiene la nota su tiempo", () => {
    const rig1 = rig("perfecta");
    rig1.runner.start();

    rig1.advance(100);
    expect(rig1.submissions).toEqual([{ pitch: 60, velocity: 80 }]);

    // Aun sosteniendo, los sondeos siguientes no repiten la pulsación.
    rig1.advance(100);
    expect(rig1.submissions).toHaveLength(1);

    // La tecla se aguanta la duración escrita menos el hueco de seguridad
    // (0,5 s de nota − 120 ms = 380 ms): al superarlo, suelta.
    rig1.advance(300);
    expect(rig1.releases).toEqual([{ pitch: 60, velocity: 0 }]);

    // Y ya no vuelve a pulsar el mismo gate (un gesto por gate).
    rig1.advance(500);
    expect(rig1.submissions).toHaveLength(1);

    rig1.runner.stop();
  });

  it("perfecta suelta la nota su tiempo aunque el gate ya se cerró (el rescate saca al transporte de espera)", () => {
    const rigHold = rig("perfecta");
    rigHold.runner.start();

    rigHold.advance(100);
    expect(rigHold.submissions).toEqual([{ pitch: 60, velocity: 80 }]);

    // La pulsación rescata el gate: el transporte deja de esperar.
    rigHold.setStatus("playing");

    // El sondeo inmediato NO suelta por sorpresa: sin gate en espera, el plan
    // sobrevive con su reloj de suelta (aquí el sondeo vería ~200 ms).
    rigHold.advance(200);
    expect(rigHold.releases).toEqual([]);

    // 400 ms tras pulsar ≥ 380 (0,5 s de nota − 120 ms de hueco): suelta a la
    // duración escrita ya sonando la pieza.
    rigHold.advance(200);
    expect(rigHold.releases).toEqual([{ pitch: 60, velocity: 0 }]);

    rigHold.runner.stop();
  });

  it("flujo (espera apagada): el robot toca la partitura gate a gate, sin esperar nunca", () => {
    const rigFlow = rig("perfecta");
    rigFlow.runner.start();

    // Primer gate en camino: la posición llega a su instante y el robot
    // planifica; pulsa en cuanto el sondeo lo ve.
    rigFlow.setFlow(1.0, {
      id: "gate-1.0000",
      time_s: 1.0,
      duration_s: 0.5,
      pitches: [60],
      hands: ["left"],
      measure: 0,
    });
    rigFlow.advance(100);
    expect(rigFlow.submissions).toEqual([{ pitch: 60, velocity: 80 }]);

    // La suelta sigue siendo del reloj (0,5 s de nota − 120 ms de hueco): el
    // flujo no la adelanta ni la corta.
    rigFlow.advance(300);
    expect(rigFlow.releases).toEqual([]);

    rigFlow.advance(100);
    expect(rigFlow.releases).toEqual([{ pitch: 60, velocity: 0 }]);

    // Gate siguiente: al quedar libres las manos se adopta y se pulsa, sin
    // ninguna espera en medio (la pieza no se congela nunca).
    rigFlow.setFlow(1.6, {
      id: "gate-1.5000",
      time_s: 1.5,
      duration_s: 0.4,
      pitches: [64],
      hands: ["right"],
      measure: 0,
    });
    rigFlow.advance(100);
    expect(rigFlow.submissions).toEqual([
      { pitch: 60, velocity: 80 },
      { pitch: 64, velocity: 80 },
    ]);

    rigFlow.runner.stop();
  });

  it("flujo: con el transporte parado no hay pulsación rezagada", () => {
    const rigFlowStop = rig("perfecta");
    rigFlowStop.runner.start();

    // Ya en flujo a mitad de pieza: stop antes de pulsar (status stopped).
    rigFlowStop.setFlow(1.0, {
      id: "gate-1.0000",
      time_s: 1.0,
      duration_s: 0.5,
      pitches: [60],
      hands: ["left"],
      measure: 0,
    });
    // El sondeo ve el gate de camino pero la parada llega antes de pulsar.
    rigFlowStop.setStatus("stopped");
    rigFlowStop.advance(1000);
    expect(rigFlowStop.submissions).toEqual([]);

    rigFlowStop.runner.stop();
  });

  it("flujo predictivo: el golpe cae en el instante del gate, no al adoptarlo", () => {
    // Diagnóstico de timings (2026-11-07): el log mostraba pulsos 100–400 ms
    // ANTES del gate — el pulso salía en el sondeo en que se adoptaba el gate
    // (justo al soltar la nota anterior). Ahora la adopción AGENDA el golpe
    // al muro del gate (remaining por tempoFactor) y el pulso cae en él.
    const rigFlow = rig("perfecta");
    rigFlow.runner.start();

    // Gate venidero a 0,3 s de la posición: se adopta y se agenda, sin pulso.
    rigFlow.setFlow(0.7, {
      id: "gate-1.0000",
      time_s: 1.0,
      duration_s: 0.5,
      pitches: [60],
      hands: ["left"],
      measure: 0,
    });
    rigFlow.advance(200);
    expect(rigFlow.submissions).toEqual([]);

    // El muro del gate vence (300 ms desde la adopción): pulso puntual.
    rigFlow.advance(300);
    expect(rigFlow.submissions).toEqual([{ pitch: 60, velocity: 80 }]);

    // La suleta: 380 ms de sostén contra el muro del golpe.
    rigFlow.advance(500);
    expect(rigFlow.releases.map((r) => r.pitch)).toEqual([60]);

    rigFlow.runner.stop();
  });

  it("teclas_rapidas sostiene mitad del gate (el gesto corto del v1)", () => {
    const rigFast = rig("teclas_rapidas");
    rigFast.runner.start();

    rigFast.advance(100);
    expect(rigFast.submissions).toEqual([{ pitch: 60, velocity: 80 }]);

    rigFast.advance(100);
    // Gate de 0,5 s → 250 ms de hold: recorridos (100 + 200 = 300 ms), suelta.
    rigFast.advance(200);
    expect(rigFast.releases).toEqual([{ pitch: 60, velocity: 0 }]);

    rigFast.runner.stop();
  });

  it("perfecta en acorde pulsa todas las notas del gate", () => {
    const rig2 = rig("perfecta");
    rig2.setGate({
      id: "gate-2.0000",
      time_s: 2.0,
      duration_s: 1.0,
      pitches: [60, 64],
      hands: ["left", "right"],
      measure: 1,
    });
    rig2.runner.start();

    rig2.advance(100);
    expect(rig2.submissions).toEqual([
      { pitch: 60, velocity: 80 },
      { pitch: 64, velocity: 80 },
    ]);

    rig2.runner.stop();
  });

  it("siempre_tarde espera el margen completo y acierta después (rescate tardío)", () => {
    const rig3 = rig("siempre_tarde");
    rig3.runner.start();

    // A 120 bpm el margen es de 2 pulsos = 1000 ms, más el extra (1150 ms).
    rig3.advance(1100);
    expect(rig3.submissions).toHaveLength(0);

    rig3.advance(1200);
    expect(rig3.submissions).toEqual([{ pitch: 60, velocity: 80 }]);

    rig3.runner.stop();
  });

  it("siempre_equivocada pulsa una tecla que no es del gate", () => {
    const rig4 = rig("siempre_equivocada");
    rig4.runner.start();

    // El gate arranca en el primer sondeo; el gesto tiene 150 ms de retraso.
    rig4.advance(200);
    expect(rig4.submissions).toHaveLength(0);

    rig4.advance(300);
    expect(rig4.submissions).toEqual([{ pitch: 59, velocity: 80 }]);
    expect(rig4.releases.map((r) => r.pitch)).toEqual([]);

    // La suelta se mide contra el muro del golpe real (el banco agendó el
    // pulso por temporizador: su suleta cae en la ventana siguiente al vencer
    // hold=380 ms sobre pressDeadline=1500 → 1880).
    rig4.advance(500);
    expect(rig4.releases.map((r) => r.pitch)).toEqual([59]);

    rig4.runner.stop();
  });

  it("nunca_press no pulsa nada pase lo que pase", () => {
    const rig5 = rig("nunca_press");
    rig5.runner.start();

    rig5.advance(5000);
    expect(rig5.submissions).toHaveLength(0);
    expect(rig5.releases).toHaveLength(0);

    rig5.runner.stop();
  });

  it("acorde_incompleto pulsa solo una parte del acorde", () => {
    const rig6 = rig("acorde_incompleto");
    rig6.setGate({
      id: "gate-3.0000",
      time_s: 3.0,
      duration_s: 0.4,
      pitches: [60, 64, 67],
      hands: ["left", "right"],
      measure: 1,
    });
    rig6.runner.start();

    rig6.advance(100);
    expect(rig6.submissions).toEqual([{ pitch: 60, velocity: 80 }]);

    rig6.runner.stop();
  });

  it("cambia de gate: el sostén sobrevive al cambio y la siguiente entra al quedar libres las manos", () => {
    const rig7 = rig("perfecta");
    rig7.runner.start();

    rig7.advance(100);
    expect(rig7.submissions).toHaveLength(1);

    rig7.setGate({
      id: "gate-9.0000",
      time_s: 9.0,
      duration_s: 0.5,
      pitches: [72],
      hands: ["right"],
      measure: 3,
    });
    // Cambio a mitad de hold: no se corta por sorpresa — la nota del gate
    // anterior sigue a la suya (suelta del reloj) aunque el gate ya sea otro.
    rig7.advance(300);
    expect(rig7.releases.map((r) => r.pitch)).toEqual([]);

    // 100 + 300 = 400 ms ≥ 380: suelta a su duración escrita...
    rig7.advance(100);
    expect(rig7.releases.map((r) => r.pitch)).toEqual([60]);

    // ...y con las manos libres se planifica el gate nuevo (nota aparte).
    rig7.advance(100);
    expect(rig7.submissions.map((s) => s.pitch)).toEqual([60, 72]);

    rig7.runner.stop();
  });

  it("el robot se calla mientras la IA controla y retoma al devolverse el gate", () => {
    const rig8 = rig("perfecta");
    rig8.runner.start();

    rig8.setControl(false);
    rig8.advance(1000);
    expect(rig8.submissions).toHaveLength(0);

    rig8.setControl(true);
    rig8.advance(100);
    expect(rig8.submissions).toEqual([{ pitch: 60, velocity: 80 }]);

    rig8.runner.stop();
  });

  it("deja de emitir cuando el transporte sale del modo espera", () => {
    const rig9 = rig("perfecta");
    rig9.runner.start();

    rig9.setStatus("playing");
    rig9.advance(1000);
    expect(rig9.submissions).toHaveLength(0);

    rig9.runner.stop();
  });

  it("mezcla con la misma semilla reproduce exactamente las mismas señales", () => {
    /**
     * Recorre 24 gates distintos (como una pieza corta), sondeando cada uno
     * en dos ventanas: al aparecer y tras el margen. El gesto se etiqueta
     * comparando el pitch con el esperado del gate: inmediato = hit, dentro
     * del segundo margen con el pitch justo = tarde, con otro pitch =
     * equivocada. Así la igualdad entre pasadas es exacta y también se
     * revisa que salgan los tres gestos con sus proporciones fijas.
     */
    function runMix(seed: number): string[] {
      const banco = rig("mezcla", seed);
      banco.runner.start();
      const summary: string[] = [];
      for (let index = 0; index < 24; index += 1) {
        const expected = 60 + (index % 12);
        banco.advance(0); // cierra el paso anterior (la suelta restante cabe)
        banco.setGate({
          id: `gate-${(index + 1).toFixed(4)}`,
          time_s: index + 1,
          duration_s: 0.5,
          pitches: [expected],
          hands: ["left"],
          measure: index % 4,
        });

        const before = banco.submissions.length;
        banco.advance(200); // al aparecer
        if (banco.submissions.length > before) {
          const pitch = banco.submissions[before].pitch;
          summary.push(`gate-${index + 1}: ${pitch === expected ? "inmediato" : "equivocada"}`);
        } else {
          banco.advance(1200); // tras el margen: 200 + 1200 = 1400 > 1150
          if (banco.submissions.length > before) {
            const pitch = banco.submissions[before].pitch;
            summary.push(`gate-${index + 1}: ${pitch === expected ? "tarde" : "equivocada"}`);
          }
        }
        banco.advance(800); // cierra el paso: la suelta (hold 250 ms) cabe
      }
      banco.runner.stop();
      return summary;
    }

    const first = runMix(7);
    const second = runMix(7);
    expect(second).toEqual(first);

    // Con las proporciones de mezcla (hit 50 %, tarde 30 %, equivocada 20 %)
    // en una pieza corta basta con que los tres gestos aparezcan (las
    // propiedades de la semilla pueden agrupar; lo determinista es lo que
    // importa, no la cuota exacta de una muestra corta).
    expect(first.filter((line) => line.includes("inmediato")).length).toBeGreaterThan(0);
    expect(first.filter((line) => line.includes("tarde")).length).toBeGreaterThan(0);
    expect(first.filter((line) => line.includes("equivocada")).length).toBeGreaterThan(0);
  });

  it("stop limpia y un reinicio vuelve a empezar de cero", () => {
    const rig10 = rig("perfecta");
    rig10.runner.start();
    rig10.advance(100);
    expect(rig10.submissions).toHaveLength(1);

    rig10.runner.stop();
    rig10.advance(1000);
    expect(rig10.submissions).toHaveLength(1);
    // La suelta pendiente se completa al parar (no queda la tecla colgada).
    expect(rig10.releases.map((r) => r.pitch)).toEqual([60]);

    rig10.runner.start();
    rig10.advance(100);
    expect(rig10.submissions).toHaveLength(2);
    rig10.runner.stop();
  });
});
