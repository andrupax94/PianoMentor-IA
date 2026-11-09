// description: Tests de los helpers puros del informe de práctica (B-033.3): texto de error amable del 404 estable (session_not_found describe la sesión sin señales), paso del mensaje del ApiError, genérico fuera de ApiError y formateo con sangría de 2. La descarga del paquete .zip (B-033.5) se prueba en snapshot-pack.test.ts.
// context: Puro y sin DOM, al estilo de los demás tests de lib; la descarga (blob + ancla) nace en snapshot-pack y no se toca aquí.

import { describe, expect, it } from "vitest";

import { ApiError, type PracticeReport } from "./api-client";
import {
  formatPracticeReport,
  practiceReportErrorText,
} from "./practice-report";

describe("practiceReportErrorText", () => {
  it("trata el 404 estable como ausencia de señales, no como fallo (B-033.3)", () => {
    const failure = new ApiError("session_not_found", "No existe la sesión: unidad", 404);

    expect(practiceReportErrorText(failure)).toBe(
      "Esta sesión todavía no ha registrado señales de práctica: no hay informe que mostrar.",
    );
  });

  it("deja el mensaje del ApiError tal cual para cualquier otro código", () => {
    const failure = new ApiError("network_error", "No se pudo conectar con el servicio.", null);

    expect(practiceReportErrorText(failure)).toBe("No se pudo conectar con el servicio.");
  });

  it("cae al genérico si el fallo no es del cliente API", () => {
    expect(practiceReportErrorText(new TypeError("boom"))).toBe(
      "No se pudo pedir el informe de la sesión. Inténtalo de nuevo.",
    );
  });
});

describe("formatPracticeReport", () => {
  it("imprime el informe con sangría de 2, orden estable de claves y sin resaltado", () => {
    const report = {
      session: { session_id: "unidad", signal_count: 1 },
      by_measure: [],
      agent_decisions: [],
      signals: { total: 0, returned: 0, truncated: false, items: [] },
      evaluation: null,
      generated_at: "2026-11-08T10:00:00+00:00",
    } as unknown as PracticeReport;

    expect(formatPracticeReport(report)).toBe(
      JSON.stringify(report, null, 2),
    );
    expect(formatPracticeReport(report).split("\n")[1] ?? "").toContain(`"session"`);
  });
});
