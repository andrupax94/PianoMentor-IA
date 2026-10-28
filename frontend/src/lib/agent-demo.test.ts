// description: Tests de la demostración: control efectivo (demostrar bloquea y return_control desbloquea aunque el estado diga lo contrario), ventana, parámetros ausentes y etiqueta; del canal de reproducción (entrega con seq creciente, baja de suscriptores y publicación sin nadie escuchando) y de demoSubScore (recorte de notas y rejilla, desplazado al 0, ventana invertida, índices acotados, sin rejilla y sin notas).
// context: Criterio de B-012.5 (front muestra IA demostrando, bloquea input y hace sonar la ventana); se ejecutan con `npm run test` (Vitest) sin DOM.

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  demoLabel,
  demoSubScore,
  demoWindow,
  effectiveControl,
  isDemonstrating,
  publishDemoPlayback,
  subscribeDemoPlayback,
} from "./agent-demo";
import type { DemoPlaybackMessage, DemoScore } from "./agent-demo";
import type { PlayableNote, PieceMeasures } from "./api-client";
import type { AgentActionMessage } from "./websocket-client";

const DEMONSTRATE: AgentActionMessage = {
  type: "agent_action",
  action: "demonstrate",
  from_measure: 0,
  to_measure: 4,
  tempo_factor: 0.7,
};

const RETURN_CONTROL: AgentActionMessage = { type: "agent_action", action: "return_control" };

describe("isDemonstrating", () => {
  it("solo la acción demostrar pone la demostración en marcha", () => {
    expect(isDemonstrating(DEMONSTRATE)).toBe(true);
    expect(isDemonstrating(RETURN_CONTROL)).toBe(false);
    expect(isDemonstrating(null)).toBe(false);
    expect(isDemonstrating(undefined)).toBe(false);
  });
});

describe("effectiveControl", () => {
  it("mientras demuestra, el agente tiene el control aunque el estado diga estudiante", () => {
    // El backend cambia el control en su base de datos pero no re-empuja
    // `state`: sin este OR el teclado seguiría desbloqueado durante la demo.
    expect(effectiveControl({ control: "student" }, DEMONSTRATE)).toBe("agent");
    expect(effectiveControl(null, DEMONSTRATE)).toBe("agent");
  });

  it("con return_control el sobre también manda sobre un estado desfasado", () => {
    // El estado cacheado puede seguir diciendo "agent" (el backend no lo
    // re-empuja al devolver el control): la acción es más nueva y manda.
    expect(effectiveControl({ control: "agent" }, RETURN_CONTROL)).toBe("student");
    expect(effectiveControl({ control: "student" }, RETURN_CONTROL)).toBe("student");
  });

  it("sin acción vigente manda el estado del servidor", () => {
    expect(effectiveControl({ control: "student" }, null)).toBe("student");
    expect(effectiveControl({ control: "agent" }, null)).toBe("agent");
  });

  it("sin estado ni acción, el estudiante tiene el control por defecto", () => {
    expect(effectiveControl(null, null)).toBe("student");
    expect(effectiveControl(undefined, undefined)).toBe("student");
  });
});

describe("demoWindow", () => {
  it("lee la ventana y el tempo del sobre de demostración", () => {
    expect(demoWindow(DEMONSTRATE)).toEqual({ fromMeasure: 0, toMeasure: 4, tempoFactor: 0.7 });
  });

  it("un sobre sin parámetros deja la ventana vacía, no inventa números", () => {
    expect(demoWindow({ type: "agent_action", action: "demonstrate" })).toEqual({
      fromMeasure: null,
      toMeasure: null,
      tempoFactor: null,
    });
  });

  it("lo que no venga numérico cuenta como ausente", () => {
    expect(
      demoWindow({ type: "agent_action", action: "demonstrate", tempo_factor: Number.NaN }),
    ).toEqual({ fromMeasure: null, toMeasure: null, tempoFactor: null });
  });

  it("sin demostración no hay ventana (return_control o nada)", () => {
    expect(demoWindow(RETURN_CONTROL)).toBeNull();
    expect(demoWindow(null)).toBeNull();
  });
});

describe("demoLabel", () => {
  it("pinta ventana de compases (1-based) y porcentaje del tempo", () => {
    expect(demoLabel(demoWindow(DEMONSTRATE))).toBe("IA demostrando (compases 1–5, 70 % del tempo)");
  });

  it("omite lo que el sobre no trae", () => {
    expect(demoLabel(demoWindow({ type: "agent_action", action: "demonstrate" }))).toBe(
      "IA demostrando",
    );
    expect(demoLabel({ fromMeasure: 2, toMeasure: 3, tempoFactor: null })).toBe(
      "IA demostrando (compases 3–4)",
    );
    expect(demoLabel({ fromMeasure: null, toMeasure: null, tempoFactor: 0.5 })).toBe(
      "IA demostrando (50 % del tempo)",
    );
  });

  it("sin ventana también nombra la demostración", () => {
    expect(demoLabel(null)).toBe("IA demostrando");
  });
});

/** Suscripciones vivas: se dan de baja tras cada test para no cruzarlas. */
const pendingUnsubs: (() => void)[] = [];

afterEach(() => {
  while (pendingUnsubs.length > 0) pendingUnsubs.pop()?.();
});

function subscribe(listener: (message: DemoPlaybackMessage) => void): void {
  pendingUnsubs.push(subscribeDemoPlayback(listener));
}

