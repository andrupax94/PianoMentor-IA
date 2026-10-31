// description: Tests del cliente WebSocket con socket falso: composición de la URL (barra final, escapado y variable vacía), backoff exponencial con tope, redondeo del reloj, forma de note_on/note_off, normalización del sobre del servidor, estados de conexión, envío solo con el socket abierto, entrega de estado, errores y acciones del agente (B-012.5/B-012.7, incluido el acompañamiento con su mano y sus notas), medida de la latencia con ping/pong (B-012.7), reconexión con retardo creciente, reinicio del contador cuando la sesión vuelve a estar viva, ausencia de reconexión al cerrar a propósito y cierre aplazado de un socket en CONNECTING (B-032.1).
// context: Criterio de B-012.1/B-012.5/B-012.7/B-032.1; se ejecutan con `npm run test` (Vitest) sin DOM.

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SessionSocket,
  encodeNoteEvent,
  encodePosition,
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

describe("encodePosition", () => {
  it("manda la posición sin pitch y redondea el reloj (B-032.2)", () => {
    expect(encodePosition({ t_s: 1.23456, measure: 2 })).toEqual({
      type: "position",
      t_s: 1.235,
      measure: 2,
    });
  });

  it("acepta una pieza sin rejilla de compases", () => {
    expect(encodePosition({ t_s: 0, measure: null })).toEqual({
      type: "position",
      t_s: 0,
      measure: null,
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
    latencies: number[];
    /** Reloj inyectado en milisegundos: la latencia se mide con él. */
    clock: { value: number };
  }

  function harness(overrides: { autoReconnect?: boolean } = {}): Harness {
    const sockets: FakeSocket[] = [];
    const states: ServerMessage[] = [];
    const errors: ServerMessage[] = [];
    const actions: AgentActionMessage[] = [];
    const statuses: ConnectionStatus[] = [];
    const scheduled: { run: () => void; delay: number }[] = [];
    const latencies: number[] = [];
    const clock = { value: 0 };

    const client = new SessionSocket({
      sessionId: "s1",
      url: "ws://test/api/v1/ws/sessions/s1",
      createSocket: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      schedule: (run, delay) => scheduled.push({ run, delay }),
      now: () => clock.value,
      onLatency: (rttMs) => latencies.push(rttMs),
      onState: (message) => states.push(message),
      onError: (message) => errors.push(message),
      onAction: (message) => actions.push(message),
      onStatusChange: (status) => statuses.push(status),
      ...overrides,
    });

    return { client, sockets, states, errors, actions, statuses, scheduled, latencies, clock };
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

  it("manda la posición del transporte solo con el socket abierto (B-032.2)", () => {
    const { client, sockets } = harness();
    client.connect();

    client.sendPosition({ t_s: 1.2, measure: 0 });
    expect(sockets[0].sent).toEqual([]);

    sockets[0].open();
    client.sendPosition({ t_s: 1.2, measure: 0 });
    client.sendPosition({ t_s: 2.4, measure: null });

    expect(sockets[0].sent).toEqual([
      '{"type":"position","t_s":1.2,"measure":0}',
      '{"type":"position","t_s":2.4,"measure":null}',
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

  it("entrega el acompañamiento con su mano, su sección y sus notas (B-012.7)", () => {
    const { client, sockets, actions } = harness();
    client.connect();
    sockets[0].open();

    sockets[0].deliver(
      '{"type":"agent_action","action":"accompany","hand":"left","student_hand":"right",' +
        '"from_measure":0,"to_measure":2,"from_s":0,"duration_s":4,"tempo_factor":0.9,' +
        '"notes":[{"pitch":48,"start_s":0,"duration_s":2,"velocity":60},' +
        '{"pitch":55,"start_s":2,"duration_s":1.5,"velocity":64}]}',
    );

    expect(actions).toHaveLength(1);
    const message = actions[0];
    expect(message).toMatchObject({
      type: "agent_action",
      action: "accompany",
      hand: "left",
      student_hand: "right",
      from_measure: 0,
      to_measure: 2,
      from_s: 0,
      duration_s: 4,
      tempo_factor: 0.9,
    });
    // Los tiempos de las notas son relativos al inicio de la sección.
    expect(message.notes?.map((note) => [note.pitch, note.start_s])).toEqual([
      [48, 0],
      [55, 2],
    ]);
  });

  it("mide la latencia del canal con ping y pong (B-012.7)", () => {
    const { client, sockets, latencies, clock } = harness();
    client.connect();
    sockets[0].open();

    clock.value = 1000;
    client.ping();
    expect(sockets[0].sent).toEqual(['{"type":"ping","t_s":1000}']);
    // Hasta que llega el eco no hay medida: no se inventa una latencia.
    expect(client.latencyMs).toBeNull();

    clock.value = 1042;
    sockets[0].deliver('{"type":"pong","t_s":1000}');

    expect(client.latencyMs).toBe(42);
    expect(latencies).toEqual([42]);
  });

  it("no manda pings sin socket abierto y descarta ecos que no espera", () => {
    const { client, sockets, latencies, clock } = harness();
    client.connect();
    client.ping();
    expect(sockets[0].sent).toEqual([]);

    sockets[0].open();
    clock.value = 10;
    client.ping();
    // El eco de un ping anterior (reconexión, reloj movido) no inventa latencia.
    sockets[0].deliver('{"type":"pong","t_s":999}');
    expect(client.latencyMs).toBeNull();
    expect(latencies).toEqual([]);

    clock.value = 15;
    sockets[0].deliver('{"type":"pong","t_s":10}');
    expect(client.latencyMs).toBe(5);
    expect(latencies).toEqual([5]);
  });

  it("un pong también confirma que la sesión sigue viva", () => {
    const { client, sockets, scheduled, clock } = harness();
    client.connect();
    sockets[0].open();
    sockets[0].serverClose();
    scheduled[0].run();
    sockets[1].open();
    sockets[1].serverClose();
    scheduled[1].run();
    sockets[2].open();
    clock.value = 1;
    client.ping();
    sockets[2].deliver('{"type":"pong","t_s":1}');
    sockets[2].serverClose();

    // Tras el pong, el siguiente reintento vuelve al retardo corto.
    expect(scheduled.map((item) => item.delay)).toEqual([500, 1000, 500]);
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

  it("aplaza el cierre de un socket en CONNECTING hasta que abre (B-032.1)", () => {
    const { client, sockets, statuses, scheduled } = harness();
    client.connect();

    // Cerrar en CONNECTING haría que el navegador avisara por consola.
    client.close();
    expect(sockets[0].closed).toEqual([]);
    expect(client.connectionStatus).toBe("closed");

    sockets[0].open();
    expect(sockets[0].closed).toEqual([undefined]);
    // No se anuncia «open» ni se reintenta: el cierre era cosa nuestra.
    expect(statuses).toEqual(["connecting", "closed"]);
    expect(scheduled).toEqual([]);
  });

  it("tras cerrar en CONNECTING, el onclose del socket no reconecta", () => {
    const { client, sockets, scheduled } = harness();
    client.connect();

    client.close();
    sockets[0].open();
    sockets[0].serverClose();

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
