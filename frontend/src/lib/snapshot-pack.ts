// description: El paquete descargable del informe (B-033.5): snapshot-package monta el .zip con los cuatro ficheros pedidos — informe.json (el informe consolidado con la evaluación y el summary), registro.txt (las líneas del Registro, robot + IA + trazas [audio]), grabacion.wav (la grabación rec si existe) y LÉEME.md (qué es cada cosa, contexto y avisos). Puro salvo la lectura del blob del audio, testeado en node.
// context: B-033.5; la matemática del zip vive en zip.ts, el WAV en wav.ts, la grabación en practice-recorder: aquí solo se ensambla el paquete y se redacta el LÉEME. El nombre del archivo sale de la pieza y de la fecha, como el del informe de B-033.3.

import { buildStoreZip, type ZipEntry } from "./zip";

/** Materiales disponibles al descargar: lo que haya, cuando lo haya. */
export interface PackageParts {
  /** El informe consolidado ya exportado (texto JSON con los datos servidos). */
  informeJson: string | null;
  /** Líneas del Registro tal cual (robot, gates, IA y trazas [audio]). */
  registroLineas: readonly string [];
  /** El WAV de la grabación rec; null si no hay (rec apagada o nada sonó). */
  grabacion: Blob | null;
  /** Contexto para el LÉEME: id de sesión, pieza y escenario del robot. */
  contexto: { sessionId: string | null; pieceTitle: string | null; escenario: string | null };
}

/** El nombre de fichero del paquete: informe-<pieza-limpia>-<fecha>.zip */
export function packageName(pieceTitle: string | null): string {
  const hoy = new Date();
  const fecha = `${hoy.getFullYear()}${String(hoy.getMonth() + 1).padStart(2, "0")}${String(hoy.getDate()).padStart(2, "0")}`;
  const pieza =
    (pieceTitle ?? "pieza")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // tildes fuera: los ficheros viajan mejor
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "pieza";
  return `informe-${pieza}-${fecha}.zip`;
}

/** El LÉEME del paquete: qué es cada fichero, de dónde viene y con qué avisos. */
export function leemeText(parts: PackageParts): string {
  const { sessionId, pieceTitle, escenario } = parts.contexto;
  return `# Paquete de sesión de práctica (PianoMentor AI)

Paquete generado desde el menú de depuración (dev-only) del panel de estado.
Contiene lo observado en una sesión de práctica, pensado para revisarlo con
la IA o con tu profesor.

## Qué contiene

- **informe.json** — el informe consolidado de la sesión tal como lo sirve el
  backend (${sessionId ?? "sin sesión de práctica activa"}): bloque de sesión y
  pieza (${pieceTitle ?? "sin título"}), agregación por compás de las señales de
  práctica, intervenciones del agente en orden, la evaluación compacta de la
  interpretación y los destacados \`summary\` que traduce el chat${
    escenario ? ` — la sesión se practicó con el escenario del robot «${escenario}»` : ""
  }.
- **registro.txt** — las líneas del Registro del menú de depuración en el
  orden en que llegaron: señales de práctica (gate → resultado), teclas del
  robot, intervenciones de la IA y, si la «Traza de audio» estaba activa, el
  rastro del sampler/transporte (líneas \`[audio]\`).
- **grabacion.wav** — lo que sonó de verdad en esa práctica, grabado desde el
  propio audio del navegador (el interruptor rec del panel Registro). Formato
  WAV mono 16-bit. **Solo viene si rec estaba encendido y sonó algo de la
  IA**; si aquí no está, es que no había grabación.
- **LÉEME.md** — este fichero.

## Avisos

- Todo es **temporal y local**: la grabación vive solo en la memoria de la
  pestaña (una recarga la borra) y nada de este paquete se envía a ningún
  servidor — se baja directo al equipo.
- El informe.json es una fotografía del momento de la descarga: si después
  siguió la práctica, re-descarga el paquete.
- Es material dev-only y de diagnóstico: se usa para leer tu práctica (o la
  del robot) con contexto, no para entrenar ni enviar nada.
`;
}

/** Ensamblo el zip: cada fichero solo si existe; el LÉEME siempre. */
export async function buildPackage(parts: PackageParts, dateMs = Date.now()): Promise<Uint8Array> {
  const entries: ZipEntry[] = [];
  if (parts.informeJson !== null) {
    entries.push({ name: "informe.json", data: parts.informeJson });
  }
  if (parts.registroLineas.length > 0) {
    entries.push({ name: "registro.txt", data: parts.registroLineas.join("\n") });
  }
  const leeme = leemeText(parts);
  entries.push({ name: "LÉEME.md", data: leeme });
  // La grabación va en último lugar y solo si existe; se lee su WAV como bytes.
  if (parts.grabacion !== null) {
    entries.push({ name: "grabacion.wav", data: new Uint8Array(await parts.grabacion.arrayBuffer()) });
  }
  return buildStoreZip(entries, dateMs);
}

/**
 * Descarga el paquete (DOM-única del módulo): construye el zip y lo baja con
 * el mismo blob + ancla del informe .json de B-033.3. Bloqueado el clic por
 * el navegador queda la copia del informe como vía de salida.
 */
export async function downloadPackage(parts: PackageParts): Promise<void> {
  const bytes = await buildPackage(parts);
  const blob = new Blob([bytes as unknown as BlobPart], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = packageName(parts.contexto.pieceTitle);
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
