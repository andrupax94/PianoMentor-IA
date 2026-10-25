// description: Tests del mensaje de pista: etiqueta en español para toda la lista blanca, acción cruda si aparece una nueva fuera del mapa, motivo vacío que deja solo la etiqueta y ausencia de la procedencia en el texto.
// context: Criterio de B-012.6; se ejecutan con `npm run test` (Vitest).

import { describe, expect, it } from "vitest";

import type { AgentStepResponse } from "./api-client";
import { AGENT_ACTION_LABELS, hintMessage } from "./agent-hint";

/** Acciones que el backend tiene en su lista blanca (ALLOWED_ACTIONS). */
const ALLOWED_ACTIONS = [
  "wait",
  "give_hint",
  "slow_down",
  "demonstrate",
  "accompany",
  "return_control",
];

function step(partial: Partial<AgentStepResponse>): AgentStepResponse {
  return {
    action: "give_hint",
    status: "validated",
    provider: "groq",
    reason: "",
    used_fallback: false,
    ...partial,
  };
}

describe("AGENT_ACTION_LABELS", () => {
  it("tiene etiqueta en español para toda la lista blanca", () => {
    for (const action of ALLOWED_ACTIONS) {
      expect(AGENT_ACTION_LABELS[action]).toBeTruthy();
    }
  });

  it("no expone nombres crudos de acción en las etiquetas", () => {
    expect(Object.values(AGENT_ACTION_LABELS)).not.toContain("give_hint");
  });
});

describe("hintMessage", () => {
  it("traduce la acción y añade el motivo del agente", () => {
    expect(hintMessage(step({ action: "slow_down", reason: "Vas demasiado rápido." }))).toBe(
      "Bajar el tempo: Vas demasiado rápido.",
    );
  });

  it("se queda solo con la etiqueta cuando no hay motivo", () => {
    expect(hintMessage(step({ action: "wait", reason: "   " }))).toBe("Esperar");
  });

  it("usa la acción cruda si el backend añade una nueva fuera del mapa", () => {
    expect(hintMessage(step({ action: "inventada", reason: "Motivo." }))).toBe(
      "inventada: Motivo.",
    );
  });

  it("ignora la procedencia: el alumno no ve si vino de Groq o de las reglas", () => {
    const mensaje = hintMessage(step({ provider: "deterministic", used_fallback: true }));
    expect(mensaje).not.toContain("deterministic");
    expect(mensaje).not.toContain("Groq");
    expect(mensaje).not.toContain("fallback");
  });
});
