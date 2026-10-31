// description: Adaptador de Web MIDI (B-032.2): traduce los mensajes de los teclados conectados a note_on/note_off del puerto de entrada, con detección de soporte y sin dependencia del DOM para poder probarlo con un MIDIAccess falso.
// context: El navegador expone `navigator.requestMIDIAccess`; el pitch MIDI es el mismo número que usa el proyecto (`pitchToKeyId(60) === "c4"`). Se entrega sin probar con hardware (no hay cable USB-B): el día que lo haya, el adaptador ya está.

/** Mensaje tal y como lo entrega un `MIDIInput` (`event.data`). */
export interface MidiMessageLike {
  data: ArrayLike<number>;
  /** Marca del hardware en milisegundos; el navegador la rellena. */
  timeStamp?: number;
}

/** Subconjunto de `MIDIInput` que se usa. */
export interface MidiInputLike {
  id?: string;
  name?: string | null;
  onmidimessage: ((event: MidiMessageLike) => void) | null;
}

/** Subconjunto de `MIDIInputMap` y `MIDIAccess` que se usan. */
export interface MidiAccessLike {
  inputs: { forEach(callback: (input: MidiInputLike) => void): void };
  onstatechange: (() => void) | null;
}

/** Nota traducida de un mensaje MIDI. */
export interface ParsedMidiEvent {
  type: "note_on" | "note_off";
  pitch: number;
  velocity: number;
}

/** Evento que el adaptador entrega al puerto de entrada. */
export interface WebMidiNote {
  type: "note_on" | "note_off";
  pitch: number;
  velocity: number;
  /** `timeStamp` del mensaje, si el navegador lo trae. */
  t_ms?: number;
}

/**
 * Traduce un mensaje MIDI a una nota, o null si no lo es.
 *
 * Acepta cualquier canal (status `0x90`/`0x80` en sus 16 variantes) e ignora
 * el resto: pedal (CC64), aftertouch y mensajes de sistema quedan fuera de
 * B-032.2. Un `note_on` con velocity 0 es un `note_off`, como manda el estándar.
 */
export function parseMidiMessage(data: ArrayLike<number>): ParsedMidiEvent | null {
  if (!data || data.length < 3) return null;
  const status = data[0] & 0xf0;
  const pitch = data[1];
  const velocity = data[2];
  if (!Number.isFinite(pitch) || pitch < 0 || pitch > 127) return null;
  if (!Number.isFinite(velocity) || velocity < 0 || velocity > 127) return null;

  if (status === 0x90 && velocity > 0) return { type: "note_on", pitch, velocity };
  if (status === 0x90 || status === 0x80) {
    return { type: "note_off", pitch, velocity: 0 };
  }
  return null;
}

/**
 * Engancha todos los teclados conectados y avisa de cada nota. Vuelve a
 * engancharlos cuando el navegador avisa de un cambio de dispositivos.
 * Devuelve la función para desconectar.
 */
export function connectWebMidi(
  access: MidiAccessLike,
  onNote: (note: WebMidiNote) => void,
): () => void {
  const handler = (event: MidiMessageLike) => {
    const parsed = parseMidiMessage(event.data);
    if (!parsed) return;
    const note: WebMidiNote = parsed;
    if (typeof event.timeStamp === "number" && Number.isFinite(event.timeStamp)) {
      note.t_ms = event.timeStamp;
    }
    onNote(note);
  };

  const bindInputs = () => {
    access.inputs.forEach((input) => {
      input.onmidimessage = handler;
    });
  };

  bindInputs();
  access.onstatechange = bindInputs;

  return () => {
    access.onstatechange = null;
    access.inputs.forEach((input) => {
      if (input.onmidimessage === handler) input.onmidimessage = null;
    });
  };
}

/** Navegador con la API opcional; así se puede inyectar un doble en tests. */
export interface MidiCapableNavigator {
  requestMIDIAccess?: () => Promise<MidiAccessLike>;
}

/**
 * Pide acceso a Web MIDI. Devuelve null si el navegador no lo soporta o si el
 * usuario lo deniega: la práctica sigue funcionando con PC y piano en pantalla.
 */
export async function requestWebMidi(
  navigatorLike: MidiCapableNavigator | undefined = typeof navigator === "undefined"
    ? undefined
    : (navigator as unknown as MidiCapableNavigator),
): Promise<MidiAccessLike | null> {
  if (!navigatorLike?.requestMIDIAccess) return null;
  try {
    return await navigatorLike.requestMIDIAccess();
  } catch {
    return null;
  }
}
