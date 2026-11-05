// description: Tests del feed informativo del chat (B-032.10): bordes de `inform` (duplicado consecutivo, tope del buffer, suscripción), textos deterministas del aula y vaciado.
// context: Módulo igual de puro que el resto de los almacenes, así que el test no toca DOM: la misma señal produce siempre la misma frase y el buffer corto evita que la burbuja se vuelva un log de sistema (skill piano-mentor-chat-burbuja, principios 4 y 5).

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAX_FEED_LINES,
  clearChatFeed,
  getChatFeedSnapshot,
  inform,
  modeText,
  playingText,
  practiceOpeningText,
  pausedText,
  sessionClosedText,
  stoppedText,
  subscribeChatFeed,
} from "./chat-feed";

describe("chat-feed", () => {
  beforeEach(() => {
    clearChatFeed();
  });

  it("inform añade líneas con id monotónico y avisa a los suscriptores", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeChatFeed(listener);

    inform("uno");
    inform("dos");

    expect(getChatFeedSnapshot().map((line) => line.text)).toEqual(["uno", "dos"]);
    expect(listener).toHaveBeenCalledTimes(2);
    const [first, second] = getChatFeedSnapshot();
    expect(second.id).toBeGreaterThan(first.id);
    unsubscribe();
  });

  it("la misma frase dos veces seguidas no repite línea ni avisa (anti-ruido)", () => {
    const listener = vi.fn();
    subscribeChatFeed(listener);

    inform(playingText("Pieza"));
    inform(playingText("Pieza"));
    inform(pausedText());
    inform(pausedText());

    expect(getChatFeedSnapshot().map((line) => line.text)).toEqual([
      playingText("Pieza"),
      pausedText(),
    ]);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("dos señales distintas que escriben la misma frase tampoco se duplican", () => {
    inform("Pausado");
    inform("Pausado");
    expect(getChatFeedSnapshot()).toHaveLength(1);
  });

  it("el buffer corto solo guarda las últimas líneas", () => {
    for (let i = 1; i <= MAX_FEED_LINES + 2; i += 1) {
      inform(`señal ${i}`);
    }
    const snapshot = getChatFeedSnapshot();
    expect(snapshot).toHaveLength(MAX_FEED_LINES);
    expect(snapshot[0].text).toBe("señal 3");
    expect(snapshot[snapshot.length - 1].text).toBe(`señal ${MAX_FEED_LINES + 2}`);
    // Los ids conservan el orden de llegada aunque las viejas se descarten.
    for (let i = 1; i < snapshot.length; i += 1) {
      expect(snapshot[i].id).toBeGreaterThan(snapshot[i - 1].id);
    }
  });

  it("la baja deja de recibir avisos", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeChatFeed(listener);
    unsubscribe();

    inform("solo para quien escucha");

    expect(listener).not.toHaveBeenCalled();
  });

  it("la fotografía no cambia de ref si `inform` decide no añadir nada", () => {
    inform("uno");
    const before = getChatFeedSnapshot();
    inform("uno");
    expect(getChatFeedSnapshot()).toBe(before);
  });

  it("clearChatFeed avisa y deja la fotografía vacía", () => {
    const listener = vi.fn();
    subscribeChatFeed(listener);
    inform("uno");

    clearChatFeed();

    expect(getChatFeedSnapshot()).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe("textos del feed (deterministas)", () => {
  it("la apertura de la práctica nombra la pieza", () => {
    expect(practiceOpeningText("Pieza de práctica")).toBe(
      "Te llevo al piano para practicar Pieza de práctica",
    );
  });

  it("reproduciendo nombra la pieza; los demás son cortos", () => {
    expect(playingText("Minuet")).toBe("Reproduciendo Minuet");
    expect(pausedText()).toBe("Pausado");
    expect(stoppedText()).toBe("Parado: te espero donde quieras");
    expect(sessionClosedText()).toBe(
      "Cerramos esta práctica: aquí te espero para la siguiente",
    );
  });

  it("el modo cuenta qué suena y qué practica, siempre la misma frase", () => {
    expect(modeText("observe", "right")).toBe("Observa cómo suena: el piano toca solo");
    expect(modeText("one_hand", "left")).toBe(
      "Suena la mano derecha, tú practicas la izquierda: te espero en la primera nota",
    );
    expect(modeText("one_hand", "right")).toBe(
      "Suena la mano izquierda, tú practicas la derecha: te espero en la primera nota",
    );
    expect(modeText("both_hands", "left")).toBe("El piano calla: las dos manos son tuyas");
  });
});
