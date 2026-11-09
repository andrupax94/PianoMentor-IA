// description: Tests del codificador WAV mono 16-bit, del ZIP mínimo y del paquete del informe (B-033.5): crc32 con vectores conocidos, cabecera RIFF/WAVE/fmt/data con tamaños coherentes, acotado del rango y cuantización a 16 bits, loop del zip (STORE + orden + CRC verificable con readStoreZip), el nombre del paquete con tildes fuera y la selección de ficheros (solo existen los que hay; el LÉEME siempre).
// context: Puro y sin DOM: los bytes se verifican con los propios helpers de lib (readStoreZip) y vectores de CRC-32 IEEE fijados a mano.

import { describe, expect, it } from "vitest";

import { buildPackage, leemeText, packageName } from "./snapshot-pack";
import type { PackageParts } from "./snapshot-pack";
import { clippedSample, downmixToMono, encodeWav16BitMono, WAV_HEADER_BYTES } from "./wav";
import { crc32, readStoreZip } from "./zip";

const ascii = (text: string) => new TextEncoder().encode(text);

describe("crc32", () => {
  it("clava los vectores conocidos del CRC-32 IEEE", () => {
    expect(crc32(ascii(""))).toBe(0);
    expect(crc32(ascii("ab"))).toBe(0x9e83486d);
    expect(crc32(ascii("abc"))).toBe(0x352441c2);
    expect(crc32(ascii("lawrence"))).toBe(0x672befb2);
  });
});

describe("encodeWav16BitMono", () => {
  it("la cabecera está completa y los tamaños cuadran", () => {
    const bytes = encodeWav16BitMono(new Float32Array([0.5, -0.5, 0]), 44100);
    const text = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
    expect(text(0, 4)).toBe("RIFF");
    expect(text(8, 12)).toBe("WAVE");
    expect(text(12, 16)).toBe("fmt ");
    expect(text(36, 40)).toBe("data");
    expect(bytes.length).toBe(WAV_HEADER_BYTES + 6); // 3 muestras × 2 bytes
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(4, true)).toBe(WAV_HEADER_BYTES + 6 - 8);
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint16(32, true)).toBe(2); // block align: 1 canal × 2 bytes
    expect(view.getUint16(34, true)).toBe(16); // bits por muestra
    expect(view.getUint32(40, true)).toBe(6); // tamaño del data
  });

  it("acota el rango y cuantiza a 16 bits", () => {
    const bytes = encodeWav16BitMono(new Float32Array([2, -2, 0.5]), 8000);
    const view = new DataView(bytes.buffer);
    expect(view.getInt16(WAV_HEADER_BYTES + 0, true)).toBe(32767);
    expect(view.getInt16(WAV_HEADER_BYTES + 2, true)).toBe(-32767);
    expect(view.getInt16(WAV_HEADER_BYTES + 4, true)).toBe(Math.round(0.5 * 32767));
  });

  it("downmix: n canales → promedio", () => {
    const mixed = downmixToMono([
      new Float32Array([1, 0]),
      new Float32Array([0, 0.5]),
    ]);
    expect(Array.from(mixed)).toEqual([0.5, 0.25]);
  });

  it("clippedSample acota sin inventar", () => {
    expect(clippedSample(2)).toBe(1);
    expect(clippedSample(Number.NaN)).toBe(0);
    expect(clippedSample(-0.2)).toBe(-0.2);
  });
});

const PARTS: PackageParts = {
  informeJson: '{"session":{"session_id":"s-1","piece_id":"p15"}}',
  registroLineas: ["robot lanzado: perfecta", "gate g1 → acierto · compás 0"],
  grabacion: null,
  contexto: { sessionId: "s-1", pieceTitle: "Prelude in A major", escenario: "perfecta" },
};

describe("packageName", () => {
  it("pieza sin tildes ni espacios y con fecha del día", () => {
    const name = packageName("Prelude in A major");
    expect(name.startsWith("informe-prelude-in-a-major-")).toBe(true);
    expect(name.endsWith(".zip")).toBe(true);
    expect(name).not.toContain(" ");
  });
  it("sin título cae en pieza", () => {
    expect(packageName(null)).toMatch(/^informe-pieza-/);
  });
});

describe("buildPackage", () => {
  it("el zip se lee de vuelta con el mismo contenido y orden", async () => {
    const zip = await buildPackage(PARTS, 1_700_000_000_000);
    const entries = readStoreZip(zip).map((e) => e.name);
    expect(entries).toEqual(["informe.json", "registro.txt", "LÉEME.md"]);

    const informe = readStoreZip(zip)[0];
    expect(new TextDecoder().decode(informe.data)).toBe(PARTS.informeJson);
    const registro = new TextDecoder().decode(readStoreZip(zip)[1].data).split("\n");
    expect(registro).toEqual(PARTS.registroLineas);
  });

  it("con grabación incluye grabacion.wav al final de todo", async () => {
    const parts = { ...PARTS, grabacion: new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" }) };
    const entries = readStoreZip(await buildPackage(parts, 1_700_000_000_000));
    expect(entries.map((e) => e.name)).toEqual(["informe.json", "registro.txt", "LÉEME.md", "grabacion.wav"]);
    expect(Array.from(entries[3].data)).toEqual([1, 2, 3]);
  });

  it("sin registro por abajo (vacío) el zip sale con el resto", async () => {
    const zip = await buildPackage({ ...PARTS, registroLineas: [] }, 1_700_000_000_000);
    expect(readStoreZip(zip).map((e) => e.name)).toEqual(["informe.json", "LÉEME.md"]);
  });

  it("el LÉEME explica los cuatro ficheros y los avisos con el contexto", async () => {
    const zip = await buildPackage(PARTS);
    const leeme = new TextDecoder().decode(readStoreZip(zip).find((e) => e.name === "LÉEME.md")!.data);
    expect(leeme).toContain("informe.json");
    expect(leeme).toContain("registro.txt");
    expect(leeme).toContain("grabacion.wav");
    expect(leeme).toContain("LÉEME.md");
    expect(leeme).toContain("temporal y local");
    expect(leeme).toContain("perfecta");
    expect(leeme).toContain("Prelude in A major");
  });

  it("leemeText sin sesión lo dice sin inventar datos", () => {
    const text = leemeText({ ...PARTS, contexto: { sessionId: null, pieceTitle: null, escenario: null } });
    expect(text).toContain("sin sesión de práctica activa");
    expect(text).toContain("sin título");
  });
});
