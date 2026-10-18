// description: Tests de la lógica del chat: un turno completo (envío, respuesta, orden, error)
// y la presentación de la burbuja (tamaño dinámico y escritura).
// context: Criterio de B-012.8 bloque C; sin DOM, puro. Las dependencias de red y de
// navegador llegan inyectadas, así que el turno se prueba entero con fakes.

import { describe, expect, it, vi } from "vitest";

import {
  CHAT_FALLBACK_REPLY,
  CHAT_TYPING_MAX_MS,
  CHAT_TYPING_MS,
  chatFontSize,
  isTyping,
  runChatTurn,
  typedSlice,
  typingStep,
  type ChatTurnDeps,
} from "./agent-chat";
import { ApiError, type AgentChatResponse } from "./api-client";

/** Respuesta del backend para los tests de turno. */
function respuesta(overrides: Partial<AgentChatResponse> = {}): AgentChatResponse {
  return {
    chat_id: "chat-1",
    reply: "Reproduciendo el Minueto en Sol.",
    provider: "groq",
    used_fallback: false,
    client_action: null,
    used_tools: [],
    ...overrides,
  };
}

/** Dependencias de un turno con fakes; `overrides` cambia solo lo que interesa. */
function makeDeps(overrides: Partial<ChatTurnDeps> = {}): ChatTurnDeps {
  return {
    send: vi.fn(async () => respuesta()),
    executeAction: vi.fn(async () => true),
    ...overrides,
  };
}

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

describe("runChatTurn", () => {
  it("manda el mensaje con la conversación y el contexto de la página", async () => {
    const deps = makeDeps();

    await runChatTurn(
      { message: "hola", chatId: "chat-0", context: { page: "/library" } },
      deps,
    );

    expect(deps.send).toHaveBeenCalledWith({
      message: "hola",
      chat_id: "chat-0",
      context: { page: "/library" },
    });
  });

  it("devuelve la respuesta y el chat_id para el siguiente turno", async () => {
    const deps = makeDeps();

    const outcome = await runChatTurn(
      { message: "hola", chatId: null, context: null },
      deps,
    );

    expect(outcome).toEqual({
      chatId: "chat-1",
      reply: "Reproduciendo el Minueto en Sol.",
      actionTaken: false,
      error: null,
    });
  });

  it("ejecuta la orden que el backend devuelve en client_action", async () => {
    const accion = { name: "reproducir_pieza", arguments: { piece_id: "p01" } };
    const deps = makeDeps({
      send: vi.fn(async () => respuesta({ client_action: accion })),
    });

    const outcome = await runChatTurn({ message: "reproduce el minueto", chatId: null, context: null }, deps);

    expect(deps.executeAction).toHaveBeenCalledWith(accion);
    expect(outcome.actionTaken).toBe(true);
    // La respuesta se enseña aunque haya orden: el usuario también lee el porqué.
    expect(outcome.reply).toBe("Reproduciendo el Minueto en Sol.");
    expect(outcome.error).toBeNull();
  });

  it("no llama a la ejecución cuando no hay orden", async () => {
    const deps = makeDeps();

    const outcome = await runChatTurn({ message: "gracias", chatId: null, context: null }, deps);

    expect(deps.executeAction).not.toHaveBeenCalled();
    expect(outcome.actionTaken).toBe(false);
  });

  it("un fallo de red deja la burbuja con el aviso y el error aparte", async () => {
    const deps = makeDeps({
      send: vi.fn(async () => {
        throw new ApiError("network_error", "No se pudo conectar con el servicio.");
      }),
    });

    const outcome = await runChatTurn({ message: "hola", chatId: "chat-0", context: null }, deps);

    expect(outcome.reply).toBe(CHAT_FALLBACK_REPLY);
    expect(outcome.error).toBe("No se pudo conectar con el servicio.");
    // Sin respuesta no hay turno nuevo: el chat_id anterior sigue valiendo.
    expect(outcome.chatId).toBeNull();
    expect(deps.executeAction).not.toHaveBeenCalled();
  });

  it("un fallo sin mensaje legible cae en el aviso genérico", async () => {
    const deps = makeDeps({
      send: vi.fn(async () => {
        throw "algo raro";
      }),
    });

    const outcome = await runChatTurn({ message: "hola", chatId: null, context: null }, deps);

    expect(outcome.error).toBe("No se pudo enviar el mensaje.");
  });

  it("si la orden falla, la respuesta se conserva y el fallo se cuenta aparte", async () => {
    const deps = makeDeps({
      send: vi.fn(async () =>
        respuesta({
          client_action: { name: "abrir_practica", arguments: { piece_id: "nope" } },
        }),
      ),
      executeAction: vi.fn(async () => {
        throw new Error("piece_not_found: la pieza no está en el catálogo.");
      }),
    });

    const outcome = await runChatTurn({ message: "abre la práctica", chatId: null, context: null }, deps);

    expect(outcome.reply).toBe("Reproduciendo el Minueto en Sol.");
    expect(outcome.error).toBe("piece_not_found: la pieza no está en el catálogo.");
    expect(outcome.actionTaken).toBe(false);
    // El turno sí ocurrió en el backend, así que el chat_id se guarda.
    expect(outcome.chatId).toBe("chat-1");
  });

  it("si la orden se ejecuta sin efecto, no hay error", async () => {
    const deps = makeDeps({
      send: vi.fn(async () =>
        respuesta({ client_action: { name: "accion_rara", arguments: {} } }),
      ),
      executeAction: vi.fn(async () => false),
    });

    const outcome = await runChatTurn({ message: "hola", chatId: null, context: null }, deps);

    expect(outcome.actionTaken).toBe(false);
    expect(outcome.error).toBeNull();
  });
});
