// description: Cliente WebSocket de la sesión de práctica (B-012.1/B-012.5/B-012.7): SessionSocket abre la conexión, envía note_on/note_off con el sobre {type, pitch, velocity, t_s}, avisa del estado de conexión, de los mensajes state/error y de las acciones del agente (sobre agent_action con demonstrate/return_control/accompany, su ventana, su mano y sus notas), mide la latencia del canal con ping/pong y reconecta con backoff exponencial (el contador solo se reinicia cuando llega un mensaje, no al abrir). Incluye las piezas puras sessionSocketUrl, reconnectDelay, roundSeconds, encodeNoteEvent y parseServerMessage.
// context: Mismo sobre que el backend; se escribe sin DOM, así que el WebSocket y el reloj se inyectan en los tests. Un cierre pedido con close() no reconecta. La RTT medida decide si el acompañamiento se degrada a demostración (B-012.7).

import type { SessionState } from "./api-client";

/** Estado de la conexión, independiente del estado musical de la sesión. */
export type ConnectionStatus = "connecting" | "open" | "closed";

/** Nota pulsada o soltada, con el reloj del estudiante en segundos. */
export interface NoteEvent {
  pitch: number;
  /** 1–127 en `note_on`; 0 en `note_off`. */
  velocity: number;
  /** Segundos desde el inicio de la reproducción. */
  t_s: number;
}

export type NoteEventType = "note_on" | "note_off";

/** Estado que empuja el servidor tras cada evento. */
export interface SessionStateMessage extends SessionState {
  type: "state";
}

/** Aviso del servidor: un evento inválido o la sesión que no existe. */
export interface SessionErrorMessage {
  type: "error";
  code: string;
  message: string;
}

/**
 * Nota del acompañamiento que empuja el backend (B-012.7), con el tiempo
 * relativo al inicio de la sección.
 */
export interface AgentAccompanyNote {
  pitch: number;
  start_s: number;
  duration_s: number;
  velocity: number;
}

/**
 * Acción del agente en la sesión (B-012.5/B-012.7): el backend la emite al
 * validarla y ejecutarla. `demonstrate` arranca la demostración y bloquea el
 * control del estudiante; `accompany` hace sonar una mano de la IA sin
 * bloquearlo; `return_control` devuelve el control. Los parámetros de la
 * ventana (`from_measure`, `to_measure`, `tempo_factor`) llegan opcionalmente
 * en el propio sobre; el acompañamiento añade la mano y sus notas.
 */
export interface AgentActionMessage {
  type: "agent_action";
  action: string;
  from_measure?: number;
  to_measure?: number;
  tempo_factor?: number;
  /** `accompany` (B-012.7): mano que toca la IA y la que le queda al estudiante. */
  hand?: string;
  student_hand?: string | null;
  /** Inicio de la sección en segundos de partitura y su duración. */
  from_s?: number;
  duration_s?: number;
  /** Notas de la IA, con tiempos relativos al inicio de la sección. */
  notes?: AgentAccompanyNote[];
}

/** Respuesta al `ping` del cliente: sirve para medir la latencia del canal. */
export interface PongMessage {
  type: "pong";
  t_s: number;
}

export type ServerMessage =
  | SessionStateMessage
  | SessionErrorMessage
  | AgentActionMessage
  | PongMessage;

/**
 * Subconjunto de `WebSocket` que usa el cliente: permite inyectar un doble en
 * los tests, que corren sin DOM.
 */
export interface WebSocketLike {
  send(data: string): void;
  close(code?: number): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export interface SessionSocketOptions {
  sessionId: string;
  /** Por defecto se compone a partir de `NEXT_PUBLIC_WS_URL`. */
  url?: string;
  onState?: (state: SessionStateMessage) => void;
  onError?: (error: SessionErrorMessage) => void;
  /** Acción del agente (demostración o devolución de control), B-012.5. */
  onAction?: (action: AgentActionMessage) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
  /** Inyectable en tests; en el navegador es `new WebSocket`. */
  createSocket?: (url: string) => WebSocketLike;
  /** Inyectable en tests para no depender del reloj real. */
  schedule?: (run: () => void, delayMs: number) => void;
  /** Reloj en milisegundos para medir la latencia del canal (B-012.7). */
  now?: () => number;
  /** Latencia de ida y vuelta del último `ping`, en milisegundos (B-012.7). */
  onLatency?: (rttMs: number) => void;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** `false` deja el socket cerrado cuando el servidor se cae. */
  autoReconnect?: boolean;
}

const DEFAULT_BASE_URL = "ws://localhost:8000";
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 8000;

/** URL del WebSocket de una sesión, sin barras duplicadas. */
export function sessionSocketUrl(sessionId: string, baseUrl?: string): string {
  // `||` y no `??`: un `NEXT_PUBLIC_WS_URL` vacío dejaría una ruta relativa,
  // que `new WebSocket` no acepta.
  const configured = baseUrl ?? process.env.NEXT_PUBLIC_WS_URL;
  const base = (configured || DEFAULT_BASE_URL).replace(/\/+$/, "");
  return `${base}/api/v1/ws/sessions/${encodeURIComponent(sessionId)}`;
}

/**
 * Retardo del intento `attempt` (1, 2, 3…): crece al doble y se corta en
 * `maxDelayMs`; con muchos intentos el número deja de importar.
 */
export function reconnectDelay(
  attempt: number,
  baseDelayMs: number = DEFAULT_BASE_DELAY_MS,
  maxDelayMs: number = DEFAULT_MAX_DELAY_MS,
): number {
  if (attempt < 1) return 0;
  return Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
}

/**
 * Redondea el reloj a milisegundos: menos ruido en el log y sobra para la
 * tolerancia de la evaluación (B-012.2 redondea a ±100 ms).
 */
export function roundSeconds(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}

/** Da forma al mensaje de un evento MIDI tal y como lo espera el backend. */
export function encodeNoteEvent(
  type: NoteEventType,
  event: NoteEvent,
): { type: NoteEventType; pitch: number; velocity: number; t_s: number } {
  return {
    type,
    pitch: event.pitch,
    velocity: type === "note_off" ? 0 : event.velocity,
    t_s: roundSeconds(event.t_s),
  };
}

/**
 * Normaliza un mensaje del servidor; `null` si no es un objeto con `type`.
 * Acepta texto o el objeto ya parseado.
 */
export function parseServerMessage(raw: unknown): ServerMessage | null {
  const message = asObject(raw);
  if (!message || typeof message.type !== "string") return null;
  return message as unknown as ServerMessage;
}

function asObject(raw: unknown): Record<string, unknown> | null {
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      return typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object" && raw !== null) return raw as Record<string, unknown>;
  return null;
}

function defaultCreateSocket(url: string): WebSocketLike {
  return new WebSocket(url) as unknown as WebSocketLike;
}

function defaultSchedule(run: () => void, delayMs: number): void {
  setTimeout(run, delayMs);
}

/**
 * Conexión de una sesión de práctica: avisa del estado, envía las notas y
 * reintenta si el servidor se cae. Un cierre pedido con `close()` no reintenta.
 */
export class SessionSocket {
  private socket: WebSocketLike | null = null;
  private status: ConnectionStatus = "closed";
  private attempts = 0;
  private closedByUs = false;
  private readonly url: string;
  private readonly now: () => number;
  /** Pings enviados y todavía sin `pong`, por su `t_s`. */
  private readonly pendingPings = new Map<number, number>();
  private rttMs: number | null = null;

