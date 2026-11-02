// description: Tests de la oferta de demostración (B-032.7): la oferta pendiente del sobre, la pregunta determinista por compás/rango/pieza, la ventana reutilizada sin recalcular y la etiqueta del mini cuadro.
// context: Módulo puro sin DOM; la misma señal produce siempre la misma frase (feed determinista, B-032.10).
import { describe, expect, it } from "vitest";

import type { AgentActionMessage } from "./websocket-client";
import { isPendingOffer, offerDemoWindow, offerLabel, offerMeasure, offerMessage } from "./agent-offer";

const OFFER = (params: Record<string, number | undefined>): AgentActionMessage =>
  ({ type: "agent_action", action: "offer_demo", ...params });

describe("isPendingOffer", () => {
  it("solo la acción offer_demo es una oferta pendiente", () => {
    expect(isPendingOffer(OFFER({ from_measure: 2 }))).toBe(true);
    expect(isPendingOffer({ type: "agent_action", action: "demonstrate" })).toBe(false);
    expect(isPendingOffer({ type: "agent_action", action: "offer_dismiss" })).toBe(false);
    expect(isPendingOffer(null)).toBe(false);
  });
});

describe("offerMeasure", () => {
  it("devuelve el compás ofertado cuando la sección es un compás único", () => {
    expect(offerMeasure(OFFER({ from_measure: 2, to_measure: 2 }))).toBe(2);
  });

  it("un rango, un compás ausente o params sin sentido no definen compás", () => {
    expect(offerMeasure(OFFER({ from_measure: 2, to_measure: 5 }))).toBeNull();
    expect(offerMeasure(OFFER({}))).toBeNull();
    expect(offerMeasure(OFFER({ from_measure: Number.NaN }))).toBeNull();
  });

  it("sin oferta no hay compás", () => {
    expect(offerMeasure({ type: "agent_action", action: "slow_down" })).toBeNull();
  });
});

describe("offerMessage", () => {
  it("una señal produce siempre la misma frase (1-based, como en pantalla)", () => {
    const offer = OFFER({ from_measure: 2, to_measure: 2 });
    expect(offerMessage(offer)).toBe("¿Te muestro el compás 3?");
    expect(offerMessage(offer)).toBe(offerMessage(offer));
  });

  it("un rango o la pieza entera tiene su frase propia", () => {
    expect(offerMessage(OFFER({ from_measure: 0, to_measure: 3 }))).toBe("¿Te muestro estos compases?");
    expect(offerMessage(OFFER({}))).toBe("¿Te muestro la pieza?");
  });

  it("sin oferta no hay pregunta", () => {
    expect(offerMessage(null)).toBe("¿Te muestro la pieza?");
  });
});

describe("offerDemoWindow", () => {
  it("reutiliza los parámetros ofrecidos sin recalcular nada", () => {
    expect(offerDemoWindow(OFFER({ from_measure: 4, to_measure: 4, tempo_factor: 0.8 }))).toEqual({
      from_measure: 4,
      to_measure: 4,
      tempo_factor: 0.8,
    });
    expect(offerDemoWindow(null)).toEqual({
      from_measure: undefined,
      to_measure: undefined,
      tempo_factor: undefined,
    });
  });
});

describe("offerLabel", () => {
  it("nombra el compás cuando lo hay y queda genérica sin él", () => {
    expect(offerLabel(OFFER({ from_measure: 1, to_measure: 1 }))).toBe(
      "El mentor pregunta si te muestra el compás 2",
    );
    expect(offerLabel(OFFER({}))).toBe("El mentor pregunta si te muestra cómo se toca");
  });
});
