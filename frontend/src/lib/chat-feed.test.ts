// description: Tests del feed informativo del chat (B-032.10): la semántica de burbuja que pide el usuario (inform(texto) limpia y muestra solo ese, inform(texto, 3) apila hasta tres FIFO), anti-duplicado consecutivo, suscripción y textos deterministas del aula.
// context: Módulo igual de puro que el resto de los almacenes, así que el test no toca DOM: la misma señal produce siempre la misma frase y la pila corta evita que la burbuja se vuelva un log de sistema (skill piano-mentor-chat-burbuja, principios 4 y 5).

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAX_FEED_LINES,
  clearChatFeed,
  getChatFeedSnapshot,
  inform,
  modeText,
  pausedText,
  playingText,
  practiceOpeningText,
  sessionClosedText,
  stoppedText,
  subscribeChatFeed,
} from "./chat-feed";

describe("chat-feed", () => {
  beforeEach(() => {
    clearChatFeed();
  });

  it("inform sin capacidad limpia la pila y muestra solo el mensaje", () => {
    inform(playingText("Pieza"), MAX_FEED_LINES);
    expect(getChatFeedSnapshot().map((line) => line.text)).toEqual([playingText("Pieza")]);

    inform(pausedText());
    expect(getChatFeedSnapshot().map((line) => line.text)).toEqual([pausedText()]);
  });

  it("inform con capacidad apila mensajes nuevos debajo del viejo", () => {
    inform("uno", 3);
    inform("dos", 3);

    const snapshot = getChatFeedSnapshot();
    expect(snapshot.map((line) => line.text)).toEqual(["uno", "dos"]);
    expect(snapshot[0].id).toBeLessThan(snapshot[1].id);
  });

  it("con la pila llena el primero que entró es el primero que cae (FIFO)", () => {
    inform("uno", MAX_FEED_LINES);
    inform("dos", MAX_FEED_LINES);
    inform("tres", MAX_FEED_LINES);
    inform("cuatro", MAX_FEED_LINES);

    expect(getChatFeedSnapshot().map((line) => line.text)).toEqual([
      "dos",
      "tres",
      "cuatro",
    ]);
  });

  it("la capacidad se acota al tope por convención (MAX_FEED_LINES)", () => {
    inform("uno", 99);
    inform("dos", 99);
    inform("tres", 99);
    inform("cuatro", 99);

    expect(getChatFeedSnapshot()).toHaveLength(MAX_FEED_LINES);
  });

  it("una capacidad menor recorta también la pila que ya había", () => {
    inform("uno", MAX_FEED_LINES);
    inform("dos", MAX_FEED_LINES);
    inform("tres", 2);
    inform("cuatro", 2);

    expect(getChatFeedSnapshot().map((line) => line.text)).toEqual([
      "tres",
      "cuatro",
    ]);
  });

  it("la misma frase dos veces seguidas no repite línea ni avisa (anti-ruido)", () => {
    const listener = vi.fn();
    subscribeChatFeed(listener);

    inform(playingText("Pieza"), MAX_FEED_LINES);
    inform(playingText("Pieza"), MAX_FEED_LINES);
    inform(pausedText(), MAX_FEED_LINES);
    inform(pausedText(), MAX_FEED_LINES);

    expect(getChatFeedSnapshot().map((line) => line.text)).toEqual([
      playingText("Pieza"),
      pausedText(),
    ]);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("el id es monotónico aunque las líneas viejas se descarten", () => {
    inform("uno", MAX_FEED_LINES);
    inform("dos", MAX_FEED_LINES);
    inform("tres", MAX_FEED_LINES);
    inform("cuatro", MAX_FEED_LINES);

    const snapshot = getChatFeedSnapshot();
    for (let i = 1; i < snapshot.length; i += 1) {
      expect(snapshot[i].id).toBeGreaterThan(snapshot[i - 1].id);
    }
  });

  it("la baja deja de recibir avisos", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeChatFeed(listener);
    unsubscribe();

    inform("solo para quien escucha", MAX_FEED_LINES);

    expect(listener).not.toHaveBeenCalled();
  });

  it("la fotografía no cambia de ref si `inform` decide no añadir nada", () => {
    inform("uno", MAX_FEED_LINES);
    const before = getChatFeedSnapshot();
    inform("uno", MAX_FEED_LINES);
    expect(getChatFeedSnapshot()).toBe(before);
  });

  it("clearChatFeed avisa y deja la fotografía vacía", () => {
    const listener = vi.fn();
    subscribeChatFeed(listener);
    inform("uno", MAX_FEED_LINES);

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
