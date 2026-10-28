// description: Tests del cliente WebSocket con socket falso: composición de la URL (barra final, escapado y variable vacía), backoff exponencial con tope, redondeo del reloj, forma de note_on/note_off, normalización del sobre del servidor, estados de conexión, envío solo con el socket abierto, entrega de estado, errores y acciones del agente (B-012.5), reconexión con retardo creciente, reinicio del contador cuando la sesión vuelve a estar viva y ausencia de reconexión al cerrar a propósito.
// context: Criterio de B-012.1/B-012.5; se ejecutan con `npm run test` (Vitest) sin DOM.

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SessionSocket,
  encodeNoteEvent,
  parseServerMessage,
  reconnectDelay,
  roundSeconds,
  sessionSocketUrl,
  type AgentActionMessage,
  type ConnectionStatus,
  type ServerMessage,
  type WebSocketLike,
} from "./websocket-client";

/** Doble de `WebSocket` que permite disparar los eventos a mano. */
class FakeSocket implements WebSocketLike {
  readonly sent: string[] = [];
  readonly closed: (number | undefined)[] = [];
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number): void {
    this.closed.push(code);
  }

  open(): void {
    this.onopen?.(null);
  }

  /** Entrega un mensaje del servidor con el texto tal cual llega por el cable. */
  deliver(text: string): void {
    this.onmessage?.({ data: text });
  }

  serverClose(): void {
    this.onclose?.(null);
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sessionSocketUrl", () => {
  it("compone la ruta del WebSocket sobre la URL configurada", () => {
    vi.stubEnv("NEXT_PUBLIC_WS_URL", "ws://localhost:8000");

    expect(sessionSocketUrl("abc")).toBe("ws://localhost:8000/api/v1/ws/sessions/abc");
  });

  it("no duplica barras y escapa el id", () => {
    expect(sessionSocketUrl("a b/c", "wss://api.test/")).toBe(
      "wss://api.test/api/v1/ws/sessions/a%20b%2Fc",
    );
  });

  it("cae al backend local si no hay URL configurada", () => {
    vi.stubEnv("NEXT_PUBLIC_WS_URL", "");

    expect(sessionSocketUrl("abc")).toBe("ws://localhost:8000/api/v1/ws/sessions/abc");
  });
});

describe("reconnectDelay", () => {
  it("duplica el retardo y se corta en el máximo", () => {
    expect(reconnectDelay(1)).toBe(500);
    expect(reconnectDelay(2)).toBe(1000);
    expect(reconnectDelay(3)).toBe(2000);
    expect(reconnectDelay(10)).toBe(8000);
  });

  it("respeta los límites recibidos", () => {
    expect(reconnectDelay(3, 100, 250)).toBe(250);
    expect(reconnectDelay(0)).toBe(0);
  });
});

describe("roundSeconds", () => {
  it("redondea el reloj a milisegundos", () => {
    expect(roundSeconds(1.23456)).toBe(1.235);
    expect(roundSeconds(0)).toBe(0);
  });
});

describe("encodeNoteEvent", () => {
  it("manda la nota tal cual y redondea el reloj", () => {
    expect(encodeNoteEvent("note_on", { pitch: 60, velocity: 80, t_s: 1.23456 })).toEqual({
      type: "note_on",
      pitch: 60,
      velocity: 80,
      t_s: 1.235,
    });
  });

  it("fuerza velocity 0 al soltar la tecla", () => {
    expect(encodeNoteEvent("note_off", { pitch: 60, velocity: 80, t_s: 2 })).toEqual({
      type: "note_off",
      pitch: 60,
      velocity: 0,
      t_s: 2,
    });
  });
});

describe("parseServerMessage", () => {
  it("acepta el texto JSON del servidor", () => {
    const message = parseServerMessage('{"type":"state","session_id":"s1","status":"playing"}');

    expect(message?.type).toBe("state");
  });

  it("acepta un mensaje ya parseado", () => {
    expect(parseServerMessage({ type: "error", code: "ws_error", message: "boom" })?.type).toBe(
      "error",
    );
  });

  it("ignora lo que no es un mensaje del protocolo", () => {
    expect(parseServerMessage("{no es json")).toBeNull();
    expect(parseServerMessage("42")).toBeNull();
    expect(parseServerMessage('{"status":"playing"}')).toBeNull();
    expect(parseServerMessage(null)).toBeNull();
  });
});

