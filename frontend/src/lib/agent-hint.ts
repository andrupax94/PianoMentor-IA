// description: Traducción de la propuesta del agente a un mensaje para el alumno: AGENT_ACTION_LABELS con la etiqueta en español de cada acción de la lista blanca (incluidas offer_demo, offer_dismiss y repeat_demo de B-032.7) y hintMessage, que une la etiqueta con el motivo y omite la procedencia (provider/used_fallback); incluye providerLabel, la etiqueta de quién propuso (Groq, Gemini, reglas…) que solo se usa en la línea de diagnóstico del estado de sesión fuera de producción.
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
  // B-032.7: la demostración se ofrece y la repite el alumno, no el bucle.
  offer_demo: "Ofrece una demostración",
  offer_dismiss: "Seguir tú",
  repeat_demo: "Repetir la demostración",
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
/**
 * Motivos internos que emiten las reglas deterministas y el MockProvider: son
 * códigos, no mensajes para el alumno, y no deben filtrarse a la burbuja
 * (skill piano-mentor-chat-burbuja, principio 4: determinista, sin códigos).
 */
const INTERNAL_REASONS = new Set<string>([
  "demo_period_ended",
  "agent_has_control",
  "student_silent",
  "low_precision",
  "repeated_errors",
  "timing_off",
  "all_good",
  "mock_agent_control",
  "mock_student_silent",
  "mock_low_precision",
  "mock_repeated_errors",
  "mock_timing_off",
  "mock_all_good",
]);

/**
 * True si `reason` es un código interno (sin espacios) o un motivo de las
 * reglas/Mock, no un mensaje para el alumno.
 */
function isInternalReason(reason: string): boolean {
  if (!reason) return true;
  if (INTERNAL_REASONS.has(reason)) return true;
  if (reason.startsWith("mock_") || reason.startsWith("gate_")) return true;
  return false;
}

export function hintMessage(step: AgentStepResponse): string {
  const label = AGENT_ACTION_LABELS[step.action] ?? step.action;
  const reason = step.reason.trim();
  if (isInternalReason(reason)) {
    // Sin mensaje para el alumno, la etiqueta sola es la pista.
    return label;
  }
  // La pista (give_hint) se muestra sin el prefijo «Dar una pista:»: solo el
  // mensaje del mentor. El resto de acciones conservan la etiqueta para dar
  // contexto («Bajar el tempo: …», «Demostración: …»).
  if (step.action === "give_hint") {
    return reason;
  }
  return `${label}: ${reason}`;
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
