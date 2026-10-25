// description: Botón que pide el siguiente paso del agente y muestra la propuesta validada.
// context: B-012.6; solo pide y enseña la propuesta (action + motivo + procedencia). La ejecución de la acción sigue siendo un paso aparte (POST /sessions/{id}/actions, B-012.4).

"use client";

import { useState } from "react";

import { ApiError, runAgentStep, type AgentStepResponse } from "../../lib/api-client";
import styles from "./AgentStepPanel.module.css";
import type { AgentStepPanelProps } from "./AgentStepPanel.types";

/** Nombre legible de cada acción de la lista blanca. */
const ACTION_LABELS: Record<string, string> = {
  wait: "Esperar",
  give_hint: "Dar una pista",
  slow_down: "Bajar el tempo",
  demonstrate: "Demostración",
  accompany: "Acompañar",
  return_control: "Devolver el control",
};

/** Nombre legible de cada proveedor que puede proponer. */
const PROVIDER_LABELS: Record<string, string> = {
  deterministic: "reglas deterministas",
  mock: "proveedor simulado",
  groq: "Groq",
  gemini: "Gemini",
};

function describeProvider(step: AgentStepResponse): string {
  const name = PROVIDER_LABELS[step.provider] ?? step.provider;
  // `used_fallback` es true cuando el LLM no valió y hubo que volver a las reglas.
  return step.used_fallback && step.provider !== "deterministic" ? `${name} → reglas` : name;
}

export function AgentStepPanel({ sessionId }: AgentStepPanelProps) {
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<AgentStepResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleStep(): Promise<void> {
    if (sessionId === null || busy) return;
    setBusy(true);
    setError(null);
    try {
      setProposal(await runAgentStep(sessionId));
    } catch (exc) {
      setProposal(null);
      setError(
        exc instanceof ApiError
          ? exc.message
          : "No se pudo pedir el paso del agente. Inténtalo de nuevo.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (sessionId === null) return null;

  const label = proposal === null ? null : (ACTION_LABELS[proposal.action] ?? proposal.action);

  return (
    <section className={styles.panel} aria-label="Paso del agente">
      <h3 className={styles.heading}>Paso del agente</h3>

      <button
        className={styles.button}
        type="button"
        onClick={handleStep}
        disabled={busy}
        aria-busy={busy}
      >
        {busy ? "Pensando…" : "Pedir paso al agente"}
      </button>

      {proposal !== null && (
        <p className={styles.proposal} role="status">
          <strong className={styles.action}>{label}</strong>
          {proposal.reason.trim().length > 0 && (
            <span className={styles.reason}>{proposal.reason}</span>
          )}
          <span className={styles.provider}>{describeProvider(proposal)}</span>
        </p>
      )}

      {error !== null && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
