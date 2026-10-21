// description: Acciones que el agente manda al navegador: canal al transporte y ejecución de client_action.
// context: B-012.8 bloque C; el backend solo devuelve la intención y valida contra la lista blanca,
// aquí se convierte en efectos reales con las dependencias inyectadas (piece-store, agent-commands,
// createSession, navegación), igual que piece-store: publicar/suscribirse, en memoria y sin persistencia.
// El LLM nunca toca el reloj de reproducción: solo elige el nombre de la función.

import { getPieceList } from "./api-client";
import type { AgentClientAction } from "./api-client";
import type { PianoPiece } from "./piece-store";

/** Órdenes de transporte que viajan por este canal; las aplica PlaybackArea. */
export type AgentTransportCommand = "pausar" | "reanudar" | "parar";

/** Orden enviada a los suscriptores; `seq` la hace única aunque se repita la orden. */
export interface AgentCommand {
  command: AgentTransportCommand;
  /** Contador monotónico: dos «pausa» seguidas son dos avisos, no uno. */
  seq: number;
}

type CommandListener = (command: AgentCommand) => void;

const listeners = new Set<CommandListener>();
let seq = 0;

/** Se suscribe a las órdenes de transporte; devuelve la función de baja. */
export function subscribeAgentCommand(listener: CommandListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Publica una orden de transporte. Es un evento, no un estado: no se guarda la
 * última orden, así que quien no esté escuchando en ese momento la pierde. Es
 * lo deseable, porque pausar un transporte que aún no existe no significa nada.
 */
export function publishAgentCommand(command: AgentTransportCommand): void {
  seq += 1;
  const payload: AgentCommand = { command, seq };
  // Copia: un listener puede darse de baja a sí mismo durante la iteración.
  for (const listener of [...listeners]) {
    listener(payload);
  }
}

/** Nombre con que la barra del reproductor anuncia una pieza del catálogo. */
export interface ResolvedPiece {
  /** Título de la pieza; el propio id cuando el catálogo no trae ninguno. */
  title: string;
  /** Ruta pública de la portada; null cuando no la hay. */
  cover: string | null;
}

/** Efectos reales que necesita ejecutar una orden; en los tests se sustituyen por fakes. */
export interface AgentActionDeps {
  /** Manda la pieza al piano (piece-store). */
  publishPiece: (piece: PianoPiece) => void;
  /** Manda una orden al transporte (agent-commands). */
  publishCommand: (command: AgentTransportCommand) => void;
  /** Crea la sesión de práctica y devuelve su id. */
  createPracticeSession: (pieceId: string) => Promise<{ id: string }>;
  /** Navega a una ruta de la aplicación. */
  navigate: (path: string) => void;
  /** Título y portada de una pieza del catálogo para la barra del reproductor. */
  resolvePiece: (pieceId: string) => Promise<ResolvedPiece>;
}

/**
 * Ejecuta la acción que el backend devolvió en `client_action`.
 * Devuelve true si hubo algo que ejecutar; lanza si una acción falla
 * (por ejemplo, abrir una práctica con una pieza inexistente).
 * Las acciones fuera de la lista blanca se ignoran sin tocar nada.
 */
export async function executeClientAction(
  action: AgentClientAction | null,
  deps: AgentActionDeps,
): Promise<boolean> {
  if (action === null) return false;
  const args = action.arguments ?? {};
  const pieceId = typeof args.piece_id === "string" ? args.piece_id : null;

  if (action.name === "reproducir_pieza") {
    if (pieceId === null) return false;
    const info = await deps.resolvePiece(pieceId);
    // auto_play ausente significa «reproduce»: es lo que promete la descripción
    // de la función en la lista blanca.
    deps.publishPiece({
      kind: "catalog",
      id: pieceId,
      title: info.title,
      cover: info.cover,
      autoPlay: args.auto_play !== false,
    });
    // Si ya se está en /, la publicación basta: PlaybackArea está suscrito.
    // Si no, la navegación monta el piano, que lee el almacén al entrar.
    deps.navigate("/");
    return true;
  }

  if (action.name === "pausar" || action.name === "reanudar" || action.name === "parar") {
    deps.publishCommand(action.name);
    return true;
  }

  if (action.name === "abrir_practica") {
    if (pieceId === null) return false;
    let sessionId: string;
    try {
      const session = await deps.createPracticeSession(pieceId);
      sessionId = session.id;
    } catch (failure) {
      throw new Error(
        failure instanceof Error ? failure.message : "No se pudo abrir la sesión de práctica.",
      );
    }
    // La práctica es la portada con el id en la URL: al entrar, PracticeBridge
    // abre el WebSocket de la sesión y el mini cuadro del mentor la muestra viva.
    deps.navigate(`/${sessionId}`);
    return true;
  }

  return false;
}

/**
 * Título y portada de una pieza del catálogo para la barra del reproductor.
 * `client_action` solo trae el id, así que se va al catálogo —una sola
 * petición trae las dos cosas—; si no está (o el catálogo no responde), el
 * título es el id y no hay portada, para que la reproducción no dependa
 * de esta consulta.
 */
export async function fetchPieceInfo(pieceId: string): Promise<ResolvedPiece> {
  try {
    const catalog = await getPieceList();
    const item = catalog.find((entry) => entry.id === pieceId);
    return { title: item?.title ?? pieceId, cover: item?.cover ?? null };
  } catch {
    return { title: pieceId, cover: null };
  }
}
