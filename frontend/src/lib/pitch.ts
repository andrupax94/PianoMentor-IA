// description: Mapeo pitch MIDI ↔ id de tecla del asset SVG.
// context: B-007.1; puro y testeable, incluye barrido contra el asset.

const NAMES = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"] as const;

/** pitch MIDI (21–108) → id del asset (ej. 60 → "c4"). */
export function pitchToKeyId(pitch: number): string {
  const rounded = Math.round(pitch);
  const semitone = ((rounded % 12) + 12) % 12;
  return `${NAMES[semitone]}${Math.floor(rounded / 12) - 1}`;
}

/** Inversa: id ("c#1") → pitch. null si el formato no vale. */
export function keyIdToPitch(id: string): number | null {
  const match = /^([a-g])(#?)(\d+)$/.exec(id);
  if (!match) return null;
  const base = NAMES.indexOf(`${match[1]}${match[2]}` as (typeof NAMES)[number]);
  if (base < 0) return null;
  const octave = Number(match[3]);
  if (!Number.isInteger(octave)) return null;
  return (octave + 1) * 12 + base;
}

/** true si id está en [fromId, toId] en orden de semitonos. */
export function isKeyInRange(id: string, fromId: string, toId: string): boolean {
  const pitch = keyIdToPitch(id);
  const from = keyIdToPitch(fromId);
  const to = keyIdToPitch(toId);
  if (pitch === null || from === null || to === null) return false;
  return pitch >= Math.min(from, to) && pitch <= Math.max(from, to);
}

/** Teclas blancas del rango [fromId, toId], bordes incluidos (0 si el id no vale). */
export function countWhiteKeys(fromId: string, toId: string): number {
  const from = keyIdToPitch(fromId);
  const to = keyIdToPitch(toId);
  if (from === null || to === null) return 0;
  const lowest = Math.min(from, to);
  const highest = Math.max(from, to);
  let count = 0;
  for (let pitch = lowest; pitch <= highest; pitch += 1) {
    if (!pitchToKeyId(pitch).includes("#")) count += 1;
  }
  return count;
}
