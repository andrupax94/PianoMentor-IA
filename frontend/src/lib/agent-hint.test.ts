// description: Tests del mensaje de pista (etiqueta en español para toda la lista blanca, acción cruda si aparece una nueva fuera del mapa, motivo vacío que deja solo la etiqueta y ausencia de la procedencia en el texto) y de providerLabel (Groq, Gemini, reglas, simulado y el sufijo «→ reglas deterministas» del fallback).
// context: Criterio de B-012.6; se ejecutan con `npm run test` (Vitest).

import { describe, expect, it } from "vitest";

import type { AgentStepResponse } from "./api-client";
import { AGENT_ACTION_LABELS, hintMessage, providerLabel } from "./agent-hint";

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

describe("providerLabel", () => {
  it("nombra al proveedor en español o con su nombre comercial", () => {
    expect(providerLabel(step({ provider: "groq" }))).toBe("Groq");
    expect(providerLabel(step({ provider: "gemini" }))).toBe("Gemini");
    expect(providerLabel(step({ provider: "deterministic" }))).toBe("reglas deterministas");
    expect(providerLabel(step({ provider: "mock" }))).toBe("proveedor simulado");
  });

  it("señala el fallback cuando un LLM real cayó a las reglas", () => {
    expect(providerLabel(step({ provider: "groq", used_fallback: true }))).toBe(
      "Groq → reglas deterministas",
    );
  });

  it("no pone «fallback» en proveedores que ya son reglas", () => {
    expect(providerLabel(step({ provider: "deterministic", used_fallback: true }))).toBe(
      "reglas deterministas",
    );
    expect(providerLabel(step({ provider: "mock", used_fallback: true }))).toBe(
      "proveedor simulado",
    );
  });

  it("usa el nombre crudo si el backend añade un proveedor nuevo", () => {
    expect(providerLabel(step({ provider: "anthropic" }))).toBe("anthropic");
  });
});
