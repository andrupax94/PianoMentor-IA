// description: Lógica pura del informe de práctica (B-033.3, dev-only): texto de error amable por código (session_not_found → «no hay señales aún»), formateo del JSON con sangría legible, nombre del archivo de descarga y la descarga en sí (blob + ancla; función DOM, solo se llama desde el componente).
// context: El componente PracticeReport vive en MentorChat/PracticeReport y solo se empaqueta en dev; lo puro y testeable de él (errores, formato, nombre) vive aquí al estilo de lib, así los tests de Vitest en entorno node lo cubren sin DOM.

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

/** Nombre del `.json` a descargar, con el id de la sesión. */
export function practiceReportFilename(report: PracticeReport): string {
  return `practice-report-${report.session.session_id}.json`;
}

/**
 * Descarga el informe `.json`. Es la única pieza con DOM (blob + ancla) y se
 * llama desde el clic del botón; si el navegador la bloquea, queda copiar.
 */
export function downloadPracticeReport(report: PracticeReport): void {
  const blob = new Blob([formatPracticeReport(report)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = practiceReportFilename(report);
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
