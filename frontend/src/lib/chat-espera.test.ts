// description: Tests de las frases musicales de espera del chat (B-036.2): lista variada y no vacía, rotación en rondas que no repite frase hasta cerrar el ciclo, normalización de índices negativos y absurdos, y el intervalo de rotación fijo.
// context: Puras sin DOM (criterio de la lib): MentorChat las consume con un intervalo que avanza el índice cada INTERVALO_ESPERA_MS y lo limpia al llegar la respuesta.

import { describe, expect, it } from "vitest";

import { FRASES_ESPERA, INTERVALO_ESPERA_MS, fraseDeEspera } from "./chat-espera";

describe("FRASES_ESPERA", () => {
  it("es una lista variada: varias frases, ninguna vacía ni repetida", () => {
    expect(FRASES_ESPERA.length).toBeGreaterThanOrEqual(6);
    for (const frase of FRASES_ESPERA) {
      expect(frase.trim().length).toBeGreaterThan(0);
    }
    expect(new Set(FRASES_ESPERA).size).toBe(FRASES_ESPERA.length);
  });

  it("ninguna frase promete tiempos ni tecnicismos (voz del aula)", () => {
    const prohibidos = ["segundo", "minuto", "token", "api", "429", "retry"];
    for (const frase of FRASES_ESPERA) {
      for (const palabra of prohibidos) {
        expect(frase.toLowerCase()).not.toContain(palabra);
      }
    }
  });
});

describe("fraseDeEspera", () => {
  it("rota en rondas: no repite frase hasta cerrar el ciclo", () => {
    const largo = FRASES_ESPERA.length;
    for (let i = 0; i < largo - 1; i++) {
      expect(fraseDeEspera(i)).not.toBe(fraseDeEspera(i + 1));
    }
    expect(fraseDeEspera(largo)).toBe(fraseDeEspera(0));
  });

  it("normaliza índices negativos y absurdos sin romper", () => {
    expect(fraseDeEspera(-1)).toBe(fraseDeEspera(FRASES_ESPERA.length - 1));
    expect(fraseDeEspera(-FRASES_ESPERA.length)).toBe(fraseDeEspera(0));
    expect(fraseDeEspera(1_000_000)).toBe(fraseDeEspera(1_000_000 % FRASES_ESPERA.length));
    expect(fraseDeEspera(2.7)).toBe(fraseDeEspera(2));
  });

  it("el intervalo de rotación es el de la issue (~2,5 s)", () => {
    expect(INTERVALO_ESPERA_MS).toBeGreaterThanOrEqual(2_000);
    expect(INTERVALO_ESPERA_MS).toBeLessThanOrEqual(3_500);
  });
});
