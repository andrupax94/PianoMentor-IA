// description: Dobles de WebAudio para tests (sin DOM, sin AudioContext real).
// context: B-007.5; registran ramps, start/stop y buffers para poder comprobar el comportamiento
// de synth.ts y piano-samples.ts en Vitest (entorno node). No lo usa el código de la aplicación.

/** Llamada registrada sobre un parámetro, con su instante. */
export interface RampCall {
  value: number;
  at: number;
}

export class FakeParam {
  value = 0;
  readonly setAtTime: RampCall[] = [];
  readonly exponential: RampCall[] = [];
  readonly linear: RampCall[] = [];
  readonly cancelledAt: number[] = [];

  setValueAtTime(value: number, time: number): void {
    this.setAtTime.push({ value, at: time });
    this.value = value;
  }

  exponentialRampToValueAtTime(value: number, time: number): void {
    this.exponential.push({ value, at: time });
    this.value = value;
  }

  linearRampToValueAtTime(value: number, time: number): void {
    this.linear.push({ value, at: time });
    this.value = value;
  }

  setTargetAtTime(value: number, time: number): void {
    this.exponential.push({ value, at: time });
    this.value = value;
  }

  cancelScheduledValues(time: number): void {
    this.cancelledAt.push(time);
  }
}

export class FakeGainNode {
  readonly gain = new FakeParam();
  readonly connectedTo: unknown[] = [];

  connect(target: unknown): unknown {
    this.connectedTo.push(target);
    return target;
  }

  disconnect(): void {
    this.connectedTo.length = 0;
  }
}

export class FakeOscillatorNode {
  type = "sine";
  readonly frequency = new FakeParam();
  readonly detune = new FakeParam();
  readonly connectedTo: unknown[] = [];
  readonly startedAt: number[] = [];
  readonly stoppedAt: number[] = [];

  connect(target: unknown): unknown {
    this.connectedTo.push(target);
    return target;
  }

  start(when = 0): void {
    this.startedAt.push(when);
  }

  stop(when = 0): void {
    this.stoppedAt.push(when);
  }
}

export class FakeAudioBuffer {
  constructor(readonly duration: number) {}
}

export class FakeBufferSource {
  buffer: FakeAudioBuffer | null = null;
  readonly detune = new FakeParam();
  readonly playbackRate = new FakeParam();
  readonly connectedTo: unknown[] = [];
  readonly startedAt: number[] = [];
  readonly stoppedAt: number[] = [];

  connect(target: unknown): unknown {
    this.connectedTo.push(target);
    return target;
  }

  start(when = 0): void {
    this.startedAt.push(when);
  }

  stop(when = 0): void {
    this.stoppedAt.push(when);
  }
}

/**
 * Contexto falso mínimo: registra todo lo que se crea y devuelve buffers con la
 * duración declarada en `decodeDurations` (por nombre de fichero o fija).
 */
export class FakeAudioContext {
  currentTime = 0;
  state = "running";
  readonly destination = { name: "destination" };
  readonly gains: FakeGainNode[] = [];
  readonly oscillators: FakeOscillatorNode[] = [];
  readonly bufferSources: FakeBufferSource[] = [];
  readonly decodedNames: string[] = [];

  createGain(): FakeGainNode {
    const gain = new FakeGainNode();
    this.gains.push(gain);
    return gain;
  }

  createOscillator(): FakeOscillatorNode {
    const osc = new FakeOscillatorNode();
    this.oscillators.push(osc);
    return osc;
  }

  createBufferSource(): FakeBufferSource {
    const source = new FakeBufferSource();
    this.bufferSources.push(source);
    return source;
  }

  decodeAudioData(data: ArrayBuffer): Promise<FakeAudioBuffer> {
    this.decodedNames.push(String(data.byteLength));
    return Promise.resolve(new FakeAudioBuffer(data.byteLength / 1000));
  }

  async close(): Promise<void> {
    this.state = "closed";
  }

  /** Castea el doble al tipo real para poder pasarlo a las funciones bajo test. */
  asAudioContext(): AudioContext {
    return this as unknown as AudioContext;
  }

  asGainNode(node: FakeGainNode): GainNode {
    return node as unknown as GainNode;
  }
}

/**
 * `fetch` falso: `routes[url]` es el JSON de la respuesta, o `{ json, bytes }`
 * si además se quiere controlar el tamaño del arrayBuffer (los tests lo usan para
 * identificar qué fichero se ha decodificado por su duración). Registra las URLs.
 */
export function fakeFetch(routes: Record<string, unknown>): {
  fetchImpl: typeof fetch;
  requested: string[];
} {
  const requested: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    requested.push(url);
    const route = routes[url];
    if (route === undefined) {
      return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
    }
    const body = (route as { json?: unknown }).json ?? route;
    const bytes = (route as { bytes?: number }).bytes ?? 8;
    return {
      ok: true,
      status: 200,
      json: async () => body,
      arrayBuffer: async () => new ArrayBuffer(bytes),
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { fetchImpl, requested };
}
