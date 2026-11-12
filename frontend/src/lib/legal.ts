// description: Metadatos de los documentos legales publicados (P-001).
// context: La versión y la fecha se usan en las páginas públicas y en el registro (terms_version).

/** Versión vigente de los documentos legales (Términos y Privacidad). */
export const LEGAL_VERSION = "1.0";

/** Fecha de publicación de la versión vigente (ISO YYYY-MM-DD). */
export const LEGAL_PUBLISHED_AT = "2026-11-12";

/** Texto corto para mostrar la versión en la UI. */
export function legalVersionLabel(): string {
  return `${LEGAL_VERSION} (${LEGAL_PUBLISHED_AT})`;
}
