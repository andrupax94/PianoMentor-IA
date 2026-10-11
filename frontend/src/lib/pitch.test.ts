// description: Tests del mapeo pitch ↔ id de tecla, con barrido contra el asset.
// context: Criterio de B-007.1; el asset se lee del disco (vitest corre en node).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { isKeyInRange, keyIdToPitch, pitchToKeyId } from "./pitch";

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSET = join(HERE, "..", "..", "assets", "piano_virtual_88_pressed.svg");

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
