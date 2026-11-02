// description: Tests del mensaje de espera de la burbuja del mentor (B-032.7/U-008.3): prompt de práctica dentro de la sesión, bienvenida personal solo fuera y con nombre, y el genérico como pieza de reserva.
// context: Módulo puro sin DOM; los tres mensajes son fijos (feed determinista, no los compone el LLM).
import { describe, expect, it } from "vitest";

import { chatPrompt, personalWelcome, SESSION_PROMPT } from "./chat-prompt";

const BASE = { userName: null, hasChat: false, exampleMessage: "Hola En que puedo Ayudarte?" };

describe("chatPrompt", () => {
  it("dentro de una sesión habla de la práctica, nunca saluda", () => {
    expect(chatPrompt({ ...BASE, sessionId: "s1" })).toBe(SESSION_PROMPT);
    expect(chatPrompt({ ...BASE, sessionId: "s1", userName: "Andrés" })).toBe(SESSION_PROMPT);
    expect(chatPrompt({ ...BASE, sessionId: "s1", hasChat: true })).toBe(SESSION_PROMPT);
    expect(SESSION_PROMPT).not.toContain("!Hola");
  });

  it("fuera de sesión saluda por el nombre mientras no haya conversación", () => {
    expect(chatPrompt({ ...BASE, sessionId: null, userName: "Andrés" })).toBe(
      personalWelcome("Andrés"),
    );
    expect(chatPrompt({ ...BASE, sessionId: null, userName: "Andrés" })).toContain("¡Hola Andrés!");
  });

  it("con conversación previa (o sin nombre) cae al placeholder genérico", () => {
    expect(chatPrompt({ ...BASE, sessionId: null, userName: null })).toBe(
      "Hola En que puedo Ayudarte?",
    );
    expect(chatPrompt({ ...BASE, sessionId: null, userName: "Andrés", hasChat: true })).toBe(
      "Hola En que puedo Ayudarte?",
    );
  });

  it("la bienvenida personal une el nombre con el prompt del profesor", () => {
    expect(personalWelcome("Andrés")).toContain("Andrés");
    expect(personalWelcome("Andrés")).toContain("práctica, piezas o teoría musical");
  });
});