describe("canal de reproducción de la demostración", () => {
  it("entrega la orden con su contador y la de parada a los suscritos", () => {
    const seen: { kind: string; seq: number }[] = [];
    subscribe((message) => seen.push({ kind: message.event.kind, seq: message.seq }));

    publishDemoPlayback({
      kind: "start",
      pieceId: "p16",
      window: { fromMeasure: 0, toMeasure: 4, tempoFactor: 0.7 },
    });
    publishDemoPlayback({ kind: "stop" });

    expect(seen).toHaveLength(2);
    expect(seen[0].kind).toBe("start");
    expect(seen[1].kind).toBe("stop");
    // Dos demos seguidas nunca son "la misma": el contador solo sube.
    expect(seen[1].seq).toBeGreaterThan(seen[0].seq);
  });

  it("quien se da de baja deja de recibir órdenes", () => {
    const fuera = vi.fn();
    const fueraAlta = subscribeDemoPlayback(fuera);
    const dentro = vi.fn();
    subscribeDemoPlayback(dentro);

    fueraAlta();
    publishDemoPlayback({ kind: "stop" });

    expect(fuera).not.toHaveBeenCalled();
    expect(dentro).toHaveBeenCalledTimes(1);
  });

  it("sin suscritos no se pierde nada (es un evento, no un estado)", () => {
    // Ningún listener vivo: la orden no debe reventar ni dejarte pensando
    // que alguien la recogió.
    expect(() => publishDemoPlayback({ kind: "stop" })).not.toThrow();
  });
});

/* --- demoSubScore: la ventana recortada que suena en el transporte ------- */

function note(start: number, duration = 1, pitch = 60): PlayableNote {
  return {
    pitch,
    start_seconds: start,
    duration_seconds: duration,
    velocity: 80,
    channel: 0,
    track: 0,
  };
}

/** 4 compases de 4 s: [0, 4, 8, 12] y fin en 16. */
const GRID: PieceMeasures = {
  count: 4,
  starts_s: [0, 4, 8, 12],
  signatures: [
    [4, 4],
    [4, 4],
    [4, 4],
    [4, 4],
  ],
  end_s: 16,
};

const SCORE: DemoScore = {
  notes: [note(0), note(2), note(4), note(8.5), note(12.5), note(15.5)],
  measures: GRID,
};

const WINDOW: { fromMeasure: number; toMeasure: number; tempoFactor: number } = {
  fromMeasure: 1,
  toMeasure: 2,
  tempoFactor: 0.7,
};

describe("demoSubScore", () => {
  it("recorta solo las notas que empiezan dentro de la ventana de compases", () => {
    const sub = demoSubScore(SCORE, WINDOW);

    // Compases 2–3 (0-based 1..2): caen dentro los que empiezan en 4 y 8.5.
    expect(sub.notes.map((n) => n.start_seconds)).toEqual([0, 4.5]);
    // Todo queda desplazado al segundo 0 para que el transporte arranque ahí.
    expect(sub.notes.every((n) => n.start_seconds >= 0)).toBe(true);
  });

  it("recorta la rejilla al rango y la desplaza, para que el compás siga real", () => {
    const sub = demoSubScore(SCORE, WINDOW);

    expect(sub.measures).not.toBeNull();
    expect(sub.measures?.count).toBe(2);
    expect(sub.measures?.starts_s).toEqual([0, 4]);
    expect(sub.measures?.signatures).toHaveLength(2);
    expect(sub.measures?.end_s).toBe(8);
    expect(sub.duration_s).toBe(8);
  });

  it("las notas no arrancan en 0: se recorta lo anterior", () => {
    const sub = demoSubScore(SCORE, { ...WINDOW, fromMeasure: 3, toMeasure: 3 });

    // Último compase [12, 16): sobreviven las de 12.5 y 15.5, ambas desplazadas.
    expect(sub.notes.map((n) => n.start_seconds)).toEqual([0.5, 3.5]);
    expect(sub.measures?.starts_s).toEqual([0]);
    expect(sub.duration_s).toBe(4);
  });

  it("una ventana invertida (de mayor a menor) se normaliza", () => {
    const sub = demoSubScore(SCORE, { ...WINDOW, fromMeasure: 2, toMeasure: 1 });

    expect(sub.notes.map((n) => n.start_seconds)).toEqual([0, 4.5]);
    expect(sub.measures?.count).toBe(2);
  });

  it("los índices fuera de la rejilla se acotan, no revientan", () => {
    const sub = demoSubScore(SCORE, { fromMeasure: -5, toMeasure: 99, tempoFactor: null });

    expect(sub.measures?.count).toBe(GRID.count);
    expect(sub.duration_s).toBe(GRID.end_s);
    expect(sub.notes).toHaveLength(SCORE.notes.length);
  });

  it("sin rejilla devuelve la pieza entera (no hay mapa compase→segundo)", () => {
    const sinRejilla: DemoScore = { notes: [note(0), note(9)], measures: null };
    const sub = demoSubScore(sinRejilla, WINDOW);

    expect(sub.measures).toBeNull();
    expect(sub.notes).toHaveLength(2);
    // La duración es el fin de la última nota, para no cortar el sustain.
    expect(sub.duration_s).toBe(10);
  });

  it("sin notas no hay ventana sonora, pero tampoco error", () => {
    const vacio: DemoScore = { notes: [], measures: GRID };
    const sub = demoSubScore(vacio, WINDOW);

    expect(sub.notes).toHaveLength(0);
    expect(sub.duration_s).toBe(8);
  });
});
