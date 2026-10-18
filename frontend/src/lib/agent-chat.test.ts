// description: Tests de la lógica de presentación del chat: tope, tamaño dinámico y escritura.
// context: Criterio de B-012.8 bloque C; sin DOM, puro.

import { describe, expect, it } from "vitest";

import {
  CHAT_REPLY_MAX_CHARS,
  chatFontSize,
  clampReply,
  isTyping,
  typedSlice,
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

describe("clampReply", () => {
  it("deja pasar un texto por debajo del tope", () => {
    expect(clampReply("Hola")).toBe("Hola");
  });

  it("recorta por encima del tope y añade puntos suspensivos", () => {
    const largo = "y".repeat(200);
    const recortado = clampReply(largo);
    expect(recortado.length).toBeLessThanOrEqual(CHAT_REPLY_MAX_CHARS);
    expect(recortado.endsWith("…")).toBe(true);
  });

  it("respeta un tope personalizado", () => {
    expect(clampReply("abcdef", 4)).toBe("abc…");
  });

  it("recorta espacios finales antes de los puntos", () => {
    // Tras quitar los espacios el texto sigue desbordando, así que sí hay puntos.
    expect(clampReply("abcdef   ", 4)).toBe("abc…");
  });

  it("no añade puntos si tras recortar espacios el texto cabe", () => {
    expect(clampReply("abc   ", 4)).toBe("abc");
  });

  it("nunca excede el tope ni con un tope de 1", () => {
    expect(clampReply("abc", 1).length).toBe(1);
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
