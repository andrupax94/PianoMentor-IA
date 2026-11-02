// description: Tests del mensaje de espera de la burbuja del mentor (U-008.3): con usuario activo saluda por su nombre y sin él cae al placeholder genérico; nada depende de la sesión de piano.
// context: Módulo puro sin DOM; los dos mensajes son fijos (feed determinista, no los compone el LLM).
import { describe, expect, it } from "vitest";

import { chatPrompt, personalWelcome } from "./chat-prompt";

const EXAMPLE = "Hola En que puedo Ayudarte?";

describe("chatPrompt", () => {
  it("con usuario activo saluda por su nombre en lugar del genérico", () => {
    expect(chatPrompt({ userName: "Andrés", exampleMessage: EXAMPLE })).toBe(
      personalWelcome("Andrés"),
    );
    expect(chatPrompt({ userName: "Andrés", exampleMessage: EXAMPLE })).toContain("¡Hola Andrés!");
    expect(chatPrompt({ userName: "Andrés", exampleMessage: EXAMPLE })).not.toBe(EXAMPLE);
  });

  it("con otro nombre la misma señal produce la misma frase (determinista)", () => {
    expect(chatPrompt({ userName: "Andrés", exampleMessage: EXAMPLE })).toBe(
      chatPrompt({ userName: "Andrés", exampleMessage: EXAMPLE }),
    );
    expect(chatPrompt({ userName: "Debandré", exampleMessage: EXAMPLE })).toBe(
      personalWelcome("Debandré"),
    );
  });

  it("sin usuario activo cae al placeholder genérico de la prop", () => {
    expect(chatPrompt({ userName: null, exampleMessage: EXAMPLE })).toBe(EXAMPLE);
  });
});
