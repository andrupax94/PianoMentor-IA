// description: Tests del canal de comandos del agente y del despacho de client_action.
// context: Criterio de B-012.8 bloque C; el navegador ejecuta las órdenes y el backend no
// toca el reloj. Sin DOM: los efectos llegan inyectados y se comprueban como fakes.

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  executeClientAction,
  fetchPieceTitle,
  publishAgentCommand,
  subscribeAgentCommand,
  type AgentActionDeps,
  type AgentCommand,
  type AgentTransportCommand,
} from "./agent-commands";
import type { AgentClientAction } from "./api-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Dependencias de despacho con fakes; `overrides` cambia solo lo que interesa. */
function makeDeps(overrides: Partial<AgentActionDeps> = {}): AgentActionDeps {
  return {
    publishPiece: vi.fn(),
    publishCommand: vi.fn(),
    createPracticeSession: vi.fn(async () => ({ id: "s1" })),
    navigate: vi.fn(),
    resolveTitle: vi.fn(async () => "Minueto en Sol"),
    ...overrides,
  };
}

/** Acción de cliente tal y como la devuelve el backend. */
function action(name: string, args: Record<string, unknown> = {}): AgentClientAction {
  return { name, arguments: args };
}

describe("canal de comandos", () => {
  it("entrega la orden publicada a quien esté suscrito", () => {
    const received: AgentCommand[] = [];
    subscribeAgentCommand((command) => received.push(command));

    publishAgentCommand("pausar");

    expect(received).toHaveLength(1);
    expect(received[0].command).toBe("pausar");
  });

  it("numera las órdenes para que dos iguales no se confundan", () => {
    const received: AgentCommand[] = [];
    subscribeAgentCommand((command) => received.push(command));

    publishAgentCommand("parar");
    publishAgentCommand("parar");

    // El contador es del módulo y sigue creciendo entre tests; lo que importa
    // es que cada aviso sea único, no el número concreto.
    expect(received).toHaveLength(2);
    expect(received[0].command).toBe(received[1].command);
    expect(received[0].seq).toBeLessThan(received[1].seq);
    expect(received[0]).not.toBe(received[1]);
  });

  it("avisa a todos los suscriptores, no solo al primero", () => {
    const first: AgentTransportCommand[] = [];
    const second: AgentTransportCommand[] = [];
    subscribeAgentCommand(({ command }) => first.push(command));
    subscribeAgentCommand(({ command }) => second.push(command));

    publishAgentCommand("reanudar");

    expect(first).toEqual(["reanudar"]);
    expect(second).toEqual(["reanudar"]);
  });

  it("deja de avisar al darse de baja", () => {
    const received: AgentTransportCommand[] = [];
    const unsubscribe = subscribeAgentCommand(({ command }) => received.push(command));

    unsubscribe();
    publishAgentCommand("pausar");

    expect(received).toEqual([]);
  });

  it("aguanta publicar sin nadie escuchando", () => {
    expect(() => publishAgentCommand("parar")).not.toThrow();
  });

  it("sigue avisando si un suscriptor se da de baja durante la publicación", () => {
    const received: AgentTransportCommand[] = [];
    const unsubscribe = subscribeAgentCommand(({ command }) => {
      received.push(command);
      unsubscribe();
    });
    subscribeAgentCommand(({ command }) => received.push(command));

    publishAgentCommand("pausar");

    // El primero se dio de baja a sí mismo, pero el segundo sigue en pie.
    expect(received).toEqual(["pausar", "pausar"]);
  });
});

describe("executeClientAction", () => {
  it("reproducir_pieza publica la pieza con su título y va al piano", async () => {
    const deps = makeDeps();

    const done = await executeClientAction(
      action("reproducir_pieza", { piece_id: "p01" }),
      deps,
    );

    expect(done).toBe(true);
    expect(deps.resolveTitle).toHaveBeenCalledWith("p01");
    expect(deps.publishPiece).toHaveBeenCalledWith({
      kind: "catalog",
      id: "p01",
      title: "Minueto en Sol",
      autoPlay: true,
    });
    expect(deps.navigate).toHaveBeenCalledWith("/");
  });

  it("respeta auto_play en false: carga la pieza sin arrancar", async () => {
    const deps = makeDeps();

    await executeClientAction(
      action("reproducir_pieza", { piece_id: "p02", auto_play: false }),
      deps,
    );

    expect(deps.publishPiece).toHaveBeenCalledWith(
      expect.objectContaining({ id: "p02", autoPlay: false }),
    );
  });

  it("reproducir_pieza sin piece_id no hace nada", async () => {
    const deps = makeDeps();

    const done = await executeClientAction(action("reproducir_pieza"), deps);

    expect(done).toBe(false);
    expect(deps.publishPiece).not.toHaveBeenCalled();
    expect(deps.navigate).not.toHaveBeenCalled();
  });

  it.each([["pausar"], ["reanudar"], ["parar"]])(
    "la orden de transporte %s viaja por el canal",
    async (name) => {
      const deps = makeDeps();

      const done = await executeClientAction(action(name), deps);

      expect(done).toBe(true);
      expect(deps.publishCommand).toHaveBeenCalledWith(name);
      expect(deps.navigate).not.toHaveBeenCalled();
    },
  );

  it("abrir_practica crea la sesión y navega a ella", async () => {
    const deps = makeDeps();

    const done = await executeClientAction(action("abrir_practica", { piece_id: "p03" }), deps);

    expect(done).toBe(true);
    expect(deps.createPracticeSession).toHaveBeenCalledWith("p03");
    expect(deps.navigate).toHaveBeenCalledWith("/practice/s1");
  });

  it("abrir_practica avisa si la pieza no existe en el catálogo", async () => {
    const deps = makeDeps({
      createPracticeSession: vi.fn(async () => {
        throw new Error("piece_not_found: la pieza no está en el catálogo.");
      }),
    });

    await expect(
      executeClientAction(action("abrir_practica", { piece_id: "nope" }), deps),
    ).rejects.toThrow(/piece_not_found/);
    expect(deps.navigate).not.toHaveBeenCalled();
  });

  it("ignora una acción fuera de la lista blanca", async () => {
    const deps = makeDeps();

    const done = await executeClientAction(action("borrar_todo", { piece_id: "p01" }), deps);

    expect(done).toBe(false);
    expect(deps.publishPiece).not.toHaveBeenCalled();
    expect(deps.publishCommand).not.toHaveBeenCalled();
    expect(deps.createPracticeSession).not.toHaveBeenCalled();
    expect(deps.navigate).not.toHaveBeenCalled();
  });

  it("con una acción nula no toca nada", async () => {
    const deps = makeDeps();

    const done = await executeClientAction(null, deps);

    expect(done).toBe(false);
    expect(deps.navigate).not.toHaveBeenCalled();
  });
});

describe("fetchPieceTitle", () => {
  const catalog = [
    { id: "p01", title: "Minueto en Sol" },
    { id: "p02", title: null },
  ];

  it("lee el título del catálogo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify(catalog), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(fetchPieceTitle("p01")).resolves.toBe("Minueto en Sol");
  });

  it("si el catálogo no trae título, devuelve el id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify(catalog), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(fetchPieceTitle("p02")).resolves.toBe("p02");
  });

  it("si la petición falla, devuelve el id y no rompe la reproducción", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));

    await expect(fetchPieceTitle("p01")).resolves.toBe("p01");
  });
});
