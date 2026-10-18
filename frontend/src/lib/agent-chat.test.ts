// description: Tests de la lógica de presentación del chat: tope, tamaño dinámico y escritura.
// context: Criterio de B-012.8 bloque C; sin DOM, puro.

import { describe, expect, it } from "vitest";

import {
  CHAT_TYPING_MAX_MS,
  CHAT_TYPING_MS,
  chatFontSize,
  isTyping,
  typedSlice,
  typingStep,
} from "./agent-chat";

describe("chatFontSize", () => {
  it("usa texto grande en mensajes cortos", () => {
    expect(chatFontSize("Pausando la reproducción.")).toBe("lg");
  });

  it("usa texto normal en mensajes medianos", () => {
    expect(chatFontSize("Cargando el Minueto en Sol de Bach en el piano.")).toBe("md");
  });

  it("usa texto pequeño en mensajes largos", () => {
    expect(chatFontSize("x".repeat(130))).toBe("sm");
  });

  it("un texto vacío cuenta como corto", () => {
    expect(chatFontSize("")).toBe("lg");
    expect(chatFontSize("   ")).toBe("lg");
  });
});

describe("typingStep", () => {
  it("revela carácter a carácter en respuestas cortas", () => {
    expect(typingStep(10)).toBe(1);
  });

  it("revela en bloques cuando la respuesta es larga", () => {
    // Una respuesta de 1400 caracteres debe revelarse en bloques para no
    // exceder la duración máxima del efecto.
    const paso = typingStep(1400);
    expect(paso).toBeGreaterThan(1);
    // El número de pasos no debe superar holgadamente el tope de duración.
    const pasos = Math.ceil(1400 / paso);
    const duracionMs = pasos * CHAT_TYPING_MS;
    expect(duracionMs).toBeLessThanOrEqual(CHAT_TYPING_MAX_MS + CHAT_TYPING_MS);
  });

  it("nunca devuelve 0 aunque el texto esté vacío", () => {
    expect(typingStep(0)).toBe(1);
    expect(typingStep(-5)).toBe(1);
  });

  it("nunca revela más caracteres que el propio largo", () => {
    expect(typingStep(3)).toBeLessThanOrEqual(3);
  });
});

describe("typedSlice", () => {
  const texto = "Pausando la reproducción.";

  it("revela de izquierda a derecha", () => {
    expect(typedSlice(texto, 7)).toBe("Pausand");
  });

  it("con 0 devuelve vacío", () => {
    expect(typedSlice(texto, 0)).toBe("");
  });

  it("con índice negativo devuelve vacío", () => {
    expect(typedSlice(texto, -5)).toBe("");
  });

  it("con índice mayor que el texto devuelve el texto completo", () => {
    expect(typedSlice(texto, 999)).toBe(texto);
  });
});

describe("isTyping", () => {
  const texto = "hola";

  it("es true mientras quede texto por revelar", () => {
    expect(isTyping(texto, 2)).toBe(true);
  });

  it("es false al revelar el último carácter", () => {
    expect(isTyping(texto, 4)).toBe(false);
  });

  it("es false si el índice sobrepasa el texto", () => {
    expect(isTyping(texto, 10)).toBe(false);
  });
});
