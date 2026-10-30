// description: Tests del canal de reproducción del agente (B-012.5/B-012.7): entrega con contador creciente, baja de suscriptores, publicación sin nadie escuchando y órdenes de acompañamiento.
// context: PlaybackArea es el único suscriptor real; aquí se comprueba el contrato del canal sin DOM.

import { afterEach, describe, expect, it, vi } from "vitest";

import { publishAgentPlayback, subscribeAgentPlayback } from "./agent-playback";
import type { AgentPlaybackMessage } from "./agent-playback";
import type { AccompanyPlan } from "./agent-accompany";

const PLAN: AccompanyPlan = {
  hand: "left",
  studentHand: "right",
  fromMeasure: 0,
  toMeasure: 2,
  tempoFactor: 0.9,
  from_s: 4,
  duration_s: 4,
  notes: [
    {
      pitch: 48,
      start_seconds: 4,
      duration_seconds: 2,
      velocity: 60,
      channel: 0,
      track: 0,
    },
  ],
};

/** Suscripciones vivas: se dan de baja tras cada test para no cruzarlas. */
const pendingUnsubs: (() => void)[] = [];

afterEach(() => {
  while (pendingUnsubs.length > 0) pendingUnsubs.pop()?.();
});

function subscribe(listener: (message: AgentPlaybackMessage) => void): void {
  pendingUnsubs.push(subscribeAgentPlayback(listener));
}

describe("canal de reproducción del agente", () => {
  it("entrega las órdenes con su contador creciente", () => {
    const seen: { kind: string; seq: number }[] = [];
    subscribe((message) => seen.push({ kind: message.event.kind, seq: message.seq }));

    publishAgentPlayback({
      kind: "demo",
      pieceId: "p16",
      window: { fromMeasure: 0, toMeasure: 4, tempoFactor: 0.7 },
    });
    publishAgentPlayback({ kind: "accompany", pieceId: "p16", plan: PLAN });
    publishAgentPlayback({ kind: "stop" });

    expect(seen.map((entry) => entry.kind)).toEqual(["demo", "accompany", "stop"]);
    // Dos intervenciones seguidas nunca son "la misma": el contador solo sube.
    expect(seen[1].seq).toBeGreaterThan(seen[0].seq);
    expect(seen[2].seq).toBeGreaterThan(seen[1].seq);
  });

  it("el acompañamiento viaja con su plan (mano, sección y notas)", () => {
    const seen: AgentPlaybackMessage[] = [];
    subscribe((message) => seen.push(message));

    publishAgentPlayback({ kind: "accompany", pieceId: "p16", plan: PLAN });

    const event = seen[0].event;
    expect(event.kind).toBe("accompany");
    if (event.kind !== "accompany") throw new Error("se esperaba acompañamiento");
    expect(event.plan.hand).toBe("left");
    expect(event.plan.studentHand).toBe("right");
    expect(event.plan.notes[0].start_seconds).toBe(4);
  });

  it("quien se da de baja deja de recibir órdenes", () => {
    const fuera = vi.fn();
    const fueraAlta = subscribeAgentPlayback(fuera);
    const dentro = vi.fn();
    subscribe(dentro);

    fueraAlta();
    publishAgentPlayback({ kind: "stop" });

    expect(fuera).not.toHaveBeenCalled();
    expect(dentro).toHaveBeenCalledTimes(1);
  });

  it("sin suscritos no revienta (es un evento, no un estado)", () => {
    expect(() => publishAgentPlayback({ kind: "stop" })).not.toThrow();
  });
});
