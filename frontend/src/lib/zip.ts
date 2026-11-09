// description: Escritor de ZIP mínimo (B-033.5): buildStoreZip compone un .zip válido sin compresión (método STORE, el formato que la especificación exige admitir a todo descompresor) a partir de ficheros con nombre y datos UTF-8. Puro y determinista, sin dependencias externas: el paquete del informe (evaluación + registro + grabación + LÉEME) no necesita jszip ni weigh de 100 kB.
// context: B-033.5; la matemática de bytes vive en src/lib, no en los componentes. Sin compresión también es determinista: mismo contenido y orden → mismo zip byte a byte. Los nombres van UTF-8 (flag提案 11) con separador '/', fecha DOS cifrada sobre la del paquete para que el orden dentro del zip sea estable.

/** CRC-32 (IEEE 802.3, el del ZIP): tabla en ejecución, con semillas conocidas. */
const CRC_TABLE: readonly number[] = (() => {
  const table: number[] = [];
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

/** CRC-32 IEEE de un bloque de bytes (sin pre/post xor). */
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Un fichero del paquete: nombre (ruta dentro del zip) y datos. */
export interface ZipEntry {
  name: string;
  /** Texto UTF-8 o bytes; cada entrada es un fichero y no lleva carpeta implícita. */
  data: string | Uint8Array;
}

/** Dos fechas DOS: tiempo y fecha empacados sobre un granulado de 2 s. */
function dosDateTime(dateMs: number): { time: number; date: number } {
  const safe = dateMs > 0 ? dateMs : 0;
  const date = new Date(safe);
  // Antes de 1980 la DOS no existe: anclamos al 1.1.1980 para no romper el zip.
  const year = Math.max(1980, date.getFullYear());
  const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((Math.floor(date.getSeconds() / 2) & 0x1f) >>> 0);
  const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | (date.getDate() & 0x1f);
  return { time: time >>> 0, date: day >>> 0 };
}

const encoder = new TextEncoder();

/** Compone el zip (STORE): entradas en el mismo orden del argumento. */
export function buildStoreZip(entries: readonly ZipEntry[], dateMs = Date.now()): Uint8Array {
  if (entries.length === 0) {
    throw new Error("un zip sin ficheros no tiene sentido (el pack sale con el nombrado mínimo)");
  }
  const { time, date } = dosDateTime(dateMs);
  const blobs: number[] = []; // bytes planos: el tamaño no justifica segmentos de Uint8Array

  const central: Array<{
    name: Uint8Array;
    crc: number;
    size: number;
    offset: number;
  }> = [];

  for (const entry of entries) {
    const name = encoder.encode(entry.name.replace(/\\/g, "/"));
    const data = typeof entry.data === "string" ? encoder.encode(entry.data) : entry.data;
    const crc = crc32(data);
    const offset = blobs.length;
    // Cabecera local: signature, versión 20, flags (bit 11 = UTF-8), STORE,
    // timestamps 0 (los legales van en el central), y campos por fichero.
    const local = new Uint8Array(30 + name.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0x0800, true); // UTF-8
    view.setUint16(8, 0, true); // STORE
    view.setUint16(10, time, true);
    view.setUint16(12, date, true);
    view.setUint32(16, crc, true);
    view.setUint32(20, data.length, true); // comprimido
    view.setUint32(24, data.length, true); // sin comprimir
    view.setUint16(26, name.length, true); // longitud del nombre
    view.setUint16(28, 0, true); // extras
    local.set(name, 30);

    blobs.push(...local, ...data);
    central.push({ name, crc, size: data.length, offset });
  }

  const centralOffset = blobs.length;
  for (const record of central) {
    const dir = new Uint8Array(46 + record.name.length);
    const view = new DataView(dir.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, 20, true); // versión hecha por
    view.setUint16(6, 20, true); // versión necesaria
    view.setUint16(8, 0x0800, true); // UTF-8
    view.setUint16(10, 0, true); // STORE
    view.setUint16(12, time, true);
    view.setUint16(14, date, true);
    view.setUint32(16, record.crc, true);
    view.setUint32(20, record.size, true);
    view.setUint32(24, record.size, true);
    view.setUint16(28, record.name.length, true);
    view.setUint16(30, 0, true); // extras
    view.setUint16(32, 0, true); // comentario
    view.setUint16(34, 0, true); // número de disco
    view.setUint16(36, 0, true); // attrs internos
    view.setUint32(38, 0, true); // attrs externos
    view.setUint32(42, record.offset, true);
    dir.set(record.name, 46);
    blobs.push(...dir);
  }

  // Registro central EOF (EOCD): entradas, tamaño/cuentas del central y la
  // marca final que todo descompresor busca por detrás del fichero.
  const eocd = new Uint8Array(22);
  const view = new DataView(eocd.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, entries.length, true); // en este disco
  view.setUint16(10, entries.length, true); // total
  view.setUint32(12, blobs.length - centralOffset, true); // tamaño del central
  view.setUint32(16, centralOffset, true);
  view.setUint16(20, 0, true); // sin comentario

  blobs.push(...eocd);
  return new Uint8Array(blobs);
}

/**
 * Lee un zip de vuelta (solo STORE, para tests): devuelve nombre y datos de
 * cada entrada en el orden del fichero. No es un descompresor de propósito
 * general: el paquete del informe es lo único que pasa por aquí.
 */
export function readStoreZip(zip: Uint8Array): Array<{ name: string; data: Uint8Array }> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  // EOCD localizándolo desde el final (22 bytes, firma 0x06054b50).
  let eocdAt = -1;
  for (let index = zip.length - 22; index >= 0; index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50) {
      eocdAt = index;
      break;
    }
  }
  if (eocdAt < 0) throw new Error("zip sin EOCD: no es un zip del paquete");

  const total = view.getUint16(eocdAt + 10, true);
  let offset = view.getUint32(eocdAt + 16, true);
  const entries: Array<{ name: string; data: Uint8Array }> = [];
  for (let index = 0; index < total; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error(`entrada ${index} del central corrupta`);
    }
    const crc = view.getUint32(offset + 16, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(zip.subarray(offset + 46, offset + 46 + nameLength));
    const localNameLength = view.getUint16(localOffset + 26, true);
    const dataOffset = localOffset + 30 + localNameLength;
    const data = zip.subarray(dataOffset, dataOffset + size);
    if (crc32(data) !== crc) throw new Error(`CRC de ${name} no cuadra: el zip está roto`);
    entries.push({ name, data });
    offset += 46 + nameLength;
  }
  return entries;
}

/** Texto UTF-8 de una entrada leída (wrapper cómodo para los tests). */
export function readStoreZipText(zip: Uint8Array): Array<{ name: string; text: string }> {
  return readStoreZip(zip).map((entry) => ({ name: entry.name, text: new TextDecoder().decode(entry.data) }));
}
