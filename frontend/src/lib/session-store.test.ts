// description: Tests del almacén de la sesión activa: publicar, suscribirse, limpiar y el aviso cuando solo cambia la acción del agente o la procedencia.
// context: Criterio de la reposición de la práctica sobre la portada y de B-012.5; sin DOM: se prueba la decisión del almacén, no el pintado del mini cuadro.

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearSession,
  EMPTY_SESSION,
  getSessionSnapshot,
  subscribeSession,
  updateSession,
} from "./session-store";
import type { SessionSnapshot } from "./session-store";
import type { SessionState } from "./api-client";
import type { AgentActionMessage } from "./websocket-client";

const STATE: SessionState = {
  session_id: "s-1",
  piece_id: "p01",
  status: "idle",
  control: "student",
  current_measure: null,
  position_s: 0,
};

const DEMONSTRATE: AgentActionMessage = {
  type: "agent_action",
  action: "demonstrate",
  from_measure: 0,
  to_measure: 4,
  tempo_factor: 0.7,
};

beforeEach(() => {
  clearSession();
});

describe("session-store", () => {
  it("arranca (y vuelve a estar) vacío", () => {
    expect(getSessionSnapshot()).toEqual(EMPTY_SESSION);
  });

  it("updateSession aplica el parche y conserva el resto de la foto", () => {
    updateSession({ sessionId: "s-1" });
    updateSession({ state: STATE, connection: "open" });

    expect(getSessionSnapshot()).toEqual({
      sessionId: "s-1",
      state: STATE,
      connection: "open",
      error: null,
      agentAction: null,
      lastStep: null,
    });
  });

  it("avisa también cuando solo cambia la acción del agente (B-012.5)", () => {
    updateSession({ sessionId: "s-1" });
    const listener = vi.fn();
    subscribeSession(listener);

    updateSession({ agentAction: DEMONSTRATE });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(getSessionSnapshot().agentAction).toEqual(DEMONSTRATE);

    // Devolver el control también es un cambio que los suscriptores deben ver.
    updateSession({ agentAction: { type: "agent_action", action: "return_control" } });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(getSessionSnapshot().agentAction?.action).toBe("return_control");
  });

  it("avisa también cuando solo cambia la procedencia de la última pista", () => {
    updateSession({ sessionId: "s-1" });
    const listener = vi.fn();
    subscribeSession(listener);

    updateSession({ lastStep: { provider: "groq", used_fallback: false } });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(getSessionSnapshot().lastStep).toEqual({ provider: "groq", used_fallback: false });
  });

  it("avisa a los suscriptores con la foto nueva", () => {
    const listener = vi.fn();
    subscribeSession(listener);

    updateSession({ sessionId: "s-1" });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(getSessionSnapshot().sessionId).toBe("s-1");
  });

  it("si el parche no cambia nada, no avisa a nadie", () => {
    updateSession({ sessionId: "s-1" });
    const listener = vi.fn();
    subscribeSession(listener);

    updateSession({ sessionId: "s-1" });

    expect(listener).not.toHaveBeenCalled();
  });

  it("al desuscribirse deja de recibir avisos", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSession(listener);
    unsubscribe();

    updateSession({ sessionId: "s-1" });

    expect(listener).not.toHaveBeenCalled();
  });

  it("la foto que ya vio un suscriptor no cambia por debajo (inmutable)", () => {
    const seen: SessionSnapshot[] = [];
    subscribeSession(() => seen.push(getSessionSnapshot()));

    updateSession({ sessionId: "s-1" });
    const first = seen[0];
    updateSession({ connection: "open" });

    expect(first.sessionId).toBe("s-1");
    expect(first.connection).toBe("closed");
    expect(getSessionSnapshot().connection).toBe("open");
  });

  it("clearSession limpia todo, como al salir de la ruta de práctica", () => {
    updateSession({ sessionId: "s-1", state: STATE, connection: "open", error: "algo" });

    clearSession();

    expect(getSessionSnapshot()).toEqual(EMPTY_SESSION);
  });
});