  constructor(private readonly options: SessionSocketOptions) {
    this.url = options.url ?? sessionSocketUrl(options.sessionId);
    this.now = options.now ?? (() => Date.now());
  }

  get connectionStatus(): ConnectionStatus {
    return this.status;
  }

  /** Latencia medida del canal; `null` hasta el primer `pong` (B-012.7). */
  get latencyMs(): number | null {
    return this.rttMs;
  }

  /** Abre el socket; repetirlo con uno abierto no hace nada. */
  connect(): void {
    if (this.socket) return;

    this.closedByUs = false;
    this.setStatus("connecting");

    const socket = (this.options.createSocket ?? defaultCreateSocket)(this.url);
    this.socket = socket;
    socket.onopen = () => {
      this.setStatus("open");
    };
    socket.onmessage = (event) => this.handleMessage(event.data);
    socket.onclose = () => {
      this.socket = null;
      this.setStatus("closed");
      if (!this.closedByUs && this.options.autoReconnect !== false) this.scheduleReconnect();
    };
    // `onerror` va seguido de `onclose`: la reconexión se decide allí.
    socket.onerror = () => {};
  }

  sendNoteOn(event: NoteEvent): void {
    this.send(encodeNoteEvent("note_on", event));
  }

  sendNoteOff(event: NoteEvent): void {
    this.send(encodeNoteEvent("note_off", event));
  }

  /**
   * Mide la latencia del canal (B-012.7): manda el instante actual y espera su
   * eco en `pong`. Es lo que decide si el acompañamiento puede sonar junto al
   * estudiante o hay que degradarlo a demostración.
   */
  ping(): void {
    if (!this.socket || this.status !== "open") return;
    const sentAt = this.now();
    this.pendingPings.set(sentAt, sentAt);
    this.send({ type: "ping", t_s: sentAt });
  }

  /** Cierra a propósito: libera el socket y corta las reconexiones. */
  close(): void {
    this.closedByUs = true;
    const socket = this.socket;
    this.socket = null;
    this.pendingPings.clear();
    socket?.close();
    this.setStatus("closed");
  }

  private send(payload: object): void {
    if (!this.socket || this.status !== "open") return;
    this.socket.send(JSON.stringify(payload));
  }

  private handleMessage(data: unknown): void {
    const message = parseServerMessage(data);
    if (!message) return;
    // Un mensaje del servidor prueba que la sesión está viva: el contador de
    // reintentos vuelve a cero (abrir el socket, por sí solo, no lo hace).
    this.attempts = 0;
    if (message.type === "state") this.options.onState?.(message);
    else if (message.type === "error") this.options.onError?.(message);
    else if (message.type === "agent_action") this.options.onAction?.(message);
    else if (message.type === "pong") this.handlePong(message);
  }

  private handlePong(message: PongMessage): void {
    const sentAt = this.pendingPings.get(message.t_s);
    // Eco de un ping que ya no esperamos (reconexión, reloj movido): se ignora.
    if (sentAt === undefined) return;
    this.pendingPings.delete(message.t_s);
    this.rttMs = Math.max(0, this.now() - sentAt);
    this.options.onLatency?.(this.rttMs);
  }

  private scheduleReconnect(): void {
    this.attempts += 1;
    const delay = reconnectDelay(this.attempts, this.options.baseDelayMs, this.options.maxDelayMs);
    (this.options.schedule ?? defaultSchedule)(() => this.connect(), delay);
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.options.onStatusChange?.(status);
  }
}
