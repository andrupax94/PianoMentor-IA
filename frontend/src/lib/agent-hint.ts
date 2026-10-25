// description: Traducción de la propuesta del agente a un mensaje para el alumno: AGENT_ACTION_LABELS con la etiqueta en español de cada acción de la lista blanca y hintMessage, que une la etiqueta con el motivo y omite la procedencia (provider/used_fallback).
// context: B-012.6; acompaña al chip «Pedir pista al agente» del chat. La procedencia es diagnóstico del desarrollador, no contenido del estudiante, así que no se enseña.

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
