// description: Tests de la interpretación del mentor (B-033.4): buildInterpretation con práctica real (frases de los cuatro bloques, detalles por compás, intervenciones con sus motivos y recomendaciones coherentes con lo que ocurrió), práctica perfecta (sin bloque «A mejorar»), sesión sin señales (forma vacía) y determinismo estricto.
// context: Todo sale de la lib pura `session-interpretation.ts` sin tocar la red ni el informe: el resumen llega como el objeto `PracticeSummary` que sirve B-033.3/B-033.4. La voz debe seguir la skill del chat: primera persona del mentor, segunda del alumno, sin códigos ni siglas en las frases (nada de `gate_` ni `wrong` crudo).

import { describe, expect, it } from "vitest";

import {
  buildInterpretation,
  formatPracticed,
  interpretationContext,
  interpretationPrompt,
} from "./session-interpretation";
import type { PracticeSummary } from "./api-client";

/** Un resumen con práctica con fallos, espejo del que sirve el informe (B-033.4). */
function summaryWithFailures(): PracticeSummary {
  return {
    signals: 9,
    active_measures: 4,
    distinct_gates: 6,
    practiced_s: 130,
    outcomes: { hit: 4, miss: 1, wrong: 3, timeout: 1 },
    hit_ratio: 0.444,
    worst_measures: [
      { measure: 1, counts: { hit: 0, miss: 1, wrong: 0, timeout: 1 }, attempts: 2, hit_ratio: 0 },
      { measure: 2, counts: { hit: 0, miss: 0, wrong: 1, timeout: 0 }, attempts: 1, hit_ratio: 0 },
      { measure: 0, counts: { hit: 2, miss: 0, wrong: 2, timeout: 0 }, attempts: 4, hit_ratio: 0.5 },
    ],
    dominant_failure: { outcome: "wrong", count: 3, gate: "g1" },
    interventions: {
      count: 2,
      by_action: { slow_down: 1, offer_demo: 1 },
      by_reason: { gate_repeated_strikes: 1, gate_timeout_silence: 1 },
    },
    evaluation: { score_total: 61.5, error_type: "pitch", received_ratio: 0.9 },
  };
}

