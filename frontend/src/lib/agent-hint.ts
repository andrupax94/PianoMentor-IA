// description: Traducción de la propuesta del agente a un mensaje para el alumno: AGENT_ACTION_LABELS con la etiqueta en español de cada acción de la lista blanca y hintMessage, que une la etiqueta con el motivo y omite la procedencia (provider/used_fallback); incluye providerLabel, la etiqueta de quién propuso (Groq, Gemini, reglas…) que solo se usa en la línea de diagnóstico del estado de sesión fuera de producción.
// context: B-012.6; acompaña al chip «Pedir pista al agente» del chat. La procedencia es diagnóstico del desarrollador, no contenido del estudiante: no se enseña en la burbuja, solo en SessionStatus y fuera de producción.

import type { AgentStepResponse } from "./api-client";

/** Nombre en español de cada acción de la lista blanca del backend (B-012.3). */
export const AGENT_ACTION_LABELS: Record<string, string> = {
  wait: "Esperar",
  give_hint: "Dar una pista",
  slow_down: "Bajar el tempo",
  demonstrate: "Demostración",
  accompany: "Acompañar",
  return_control: "Devolver el control",
};

/** Nombre legible de cada proveedor que puede proponer una acción (B-012.6). */
const PROVIDER_LABELS: Record<string, string> = {
  deterministic: "reglas deterministas",
  mock: "proveedor simulado",
  groq: "Groq",
  gemini: "Gemini",
  opencode: "OpenCode",
};

/** Proveedores que son reglas fijas: nunca hay fallback que señalar. */
const RULE_BASED_PROVIDERS = new Set(["deterministic", "mock"]);

/**
 * Mensaje de la pista para el alumno: la acción ya traducida y el motivo que
 * dio el agente. Si el motivo viene vacío, se queda solo con la acción.
 * La procedencia (`provider`/`used_fallback`) es diagnóstico, no contenido del
 * alumno, así que no se enseña aquí.
 */
export function hintMessage(step: AgentStepResponse): string {
  const label = AGENT_ACTION_LABELS[step.action] ?? step.action;
  const reason = step.reason.trim();
  return reason ? `${label}: ${reason}` : label;
}

/**
 * Quién propuso la última pista, para la línea de diagnóstico del estado de
 * sesión: «Groq», «reglas deterministas» o «Groq → reglas deterministas»
 * cuando el LLM no valió y hubo que volver a las reglas (B-012.6).
 */
export function providerLabel(
  step: Pick<AgentStepResponse, "provider" | "used_fallback">,
): string {
  const name = PROVIDER_LABELS[step.provider] ?? step.provider;
  const fellBack =
    step.used_fallback && !RULE_BASED_PROVIDERS.has(step.provider);
  return fellBack ? `${name} → reglas deterministas` : name;
}
