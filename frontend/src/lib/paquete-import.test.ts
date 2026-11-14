// description: Tests de la importación del paquete .zip para la pestaña LLM (B-033.6): un paquete real de la casa (informe.json + grabacion.wav + LÉEME) se importa completo con su ficha, y cada camino de error amable — zip sin informe, JSON corrupto, fichero ajeno/re-comprimido, informe sobre el techo y JSON que no es informe de práctica — con el mensaje que la pestaña pinta.
// context: Puro salvo el blob (node ≥ 18 tiene Blob global): los zips de prueba se montan con buildStoreZip, el mismo escritor que produce los paquetes reales, así el round-trip es el de verdad.

import { describe, expect, it } from "vitest";

import type { PracticeReport } from "./api-client";
import { importarPaquete, TECHO_INFORME_BYTES } from "./paquete-import";
import { buildStoreZip } from "./zip";

const INFORME: PracticeReport = {
  session: {
    session_id: "s-paquete",
    piece_id: "p15",
    piece_title: "Prelude in A major",
    tempo: 120,
    status: "paused",
    control: "student",
    mode: "practice",
    hand: "both",
    created_at: "2026-11-14T10:00:00Z",
    first_signal_at: "2026-11-14T10:01:00Z",
    last_signal_at: "2026-11-14T10:03:00Z",
    practiced_s: 120,
    signal_count: 27,
  },
  by_measure: [],
  agent_decisions: [],
  summary: {
    signals: 27,
    active_measures: 5,
    distinct_gates: 6,
    practiced_s: 120,
    outcomes: { hit: 27 },
    hit_ratio: 1,
    worst_measures: [],
    dominant_failure: null,
    interventions: { count: 0, by_action: {}, by_reason: {} },
    evaluation: null,
  },
  signals: { total: 27, returned: 27, truncated: false, items: [] },
  evaluation: null,
  execution: {
    run: 1,
    last_gate_reached: null,
    last_measure_reached: null,
    duration_audio_s: null,
    signals_emitted_vs_persisted: null,
  },
  runs: [],
  generated_at: "2026-11-14T10:03:05Z",
};

function zipDeLaCasa(): Blob {
  return new Blob([
    buildStoreZip(
      [
        { name: "informe.json", data: JSON.stringify(INFORME) },
        { name: "registro.txt", data: "robot lanzado: perfecta" },
        { name: "LÉEME.md", data: "# Paquete" },
        { name: "grabacion.wav", data: new Uint8Array([1, 2, 3]) },
      ],
      1_700_000_000_000,
    ) as unknown as BlobPart,
  ]);
}

describe("importarPaquete", () => {
  it("un paquete de la casa se importa con su ficha (el WAV va dentro y no se toca)", async () => {
    const resultado = await importarPaquete(zipDeLaCasa());
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.ficha).toEqual({
      sessionId: "s-paquete",
      pieceTitle: "Prelude in A major",
      senales: 27,
      generadoEn: "2026-11-14T10:03:05Z",
    });
    expect(resultado.informe.summary.signals).toBe(27); // el mismo informe, sin re-calcular
  });

  it("un zip sin informe.json avisa de dónde bajar un paquete bueno", async () => {
    const zip = new Blob([buildStoreZip([{ name: "LÉEME.md", data: "# Paquete" }], 1) as unknown as BlobPart]);
    const resultado = await importarPaquete(zip);
    expect(resultado).toMatchObject({ ok: false });
    if (resultado.ok) return;
    expect(resultado.mensaje).toContain("informe.json");
    expect(resultado.mensaje).toContain("Depurar → Informe");
  });

  it("un informe.json corrupto pide re-descargar", async () => {
    const zip = new Blob([buildStoreZip([{ name: "informe.json", data: "{no es json" }], 1) as unknown as BlobPart]);
    const resultado = await importarPaquete(zip);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.mensaje).toContain("re-descárgalo");
  });

  it("un fichero ajeno (o re-comprimido, no STORE) pide re-descargar tal cual", async () => {
    const resultado = await importarPaquete(new Blob([new Uint8Array([80, 75, 3, 4, 1, 2, 3]) as unknown as BlobPart]));
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.mensaje).toContain("re-comprimido");
  });

  it("un informe sobre el techo no entra (no es un informe de la casa)", async () => {
    const grande = " ".repeat(TECHO_INFORME_BYTES + 1);
    const zip = new Blob([buildStoreZip([{ name: "informe.json", data: grande }], 1) as unknown as BlobPart]);
    const resultado = await importarPaquete(zip);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.mensaje).toContain("techo");
  });

  it("un JSON con otra forma no pasa por informe de práctica", async () => {
    const zip = new Blob([buildStoreZip([{ name: "informe.json", data: '{"hola": "mundo"}' }], 1) as unknown as BlobPart]);
    const resultado = await importarPaquete(zip);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.mensaje).toContain("no es un informe de práctica");
  });
});
