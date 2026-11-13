// description: Tests del flag de subida de MIDI (B-023): la lógica pura midiUploadEnabled — enabled por defecto (valor ausente o "true"/"1"), disabled solo con "false" exacto — y el contrato de la constante de build.
// context: Flag de BUILD: NEXT_PUBLIC_ENABLE_MIDI_UPLOAD viaja inline en el bundle, así que los tests no pueden retocarlo en caliente; lo que se fija es la función que lo interpreta y que la constante es booleana.

import { describe, expect, it } from "vitest";

import { MIDI_UPLOAD_ENABLED, midiUploadEnabled } from "./feature-flags";

describe("midiUploadEnabled", () => {
  it("habilita la subida por defecto: ausente, vacío o true", () => {
    expect(midiUploadEnabled(undefined)).toBe(true);
    expect(midiUploadEnabled("")).toBe(true);
    expect(midiUploadEnabled("true")).toBe(true);
    expect(midiUploadEnabled("1")).toBe(true);
  });

  it("deshabilita solo con el valor exacto false", () => {
    expect(midiUploadEnabled("false")).toBe(false);
    expect(midiUploadEnabled("False")).toBe(true); // Vercel/Next no normaliza: solo "false" exacto
  });
});

describe("MIDI_UPLOAD_ENABLED", () => {
  it("es un booleano constante de build", () => {
    expect(typeof MIDI_UPLOAD_ENABLED).toBe("boolean");
  });
});
