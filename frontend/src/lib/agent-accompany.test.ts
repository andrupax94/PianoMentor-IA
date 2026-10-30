// description: Tests del acompañamiento en el front (B-012.7): plan desde el sobre (mano, sección y notas absolutas), mano del estudiante, umbral de latencia, degradación a demostración y etiqueta del indicador.
// context: Criterio de B-012.7 (la IA toca una mano sin bloquear al estudiante y el acompañamiento se degrada si el canal es lento); Vitest sin DOM.

import { describe, expect, it } from "vitest";

import {
  ACCOMPANY_MAX_RTT_MS,
  accompanyLabel,
  accompanyPlan,
  demoParamsFor,
  isAccompanying,
  shouldDegradeToDemo,
  studentHandFor,
} from "./agent-accompany";
import type { AgentActionMessage } from "./websocket-client";

const ACCOMPANY: AgentActionMessage = {
  type: "agent_action",
  action: "accompany",
  hand: "left",
  student_hand: "right",
  from_measure: 2,
  to_measure: 4,
  from_s: 4,
  duration_s: 4,
  tempo_factor: 0.9,
  notes: [
    { pitch: 48, start_s: 0, duration_s: 2, velocity: 60 },
    { pitch: 55, start_s: 0, duration_s: 2, velocity: 60 },
    { pitch: 45, start_s: 2, duration_s: 1.5, velocity: 64 },
  ],
};

describe("isAccompanying", () => {
  it("solo la acción acompañar enciende el acompañamiento", () => {
    expect(isAccompanying(ACCOMPANY)).toBe(true);
    expect(isAccompanying({ type: "agent_action", action: "demonstrate" })).toBe(false);
    expect(isAccompanying(null)).toBe(false);
  });
});

describe("studentHandFor", () => {
  it("el estudiante toca la mano contraria; con las dos, no le queda ninguna", () => {
    expect(studentHandFor("left")).toBe("right");
    expect(studentHandFor("right")).toBe("left");
    expect(studentHandFor("both")).toBeNull();
  });
});

describe("accompanyPlan", () => {
  it("pasa las notas a tiempo absoluto y conserva la sección", () => {
    const plan = accompanyPlan(ACCOMPANY);

    expect(plan).not.toBeNull();
    expect(plan?.hand).toBe("left");
    expect(plan?.studentHand).toBe("right");
    expect(plan?.fromMeasure).toBe(2);
    expect(plan?.toMeasure).toBe(4);
    expect(plan?.from_s).toBe(4);
    expect(plan?.duration_s).toBe(4);
    expect(plan?.tempoFactor).toBe(0.9);
    // Relativas al inicio de la sección en el sobre → absolutas en el plan.
    expect(plan?.notes.map((n) => n.start_seconds)).toEqual([4, 4, 6]);
    expect(plan?.notes.map((n) => n.pitch)).toEqual([48, 55, 45]);
  });

  it("con las dos manos no le deja mano al estudiante", () => {
    const plan = accompanyPlan({ ...ACCOMPANY, hand: "both" });
    expect(plan?.studentHand).toBeNull();
  });

  it("sin notas no hay plan: no se puede acompañar con silencio", () => {
    expect(accompanyPlan({ ...ACCOMPANY, notes: [] })).toBeNull();
    expect(accompanyPlan({ ...ACCOMPANY, notes: undefined })).toBeNull();
  });

  it("una mano desconocida o una sección rota tampoco dan plan", () => {
    expect(accompanyPlan({ ...ACCOMPANY, hand: "middle" })).toBeNull();
    expect(accompanyPlan({ ...ACCOMPANY, from_s: -1 })).toBeNull();
    expect(accompanyPlan({ ...ACCOMPANY, duration_s: 0 })).toBeNull();
    expect(accompanyPlan({ ...ACCOMPANY, duration_s: Number.NaN })).toBeNull();
  });

  it("descarta las notas rotas y conserva las buenas", () => {
    const plan = accompanyPlan({
      ...ACCOMPANY,
      notes: [
        { pitch: 48, start_s: 0, duration_s: 2, velocity: 60 },
        { pitch: Number.NaN, start_s: 0, duration_s: 2, velocity: 60 },
        { pitch: 50, start_s: 1, duration_s: 0, velocity: 60 },
      ],
    });

    expect(plan?.notes).toHaveLength(1);
  });

  it("una acción que no es acompañar no tiene plan", () => {
    expect(accompanyPlan({ type: "agent_action", action: "demonstrate" })).toBeNull();
    expect(accompanyPlan(null)).toBeNull();
  });
});

describe("shouldDegradeToDemo", () => {
  it("degrada solo cuando la latencia supera el umbral", () => {
    expect(ACCOMPANY_MAX_RTT_MS).toBe(50);
    expect(shouldDegradeToDemo(49)).toBe(false);
    expect(shouldDegradeToDemo(50)).toBe(false);
    expect(shouldDegradeToDemo(51)).toBe(true);
  });

  it("sin medida todavía no se degrada: la primera acción no paga la falta de datos", () => {
    expect(shouldDegradeToDemo(null)).toBe(false);
    expect(shouldDegradeToDemo(undefined)).toBe(false);
    expect(shouldDegradeToDemo(Number.NaN)).toBe(false);
  });
});

describe("demoParamsFor", () => {
  it("demuestra la misma sección con la convención inclusiva del front", () => {
    const params = demoParamsFor(ACCOMPANY, accompanyPlan(ACCOMPANY));

    // Acompañar 2..4 (exclusivo) son los compases 3 y 4 → demo inclusiva 2..3.
    expect(params).toEqual({ from_measure: 2, to_measure: 3, tempo_factor: 0.8 });
  });

  it("recorta a 16 compases y al 80 % del tempo", () => {
    const action: AgentActionMessage = {
      type: "agent_action",
      action: "accompany",
      from_measure: 0,
      to_measure: 40,
      tempo_factor: 1,
      notes: [{ pitch: 48, start_s: 0, duration_s: 1, velocity: 60 }],
    };
    const params = demoParamsFor(action, accompanyPlan({ ...action, hand: "left", from_s: 0, duration_s: 80 }));

    expect(params.from_measure).toBe(0);
    expect(params.to_measure).toBe(15);
    expect(params.tempo_factor).toBe(0.8);
  });

  it("una sección de un compás no manda una acción inválida al backend", () => {
    const params = demoParamsFor(
      { type: "agent_action", action: "accompany", from_measure: 3, to_measure: 4 },
      null,
    );

    expect(params.from_measure).toBe(3);
    expect(params.to_measure).toBe(4);
  });

  it("sin sobre usa los valores por defecto y el tempo máximo de la demo", () => {
    expect(demoParamsFor(null, null)).toEqual({
      from_measure: 0,
      to_measure: 3,
      tempo_factor: 0.8,
    });
  });
});

describe("accompanyLabel", () => {
  it("nombra la mano de la IA, la del estudiante y los compases en 1-based", () => {
    expect(accompanyLabel(accompanyPlan(ACCOMPANY))).toBe(
      "IA acompañando (mano izquierda; tú, mano derecha; compases 3–4)",
    );
  });

  it("con las dos manos no inventa una mano del estudiante", () => {
    expect(accompanyLabel(accompanyPlan({ ...ACCOMPANY, hand: "both" }))).toBe(
      "IA acompañando (las dos manos; compases 3–4)",
    );
  });

  it("sin plan también nombra el acompañamiento", () => {
    expect(accompanyLabel(null)).toBe("IA acompañando");
  });
});