describe("SessionSocket", () => {
  interface Harness {
    client: SessionSocket;
    sockets: FakeSocket[];
    states: ServerMessage[];
    errors: ServerMessage[];
    actions: AgentActionMessage[];
    statuses: ConnectionStatus[];
    scheduled: { run: () => void; delay: number }[];
  }

  function harness(overrides: { autoReconnect?: boolean } = {}): Harness {
    const sockets: FakeSocket[] = [];
    const states: ServerMessage[] = [];
    const errors: ServerMessage[] = [];
    const actions: AgentActionMessage[] = [];
    const statuses: ConnectionStatus[] = [];
    const scheduled: { run: () => void; delay: number }[] = [];

    const client = new SessionSocket({
      sessionId: "s1",
      url: "ws://test/api/v1/ws/sessions/s1",
      createSocket: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      schedule: (run, delay) => scheduled.push({ run, delay }),
      onState: (message) => states.push(message),
      onError: (message) => errors.push(message),
      onAction: (message) => actions.push(message),
      onStatusChange: (status) => statuses.push(status),
      ...overrides,
    });

    return { client, sockets, states, errors, actions, statuses, scheduled };
  }

  it("avisa del cambio de conexión al abrir", () => {
    const { client, sockets, statuses } = harness();

    client.connect();
    sockets[0].open();

    expect(client.connectionStatus).toBe("open");
    expect(statuses).toEqual(["connecting", "open"]);
  });

  it("no envía nada hasta que el socket está abierto", () => {
    const { client, sockets } = harness();
    client.connect();

    client.sendNoteOn({ pitch: 60, velocity: 80, t_s: 1 });
    expect(sockets[0].sent).toEqual([]);

    sockets[0].open();
    client.sendNoteOn({ pitch: 60, velocity: 80, t_s: 1 });
    client.sendNoteOff({ pitch: 60, velocity: 0, t_s: 1.5 });

    expect(sockets[0].sent).toEqual([
      '{"type":"note_on","pitch":60,"velocity":80,"t_s":1}',
      '{"type":"note_off","pitch":60,"velocity":0,"t_s":1.5}',
    ]);
  });

  it("entrega el estado y los errores que llegan del servidor", () => {
    const { client, sockets, states, errors } = harness();
    client.connect();
    sockets[0].open();

    sockets[0].deliver('{"type":"state","session_id":"s1","status":"playing"}');
    sockets[0].deliver('{"type":"error","code":"invalid_event_payload","message":"pitch raro"}');
    sockets[0].deliver("{no es json");

    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({ type: "state", session_id: "s1", status: "playing" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ type: "error", code: "invalid_event_payload" });
  });

  it("entrega las acciones del agente con sus parámetros (B-012.5)", () => {
    const { client, sockets, actions } = harness();
    client.connect();
    sockets[0].open();

    sockets[0].deliver(
      '{"type":"agent_action","action":"demonstrate","from_measure":0,"to_measure":4,"tempo_factor":0.7}',
    );
    sockets[0].deliver('{"type":"agent_action","action":"return_control"}');

    expect(actions).toHaveLength(2);
    expect(actions[0]).toMatchObject({
      type: "agent_action",
      action: "demonstrate",
      from_measure: 0,
      to_measure: 4,
      tempo_factor: 0.7,
    });
    expect(actions[1]).toMatchObject({ type: "agent_action", action: "return_control" });
  });

  it("reconecta con retardo creciente si el servidor cierra", () => {
    const { client, sockets, scheduled } = harness();
    client.connect();
    sockets[0].open();

    sockets[0].serverClose();
    expect(client.connectionStatus).toBe("closed");
    expect(scheduled.map((item) => item.delay)).toEqual([500]);

    scheduled[0].run();
    expect(sockets).toHaveLength(2);
    expect(client.connectionStatus).toBe("connecting");
    sockets[1].open();
    sockets[1].serverClose();

    expect(scheduled.map((item) => item.delay)).toEqual([500, 1000]);
  });

  it("olvida los intentos cuando la sesión vuelve a estar viva", () => {
    const { client, sockets, scheduled } = harness();
    client.connect();
    sockets[0].open();
    sockets[0].serverClose();
    scheduled[0].run();
    sockets[1].open();
    sockets[1].serverClose();
    scheduled[1].run();
    sockets[2].open();
    // Un mensaje del servidor confirma que la sesión va bien…
    sockets[2].deliver('{"type":"state","session_id":"s1","status":"idle"}');
    sockets[2].serverClose();

    // …y el siguiente reintento vuelve a empezar por el retardo corto.
    expect(scheduled.map((item) => item.delay)).toEqual([500, 1000, 500]);
  });

  it("no reconecta cuando el cierre es cosa nuestra", () => {
    const { client, sockets, scheduled } = harness();
    client.connect();
    sockets[0].open();

    client.close();
    sockets[0].serverClose();

    expect(sockets[0].closed).toEqual([undefined]);
    expect(scheduled).toEqual([]);
    expect(client.connectionStatus).toBe("closed");
  });

  it("no reconecta si la reconexión está desactivada", () => {
    const { client, sockets, scheduled } = harness({ autoReconnect: false });
    client.connect();
    sockets[0].open();

    sockets[0].serverClose();

    expect(scheduled).toEqual([]);
  });

  it("abrir dos veces no duplica el socket", () => {
    const { client, sockets } = harness();

    client.connect();
    client.connect();

    expect(sockets).toHaveLength(1);
  });
});
