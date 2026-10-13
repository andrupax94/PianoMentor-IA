// description: Tests del mapeo pitch ↔ id de tecla, con barrido contra el asset.
// context: Criterio de B-007.1; el asset se lee del disco (vitest corre en node).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { countWhiteKeys, isKeyInRange, keyIdToPitch, pitchToKeyId } from "./pitch";

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSET = join(HERE, "..", "..", "public", "assets", "piano_virtual_88_pressed.svg");

function assetKeyIds(): string[] {
  const svg = readFileSync(ASSET, "utf-8");
  return [...svg.matchAll(/data-key-id="([^"]+)"/g)].map((match) => match[1]);
}

describe("pitchToKeyId", () => {
  it("acierta en bordes y centro (21→a0, 60→c4, 108→c8)", () => {
    expect(pitchToKeyId(21)).toBe("a0");
    expect(pitchToKeyId(60)).toBe("c4");
    expect(pitchToKeyId(61)).toBe("c#4");
    expect(pitchToKeyId(108)).toBe("c8");
  });

  it("cubre exactamente los 88 ids del asset", () => {
    const asset = assetKeyIds();
    expect(new Set(asset).size).toBe(88);
    const mapped = new Set<number>();
    for (let pitch = 21; pitch <= 108; pitch += 1) {
      mapped.add(pitch);
      expect(asset).toContain(pitchToKeyId(pitch));
    }
    expect(mapped.size).toBe(88);
  });
});

describe("keyIdToPitch", () => {
  it("invierte el mapeo y rechaza formatos inválidos", () => {
    expect(keyIdToPitch("c4")).toBe(60);
    expect(keyIdToPitch("a0")).toBe(21);
    expect(keyIdToPitch("c#1")).toBe(25);
    expect(keyIdToPitch("c8")).toBe(108);
    expect(keyIdToPitch("h4")).toBeNull();
    expect(keyIdToPitch("c")).toBeNull();
    expect(keyIdToPitch("")).toBeNull();
  });
});

describe("isKeyInRange", () => {
  it("compara por semitonos con bordes incluidos", () => {
    expect(isKeyInRange("c4", "c1", "c6")).toBe(true);
    expect(isKeyInRange("c1", "c1", "c6")).toBe(true);
    expect(isKeyInRange("c6", "c1", "c6")).toBe(true);
    expect(isKeyInRange("b0", "c1", "c6")).toBe(false);
    expect(isKeyInRange("c7", "c1", "c6")).toBe(false);
    expect(isKeyInRange("c4", "c6", "c1")).toBe(true);
    expect(isKeyInRange("nonsense", "c1", "c6")).toBe(false);
  });
});

describe("countWhiteKeys", () => {
  it("cuenta las blancas con los bordes incluidos", () => {
    // c1..b1 son 7 blancas y c2 cierra la octava siguiente: 8.
    expect(countWhiteKeys("c1", "c2")).toBe(8);
    expect(countWhiteKeys("c1", "c1")).toBe(1);
    expect(countWhiteKeys("c1", "b1")).toBe(7);
  });

  it("da lo mismo en cualquier orden de los extremos", () => {
    expect(countWhiteKeys("c1", "c6")).toBe(countWhiteKeys("c6", "c1"));
    expect(countWhiteKeys("a0", "c8")).toBe(52);
  });

  it("devuelve 0 si algún id no vale", () => {
    expect(countWhiteKeys("nonsense", "c6")).toBe(0);
    expect(countWhiteKeys("c1", "c")).toBe(0);
  });

  it("cuadra con la escalera de rangos responsive", () => {
    // Mismas cifras que usa resolveVisibleRange para estimar el ancho de tecla.
    expect(countWhiteKeys("c3", "c6")).toBe(22);
    expect(countWhiteKeys("c2", "c6")).toBe(29);
    expect(countWhiteKeys("c1", "c6")).toBe(36);
    expect(countWhiteKeys("c1", "c7")).toBe(43);
    expect(countWhiteKeys("c1", "c8")).toBe(50);
    // El piano completo tiene 52 blancas y 36 negras: 88 teclas.
    expect(countWhiteKeys("a0", "c8") + 36).toBe(88);
  });
});
