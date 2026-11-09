// description: Lógica pura del informe de práctica (B-033.3, dev-only): texto de error amable por código (session_not_found → «no hay señales aún»), formateo del JSON con sangría legible y el nombre de archivo. La descarga vive en snapshot-pack desde B-033.5: baja el paquete .zip (informe + registro + grabación + LÉEME), no el JSON suelto.
// context: El informe (trío PracticeReport) vive en el panel« Depurar» de SessionDebug y solo se empaqueta en dev; lo puro y testeable de él (errores, formato, nombre) vive aquí al estilo de lib, así los tests de Vitest en entorno node lo cubren sin DOM.

import { ApiError, type PracticeReport } from "./api-client";

/**
 * Mensaje de error del informe. El 404 estable (`session_not_found`) no es un
 * fallo a la vista del alumno: es una sesión sin señales de práctica todavía,
 * y se dice así (como el aviso «No hay sesión activa» de la pestaña Depurar).
 */
export function practiceReportErrorText(failure: unknown): string {
  if (failure instanceof ApiError && failure.code === "session_not_found") {
    return "Esta sesión todavía no ha registrado señales de práctica: no hay informe que mostrar.";
  }
  if (failure instanceof ApiError) return failure.message;
  return "No se pudo pedir el informe de la sesión. Inténtalo de nuevo.";
}

/** El informe tal cual viaja, con sangría legible y sin fantasías de resaltado (v1). */
export function formatPracticeReport(report: PracticeReport): string {
  return JSON.stringify(report, null, 2);
}

// B-033.5: la descarga .json suelto se retiró — el pack del zip (snapshot-pack)
// nombrado packageName() es la única vía de salida al disco.
