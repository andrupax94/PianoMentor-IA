// description: Canal de reproducción del agente (B-012.5/B-012.7): órdenes de demostración, de acompañamiento y de parada, con contador monotónico.
// context: Es un evento, no un estado: solo lo escucha PlaybackArea, único dueño del reloj del transporte. PracticeBridge publica lo que llega por WebSocket y agent-demo/agent-accompany solo calculan; así el WS nunca toca el motor.

import type { AccompanyPlan } from "./agent-accompany";
import type { AgentDemoWindow } from "./agent-demo";

/** La IA demuestra una ventana de compases: la ventana recortada suena sola. */
export interface DemoPlaybackStart {
  kind: "demo";
  /** Pieza de la sesión; el transporte la sirve si no es la que ya tiene cargada. */
  pieceId: string;
  window: AgentDemoWindow;
}

/**
 * La IA acompaña con una mano (B-012.7): suena solo esa parte, desde el inicio
 * de la sección, mientras el estudiante toca la otra y el teclado sigue vivo.
 */
export interface AccompanyPlaybackStart {
  kind: "accompany";
  pieceId: string;
  plan: AccompanyPlan;
}

/** La intervención del agente termina: se restaura la pieza normal. */
export interface AgentPlaybackStop {
  kind: "stop";
}

export type AgentPlaybackEvent = DemoPlaybackStart | AccompanyPlaybackStart | AgentPlaybackStop;

/** Orden con su contador, para que dos intervenciones seguidas no sean la misma. */
export interface AgentPlaybackMessage {
  event: AgentPlaybackEvent;
  seq: number;
}

type AgentPlaybackListener = (message: AgentPlaybackMessage) => void;

const listeners = new Set<AgentPlaybackListener>();
let seq = 0;

/** Se suscribe a las órdenes de reproducción del agente; devuelve la baja. */
export function subscribeAgentPlayback(listener: AgentPlaybackListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Publica una orden de reproducción. Es un evento, no un estado: no se guarda
 * el último, así que quien no esté escuchando (el transporte aún no montado) la
 * pierde; un piano que todavía no existe no puede reproducir nada.
 */
export function publishAgentPlayback(event: AgentPlaybackEvent): void {
  seq += 1;
  const payload: AgentPlaybackMessage = { event, seq };
  // Copia: un listener puede darse de baja a sí mismo durante la iteración.
  for (const listener of [...listeners]) {
    listener(payload);
  }
}
