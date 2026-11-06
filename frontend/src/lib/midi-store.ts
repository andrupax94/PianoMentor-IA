// description: Almacén del estado visible del teclado MIDI (B-035): soporte del navegador, permiso, número y nombre del primer teclado conectado, con cambios por hot-plug.
// context: TransportProvider sincroniza aquí lo que obtiene de Web MIDI; MidiStatus (AppHeader) consume este almacén para mostrar un estado honesto (sin soporte / denegado / sin teclado / conectado con nombre). Vive en memoria, estilo pc-keyboard-store/session-store.

import type { MidiAccessLike, MidiInputLike } from "./web-midi";

/** Permiso de Web MIDI. */
export type MidiPermission = "granted" | "denied" | "unknown";

/** Fotografía del estado MIDI visible. */
export interface MidiState {
  supported: boolean;
  isSupported: boolean;
  permission: MidiPermission;
  permissionState: MidiPermission;
  inputCount: number;
  inputs: number;
  count: number;
  firstName: string | null;
  name: string | null;
  keyboardName: string | null;
  deviceName: string | null;
  firstKeyboardName: string | null;
  connected: boolean;
  isConnected: boolean;
}

/** Fotografía inicial: sin soporte conocido, como pinta el servidor. */
export const EMPTY_MIDI: MidiState = {
  supported: false,
  isSupported: false,
  permission: "unknown",
  permissionState: "unknown",
  inputCount: 0,
  inputs: 0,
  count: 0,
  firstName: null,
  name: null,
  keyboardName: null,
  deviceName: null,
  firstKeyboardName: null,
  connected: false,
  isConnected: false,
};

export const EMPTY_MIDI_STATE = EMPTY_MIDI;
export const EMPTY_MIDI_STATUS = EMPTY_MIDI;

let current: MidiState = EMPTY_MIDI;
const listeners = new Set<() => void>();

export function getMidiState(): MidiState {
  return current;
}
export function getMidiStatus(): MidiState {
  return current;
}
export function getMidiSnapshot(): MidiState {
  return current;
}

export function subscribeMidi(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export const subscribeMidiState = subscribeMidi;
export const subscribeMidiStatus = subscribeMidi;
export const subscribeMidiSnapshot = subscribeMidi;

function normalize(patch: Partial<MidiState>): MidiState {
  const supported = patch.supported ?? patch.isSupported ?? current.supported;
  const permission = patch.permission ?? patch.permissionState ?? current.permission;
  const inputCount =
    patch.inputCount ?? patch.inputs ?? patch.count ?? current.inputCount;
  const firstName =
    patch.firstName ??
    patch.name ??
    patch.keyboardName ??
    patch.deviceName ??
    patch.firstKeyboardName ??
    current.firstName;
  const connected = inputCount > 0 && permission === "granted";
  return {
    supported,
    isSupported: supported,
    permission,
    permissionState: permission,
    inputCount,
    inputs: inputCount,
    count: inputCount,
    firstName,
    name: firstName,
    keyboardName: firstName,
    deviceName: firstName,
    firstKeyboardName: firstName,
    connected,
    isConnected: connected,
  };
}

export function publishMidi(next: MidiState | Partial<MidiState>): void {
  const normalized = normalize(next);
  if (
    normalized.supported === current.supported &&
    normalized.permission === current.permission &&
    normalized.inputCount === current.inputCount &&
    normalized.firstName === current.firstName
  ) {
    return;
  }
  current = normalized;
  for (const listener of listeners) listener();
}

export function updateMidi(patch: Partial<MidiState>): void {
  publishMidi({ ...current, ...patch });
}
export const setMidiState = updateMidi;
export const setMidiStatus = updateMidi;
export const patchMidi = updateMidi;

export function resetMidi(): void {
  current = EMPTY_MIDI;
  listeners.clear();
}
export const resetMidiState = resetMidi;
export const resetMidiStatus = resetMidi;

export function getMidiInputs(access: MidiAccessLike | null | undefined): MidiInputLike[] {
  if (!access) return [];
  const inputs: MidiInputLike[] = [];
  try {
    access.inputs.forEach((input) => inputs.push(input));
  } catch {
    return [];
  }
  return inputs;
}

export function midiStateFromAccess(
  access: MidiAccessLike | null | undefined,
  supported: boolean = true,
  permission: MidiPermission = access ? "granted" : "denied",
): MidiState {
  const inputs = getMidiInputs(access ?? null);
  const firstName = inputs.length > 0 ? (inputs[0].name ?? null) : null;
  return normalize({
    supported,
    isSupported: supported,
    permission,
    permissionState: permission,
    inputCount: inputs.length,
    inputs: inputs.length,
    count: inputs.length,
    firstName,
    name: firstName,
    keyboardName: firstName,
    deviceName: firstName,
    firstKeyboardName: firstName,
  });
}

export function syncMidiFromAccess(
  access: MidiAccessLike | null | undefined,
  supported: boolean = true,
): void {
  const permission: MidiPermission = access ? "granted" : supported ? "denied" : "unknown";
  updateMidi(midiStateFromAccess(access, supported, permission));
}
export const publishMidiAccess = syncMidiFromAccess;
export const updateMidiFromAccess = syncMidiFromAccess;