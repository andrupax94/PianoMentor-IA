// description: Importación del paquete .zip del informe para la pestaña LLM de Depurar (B-033.6): descomprime el zip en el navegador con readStoreZip (nuestros paquetes son STORE), lee SOLO informe.json — el grabacion.wav no se interpreta y no sale del navegador, y registro.txt no viaja — y valida que sea un informe de práctica (session + summary con señales) antes de alimentar el mismo pipeline de interpretación de B-033.4.
// context: B-033.6; el zip puede contener cualquier cosa (el usuario lo elige), así que nada se fía: techo de 1 MB por el JSON, parseo defensivo y error amable con código estable por camino. La lectura del blob (arrayBuffer) es la única parte con navegador; el resto es puro y testeado en node.

import type { PracticeReport } from "./api-client";
import { readStoreZip } from "./zip";

/** La ficha que la pestaña LLM muestra del paquete importado (decisión del usuario: rotulada, no confundible con la sesión activa). */
export interface FichaPaquete {
  sessionId: string;
  pieceTitle: string | null;
  /** Señales que el evaluador va a leer (summary.signals del informe). */
  senales: number;
  /** Fecha del informe servido (generated_at del backend). */
  generadoEn: string;
}

/** Resultado de la importación: o el informe listo para el pipeline o un error amable. */
export type ResultadoImportacion =
  | { ok: true; informe: PracticeReport; ficha: FichaPaquete }
  | { ok: false; mensaje: string };

/** Techo del informe.json descomprimido: un informe truncado ronda cientos de kB; un MP4 travestido no pasa. */
export const TECHO_INFORME_BYTES = 1_000_000;

/** Guarda de forma: session con id y summary con señales — lo mínimo que el pipeline toca. */
export function esInformeDePractica(datos: unknown): datos is PracticeReport {
  if (typeof datos !== "object" || datos === null) return false;
  const informe = datos as PracticeReport;
  if (typeof informe.session?.session_id !== "string") return false;
  if (typeof informe.summary?.signals !== "number") return false;
  return true;
}

/**
 * Lee el paquete elegido: descomprime, busca informe.json y valida. Los
 * mensajes van al aula: qué pasó y qué hacer (re-descargar el paquete sin
 * tocarlo) — sin códigos ni trazas.
 */
export async function importarPaquete(blob: Blob): Promise<ResultadoImportacion> {
  let entradas: Array<{ name: string; data: Uint8Array }>;
  try {
    entradas = readStoreZip(new Uint8Array(await blob.arrayBuffer()));
  } catch {
    return {
      ok: false,
      mensaje:
        "El fichero no es un paquete del informe legible (o fue re-comprimido tras descargarlo): " +
        "descárgalo de nuevo desde Depurar → Informe y tráelo tal cual.",
    };
  }
  const entrada = entradas.find((item) => item.name === "informe.json");
  if (!entrada) {
    return {
      ok: false,
      mensaje: "El paquete no lleva informe.json: usa un paquete descargado desde Depurar → Informe.",
    };
  }
  if (entrada.data.length > TECHO_INFORME_BYTES) {
    return {
      ok: false,
      mensaje: `El informe.json del paquete pesa ${Math.round(entrada.data.length / 1024)} kB (techo 1000 kB): no es un informe de la casa.`,
    };
  }
  let datos: unknown;
  try {
    datos = JSON.parse(new TextDecoder().decode(entrada.data));
  } catch {
    return {
      ok: false,
      mensaje: "El informe.json del paquete no se puede leer como JSON: el paquete está dañado — re-descárgalo.",
    };
  }
  if (!esInformeDePractica(datos)) {
    return {
      ok: false,
      mensaje: "El informe.json del paquete no es un informe de práctica (le faltan session o summary).",
    };
  }
  const informe = datos;
  return {
    ok: true,
    informe,
    ficha: {
      sessionId: informe.session.session_id,
      pieceTitle: informe.session.piece_title,
      senales: informe.summary.signals,
      generadoEn: informe.generated_at,
    },
  };
}