describe("buildInterpretation", () => {
  it("sin resumen o sin señales es la forma vacía", () => {
    for (const summary of [null, undefined, { signals: 0 } as PracticeSummary]) {
      const interpretation = buildInterpretation(summary);
      expect(interpretation.hasPractice).toBe(false);
      expect(interpretation.blocks).toEqual([]);
      expect(interpretation.lines).toEqual([]);
    }
  });

  it("saca los cuatro bloques en su orden con las frases del aula", () => {
    const interpretation = buildInterpretation(summaryWithFailures());

    expect(interpretation.hasPractice).toBe(true);
    expect(interpretation.blocks.map((block) => block.heading)).toEqual([
      "Lo que salió bien",
      "A mejorar",
      "Lo que hice yo",
      "Recomendaciones",
    ]);

    const [good, improve, mine, recommend] = interpretation.blocks.map((block) => block.lines);
    expect(good).toContain(
      "Practicaste 2 min 10 s tocando 9 notas sobre 4 compases: acertaste el 44% de las notas (4 de 9) y una valoración de 61.5 de 100.",
    );

    expect(improve).toContain("el compás 1: 2 fallos de 2 notas — 1 nota sin resolver y 1 nota que llegó tarde.");
    expect(improve.some((line) => line.startsWith("el compás 2:"))).toBe(true);
    expect(improve).toContain("Lo más repetido del rato: 3 teclas equivocadas.");

    expect(mine).toContain("Una vez bajé el tempo.");
    expect(mine).toContain("Una vez te ofrecí una demostración.");
    expect(mine).toContain("Una vez, por fallos repetidos en la misma tecla.");
    expect(mine).toContain("Una vez, por silencios demasiado largos en una nota.");

    expect(recommend.some((line) => line.startsWith("Repasa el compás 1 nota a nota"))).toBe(true);
    expect(
      recommend.some((line) => line.includes("tempo bajo")),
    ).toBe(true);
  });

  it("la práctica perfecta se queda sin «A mejorar» y recomienda apretar", () => {
    const interpretation = buildInterpretation({
      signals: 6,
      active_measures: 3,
      distinct_gates: 4,
      practiced_s: 45,
      outcomes: { hit: 6, miss: 0, wrong: 0, timeout: 0 },
      hit_ratio: 1,
      worst_measures: [],
      dominant_failure: null,
      interventions: { count: 0, by_action: {}, by_reason: {} },
      evaluation: { score_total: 96.2, error_type: "none", received_ratio: 1 },
    });

    const headings = interpretation.blocks.map((block) => block.heading);
    expect(headings).toEqual(["Lo que salió bien", "Lo que hice yo", "Recomendaciones"]);
    expect(interpretation.blocks[0].lines).toContain(
      "Practicaste 45 s tocando 6 notas sobre 3 compases: nada falló y una valoración de 96.2 de 100.",
    );
    expect(interpretation.blocks[0].lines).toContain("Se oyó el pasaje completo, nota a nota.");
    expect(interpretation.blocks[1].lines).toEqual(["No intervine: seguiste solo en todo momento."]);
    expect(interpretation.blocks[2].lines).toEqual([
      "Sin fallos que corregir: el siguiente paso es apretar el metrónomo.",
    ]);
  });

  it("sin dominante fuera de la lista, la recomendación cae al genérico con el compás peor", () => {
    const interpretation = buildInterpretation({
      ...summaryWithFailures(),
      dominant_failure: { outcome: "relámpago", count: 1, gate: null },
    });

    const recommend = interpretation.blocks.at(-1)?.lines ?? [];
    expect(recommend[0]).toBe("Toca el compás 1 a tempo lento antes de subir el paso.");
  });

  it("la misma sesión da las mismas frases (determinismo)", () => {
    const first = buildInterpretation(summaryWithFailures());
    const second = buildInterpretation(summaryWithFailures());

    expect(first).toEqual(second);
    expect(first.lines.length).toBeGreaterThan(4);
  });

  it("las frases no llevan códigos internos ni siglas (voz del aula); notas y teclas, no entradas", () => {
    const lines = buildInterpretation(summaryWithFailures()).lines;
    const prohibidos = [
      "gate_",
      "g1",
      "g3",
      "miss",
      "wrong",
      "timeout",
      "slow_down",
      "offer_demo",
      "entrada", // criterio del usuario del 2026-11-09: notas/teclas, ya
    ];
    for (const line of lines) {
      for (const palabra of prohibidos) {
        expect(line).not.toContain(palabra);
      }
    }
  });
});

describe("formatPracticed", () => {
  it("frases de tiempo del aula y nulos honestos", () => {
    expect(formatPracticed(45)).toBe("45 s");
    expect(formatPracticed(130)).toBe("2 min 10 s");
    expect(formatPracticed(120)).toBe("2 min");
    expect(formatPracticed(null)).toBeNull();
    expect(formatPracticed(-1)).toBeNull();
    expect(formatPracticed(Number.NaN)).toBeNull();
  });
});

describe("turno efímero de la redacción", () => {
  it("el prompt pide como profesor y sin inventar", () => {
    expect(interpretationPrompt()).toContain("práctica");
    expect(interpretationPrompt()).not.toContain("JSON");
  });

  it("la revisión del 2026-11-09: largo y en texto plano — sin markdown, con emojis de conversación", () => {
    const prompt = interpretationPrompt();
    expect(prompt).toContain("texto plano");
    expect(prompt).toContain("**asteriscos**"); // lo prohibe con nombre, para que no salga literal
    expect(prompt).toContain("emoji");
    expect(prompt).toContain("la ventana es grande");
  });

  it("el contexto lleva los destacados unidos y conserva lo que ya viajaba", () => {
    const interpretation = buildInterpretation(summaryWithFailures());
    const context = interpretationContext(interpretation, { page: "/piano" });

    expect(context.page).toBe("/piano");
   expect(typeof context.destacados).toBe("string");
    for (const line of interpretation.lines) {
      expect(context.destacados).toContain(line);
    }
  });
});
