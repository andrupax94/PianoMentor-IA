// description: Grabadora del modo depuración (B-033.5): guarda el tap que publica usePlayback (AudioContext vigente + nodo donde el piano ya está sumado), añade un MediaStreamAudioDestinationNode como cable extra sin cortar el destino real, graba con MediaRecorder lo que suena y, al parar, decodifica y baja a WAV mono 16-bit (lib/wav.ts) que queda en memoria hasta la recarga de la pestaña.
// context: B-033.5; la única pieza con navegador real del flujo rec (MediaRecorder, promesas de blob): el almacén rec-store decide CUANDO, esto decide COMO. La conversión nace de que el webm/opus del navegador no sirve para archivar: WAV mono 16-bit es el formato sonable que se pidió (nunca JSON/CSV).

import { downmixToMono, encodeWav16BitMono } from "./wav";

/** Lo que el motor publica al almacén de grabación: contexto y nodo de tap. */
export interface AudioTap {
  ctx: AudioContext;
  /** Nodo del grafo donde el piano ya está sumado (por ejemplo el limitador). */
  node: AudioNode;
}

/** Estado interno del recorder para el almacén. */
export type RecorderState =
  | { kind: "idle" }
  | { kind: "recording" }
  | { kind: "ready"; blob: Blob };

let state: RecorderState = { kind: "idle" };

/** Estado para el almacén (WAV listo o nada). */
export function getRecorderState(): RecorderState {
  return state;
}

/** ¿El navegador sabe grabar? (Safari viejo no: el switch queda deshabilitado.) */
export function recorderSupported(): boolean {
  return typeof window !== "undefined" && typeof MediaRecorder !== "undefined";
}

/* -- Tap de audio publicado por el motor (usePlayback) ---------------------- */

let tap: AudioTap | null = null;
const tapListeners = new Set<() => void>();

/** Publica el tap del motor nuevo; null también vale (motor destruido). */
export function publishAudioTap(next: AudioTap | null): void {
  tap = next;
  for (const listener of tapListeners) listener();
}

/** Tap vigente o null (motor no montado / motor destruido). */
export function getCurrentTap(): AudioTap | null {
  return tap;
}

export function subscribeAudioTap(listener: () => void): () => void {
  tapListeners.add(listener);
  return () => {
    tapListeners.delete(listener);
  };
}

/* -- Sesión de grabación ----------------------------------------------------- */

let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let tapNode: AudioNode | null = null;
let streamDest: MediaStreamAudioDestinationNode | null = null;
let startedAt: number | null = null;

/** Tope prudencial: 5 minutos por grabación (se corta con aviso, no crece sin techo). */
export const REC_MAX_MS = 5 * 60 * 1000;

/** Duración de la grabación en curso; null si no graba. */
export function recordingElapsedMs(): number | null {
  if (state.kind !== "recording" || startedAt === null) return null;
  return Date.now() - startedAt;
}

/** El mime que MediaRecorder de verdad puede trabajar; null = sin options. */
function pickMimeType(): string | null {
  const prefer = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  if (typeof MediaRecorder === "undefined") return null;
  for (const mime of prefer) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return null;
}

/**
 * Empieza a grabar: conecta el tap con.stop de cortar el destino original y
 * arranca MediaRecorder. El grafo queda igual de sonido (+ el cable extra).
 * El AudioContext suspendido se reanuda aquí mismo (el gesto que mandó
 * grabar ya fue un clic del usuario).
 */
export async function startTapRecording(ctx: AudioContext, node: AudioNode): Promise<void> {
  if (!recorderSupported()) throw new Error("MediaRecorder no está disponible en este navegador");
  if (state.kind === "recording") return;
  if (ctx.state === "suspended") await ctx.resume();
  streamDest = ctx.createMediaStreamDestination();
  tapNode = node;
  tapNode.connect(streamDest);

  const mimeType = pickMimeType();
  recorder = new MediaRecorder(streamDest.stream, mimeType ? { mimeType } : undefined);
  chunks = [];
  startedAt = Date.now();
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.onstop = () => {
    startedAt = null; // se acaba el reloj, tanto si la conversion va como si no
  };
  recorder.start();
  state = { kind: "recording" };
}

/** Desconecta el tap limpio: el motor pudo morir mientras grababa. */
function disconnectTap(): void {
  if (tapNode !== null && streamDest !== null) {
    try {
      tapNode.disconnect(streamDest);
    } catch {
      // el grafo pudo irse ya: nada que desenchufar
    }
  }
  tapNode = null;
  streamDest = null;
}

/**
 * Para la grabación y devuelve el WAV (blob): decodeAudioData del webm/opus
 * bruto, downmix a mono y encodeWav16BitMono. El blob WAV queda en el estado
 * (kind ready) hasta descarte o recarga. Sin ctx vivo, el bruto no se puede
 * decodificar: se conserva el webm sonable (mejor que nada).
 */
export async function stopTapRecording(): Promise<Blob | null> {
  const current = recorder;
  if (current === null || state.kind !== "recording") return null;
  const finished = new Promise<Blob>((resolve) => {
    current.addEventListener(
      "stop",
      () => resolve(new Blob(chunks, { type: chunks[0]?.type ?? "audio/webm" })),
      { once: true },
    );
  });
  try {
    current.stop();
  } catch {
    // ya cerrado: el «stop» listener resuelve igual con lo capturado
  }
  const bruto = await finished;
  recorder = null;
  chunks = [];
  disconnectTap();

  if (bruto.size === 0) {
    state = { kind: "idle" };
    return null;
  }

  // Conversión a WAV con el AudioContext vigente del tap (decodeAudioData).
  if (tap !== null && tap.ctx.state !== "closed") {
    try {
      const decoded = await tap.ctx.decodeAudioData(await bruto.arrayBuffer());
      const mono = downmixToMono(
        Array.from({ length: decoded.numberOfChannels }, (_, index) =>
          decoded.getChannelData(index) as Float32Array,
        ),
      );
      const wav = encodeWav16BitMono(mono, decoded.sampleRate);
      const blob = new Blob([wav as unknown as BlobPart], { type: "audio/wav" });
      state = { kind: "ready", blob };
      return blob;
    } catch {
      // decode falló (blob vacío/truncado): el WAV de reserva queda abajo
    }
  }
  // Reserva: el bruto del navegador sonable (webm/opus), cuando el decode
  // falla no queda más remedio — mejor un fichero audible que ninguno.
  const blob = new Blob([bruto], { type: bruto.type || "audio/webm" });
  state = { kind: "ready", blob };
  return blob;
}

/** Descarta el WAV listo (o corta una grabación en curso sin convertir). */
export function discardRecording(): void {
  if (state.kind === "recording" && recorder !== null) {
    try {
      recorder.stop();
    } catch {
      // ya cerrado: nada que cortar
    }
    recorder = null;
    chunks = [];
    disconnectTap();
  }
  state = { kind: "idle" };
}

/** (solo tests) restaura módulo: estado, tap y oídos. */
export function resetRecorder(): void {
  discardRecording();
  publishAudioTap(null);
}
