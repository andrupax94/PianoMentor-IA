// description: Tests del registro del modo depuración (B-033.2): anillo con límite, no-op bajo producción, notificación estable de referencias para useSyncExternalStore y textos de práctica/agente.
// context: B-033.2; puro y sin DOM.

import { describe, expect, it, vi } from "vitest";

import {
  agentActionText,
  clearDebugLog,
  getDebugLogSnapshot,
  getDebugScenarioSnapshot,
  publishDebugLog,
  publishDebugScenario,
  practiceEventText,
  resetDebugLog,
  subscribeDebugLog,
  subscribeDebugScenario,
  type DebugLogEntry,
} from "./practice-debug";
import type { AgentActionMessage } from "./websocket-client";
import type { PracticeEvent } from "./gate-controller";

describe("practice-debug", () => {
  it("publica entradas con orden de llegada y sincroniza a los suscriptores", () => {
    resetDebugLog();
    const listener = vi.fn();
    const unsubscribe = subscribeDebugLog(listener);

    publishDebugLog("scenario", "robot lanzado: mezcla");

    const snapshot = getDebugLogSnapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]).toMatchObject({ id: 1, kind: "scenario", text: "robot lanzado: mezcla" });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it("el anillo descarta las líneas más viejas y respeta el tope (400 desde B-033.5)", () => {
    resetDebugLog();
    for (let index = 0; index < 410; index += 1) {
      publishDebugLog("note", `tecla ${index}`);
    }
    const snapshot = getDebugLogSnapshot();
    expect(snapshot.length).toBeLessThanOrEqual(400);
    expect(snapshot[0]?.text).toBe("tecla 10");
    expect(snapshot[snapshot.length - 1]?.text).toBe("tecla 409");
  });

  it("los cambios del robot notifican y quedan anotados en el registro", () => {
    resetDebugLog();
    const listener = vi.fn();
    const unsubscribe = subscribeDebugScenario(listener);

    publishDebugScenario("siempre_tarde", 3);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getDebugScenarioSnapshot()).toEqual({ scenario: "siempre_tarde", seed: 3 });
    expect(getDebugLogSnapshot().at(-1)?.text).toContain("robot lanzado: siempre_tarde (semilla 3)");

    // Publicar lo mismo no repite (idempotencia).
    publishDebugScenario("siempre_tarde", 3);
    expect(listener).toHaveBeenCalledTimes(1);

    publishDebugScenario(null, null);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(getDebugLogSnapshot().at(-1)?.text).toBe("robot parado");

    unsubscribe();
  });

  it("el texto de práctica traduce el outcome con compás y espera", () => {
    const event: PracticeEvent = { gate: "gate-1.0000", measure: 3, outcome: "timeout", wait_ms: 1000, hand: "left" };
    expect(practiceEventText(event)).toBe("gate gate-1.0000 → vencido · compás 3, espera 1000 ms");
  });

  it("el texto del agente etiqueta cada acción y su regla", () => {
    const base = { type: "agent_action" } as AgentActionMessage;
    expect(agentActionText({ ...base, action: "demonstrate" })).toBe("IA: demostración");
    expect(agentActionText({ ...base, action: "slow_down", tempo_factor: 0.8 })).toBe("IA: tempo lento (×0.8)");
    expect(agentActionText({ ...base, action: "offer_demo", reason: "3 strikes en el compás" })).toBe(
      "IA: oferta de demostración — 3 strikes en el compás",
    );
    expect(agentActionText({ ...base, action: "give_hint", hint_type: "hint_rhythm" })).toBe("IA: pista (hint_rhythm)");
    expect(agentActionText({ ...base, action: "desconocido" })).toBe("IA: desconocido");
  });

  it("resetDebugLog limpia registro y estado (a altura de módulo)", () => {
    publishDebugLog("system", "algo");
    publishDebugScenario("perfecta", null);
    resetDebugLog();
    expect(getDebugLogSnapshot()).toHaveLength(0);
    expect(getDebugScenarioSnapshot()).toEqual({ scenario: null, seed: null });
  });
});

describe("practice-debug en producción", () => {
  it("publish no escribe nada (el menú no existe en prod)", () => {
    resetDebugLog();
    const previous = process.env.NODE_ENV;
    (process.env as { NODE_ENV?: string }).NODE_ENV = "production";
    publishDebugLog("system", "esto no debe verse");
    publishDebugScenario("perfecta", 1);
    (process.env as { NODE_ENV?: string }).NODE_ENV = previous;
    expect(getDebugLogSnapshot()).toHaveLength(0);
    expect(getDebugScenarioSnapshot()).toEqual({ scenario: null, seed: null });
  });
});
