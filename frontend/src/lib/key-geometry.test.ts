// description: Tests de la geometría del teclado contra el asset real.
// context: Criterio de B-007.3; si cambia el SVG de diseño, el barrido falla y avisa.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { createKeyGeometry } from "./key-geometry";
import { keyIdToPitch } from "./pitch";

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSET = join(HERE, "..", "..", "public", "assets", "piano_virtual_88_pressed.svg");

/** Descuido del asset: esta negra mide 21 en vez de 24. Su centro sí es correcto. */
const ASSET_WIDTH_OUTLIER = "a#4";

interface AssetKey {
  id: string;
  pitch: number;
  x: number;
  width: number;
}

function assetKeys(): AssetKey[] {
  const svg = readFileSync(ASSET, "utf-8");
  const pattern =
    /data-key-id="([^"]+)"[\s\S]{0,400}?\bx="([\d.]+)"[\s\S]{0,120}?\bwidth="([\d.]+)"/g;
  return [...svg.matchAll(pattern)].map((match) => {
    const pitch = keyIdToPitch(match[1]);
    if (pitch === null) throw new Error(`Id de tecla ilegible: ${match[1]}`);
    return { id: match[1], pitch, x: Number(match[2]), width: Number(match[3]) };
  });
}

/**
 * Ventana del viewBox que dibuja SvgKeyboard, derivada del asset (sin tocar las
 * constantes del módulo): recorta a las teclas visibles con 8 u de margen.
 */
function assetWindow(keys: AssetKey[], fromKey: string, toKey: string) {
  const from = keyIdToPitch(fromKey);
  const to = keyIdToPitch(toKey);
  const lo = Math.min(from as number, to as number);
  const hi = Math.max(from as number, to as number);
  const whites = keys.filter((key) => !key.id.includes("#") && key.pitch >= lo && key.pitch <= hi);
  const min = Math.min(...whites.map((key) => key.x));
  const max = Math.max(...whites.map((key) => key.x + key.width));
  return { viewX: min - 8, viewWidth: max - min + 16 };
}

describe("createKeyGeometry", () => {
  const keys = assetKeys();

  it("el centro calculado coincide con el del asset en las 88 teclas", () => {
    const { viewX, viewWidth } = assetWindow(keys, "a0", "c8");
    const geometry = createKeyGeometry("a0", "c8");
    expect(keys).toHaveLength(88);
    for (const key of keys) {
      const assetCenter = key.x + key.width / 2;
      const expected = (assetCenter - viewX) / viewWidth;
      expect(geometry.centerFraction(key.pitch)).toBeCloseTo(expected, 4);
    }
  });

  it("el ancho distingue blancas y negras como el asset", () => {
    const { viewWidth } = assetWindow(keys, "a0", "c8");
    const geometry = createKeyGeometry("a0", "c8");
    const white = keyIdToPitch("c4") as number;
    const black = keyIdToPitch("c#4") as number;
    expect(geometry.widthFraction(white) * viewWidth).toBeCloseTo(38.4, 4);
    expect(geometry.widthFraction(black) * viewWidth).toBeCloseTo(24, 4);
  });

  it("documenta el único ancho descuadrado del asset (a#4 mide 21, no 24)", () => {
    const outlier = keys.find((key) => key.id === ASSET_WIDTH_OUTLIER);
    expect(outlier).toBeDefined();
    expect(outlier?.width).toBe(21);
    // Su centro sí es correcto: solo el ancho está mal en el diseño.
    const { viewX, viewWidth } = assetWindow(keys, "a0", "c8");
    const geometry = createKeyGeometry("a0", "c8");
    const center = (keyIdToPitch(ASSET_WIDTH_OUTLIER) as number);
    expect(geometry.centerFraction(center) * viewWidth + viewX).toBeCloseTo(1180, 4);
  });

  it("el inset del módulo equivale al margen real del recorte", () => {
    const { viewWidth } = assetWindow(keys, "a0", "c8");
    const geometry = createKeyGeometry("a0", "c8");
    expect(geometry.insetFraction * viewWidth).toBeCloseTo(8, 6);
  });

  it("cuenta las teclas blancas igual que la escalera responsive", () => {
    expect(createKeyGeometry("c3", "c6").whiteKeys).toBe(22);
    expect(createKeyGeometry("c1", "c6").whiteKeys).toBe(36);
    expect(createKeyGeometry("a0", "c8").whiteKeys).toBe(52);
  });

  it("los centros crecen con el pitch", () => {
    const geometry = createKeyGeometry("a0", "c8");
    let previous = -1;
    // Por pitch, no por orden en el SVG: el asset dibuja las blancas y luego las negras.
    for (let pitch = 21; pitch <= 108; pitch += 1) {
      const center = geometry.centerFraction(pitch);
      expect(center).toBeGreaterThan(previous);
      previous = center;
    }
  });
});
