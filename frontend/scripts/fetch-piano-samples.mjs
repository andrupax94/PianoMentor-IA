#!/usr/bin/env node
// description: Descarga y trascodifica las muestras de piano del proyecto (Salamander Grand, CC BY 3.0).
// context: B-007.5; paso vía `npm run samples`. Idempotente: si el manifiesto y los MP3 ya están
// verificados, sale sin tocar nada. La atribución vive en THIRD_PARTY_NOTICES.md.

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = resolve(SCRIPT_DIR, "..");
const CACHE_DIR = join(FRONTEND_DIR, ".cache", "piano-samples");
const OUT_DIR = join(FRONTEND_DIR, "public", "audio", "piano");
const TMP_DIR = join(CACHE_DIR, "extraido");

/** Banco Salamander Grand Piano V3 en Ogg Vorbis (archive.org, copia del original de Alexander Holm). */
const SOURCE = {
  url: "https://archive.org/download/SalamanderGrandPianoV3/SalamanderGrandPianoV3_OggVorbis.tar.bz2",
  file: "SalamanderGrandPianoV3_OggVorbis.tar.bz2",
  sha1: "5B0247D375FF55AEA8A58F775B448E4C4C0E642A",
  members: "SalamanderGrandPianoV3_OggVorbis/ogg",
};

/** Capas grabadas que usamos de las 16 disponibles (4 = suave, 13 = fuerte). */
const SOFT_LAYER = 4;
const HARD_LAYER = 13;

/** Calidades: HQ para el rango visible por defecto, LQ para el resto del teclado. */
const TIERS = {
  hq: { bitrate: "128k", trim: (s) => s },
  lq: { bitrate: "64k", trim: (s) => Math.min(s, 2.5) },
};

const NOTE_NAMES = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"];

/** pitch MIDI → nombre corto (60 → "c4"), como `pitchToKeyId` del frontend. */
function noteName(pitch) {
  return `${NOTE_NAMES[((pitch % 12) + 12) % 12]}${Math.floor(pitch / 12) - 1}`;
}

/** Nombre del fichero dentro del banco (24v4.ogg), con la grafía del banco (D#1, F#1, A1). */
function bankName(pitch, layer) {
  const name = NOTE_NAMES[((pitch % 12) + 12) % 12];
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}${Math.floor(pitch / 12) - 1}v${layer}.ogg`;
}

/**
 * Duración de cola según el registro: un grave de verdad resuena mucho más que un
 * agudo. Sin esto, los graves suenan cortados y los agudos se quedan con cola de sobra.
 */
function trimSeconds(pitch) {
  return Math.min(6, Math.max(2.5, 2.5 + (72 - pitch) * 0.09));
}

/** Rejilla del banco: A0 (21) → C8 (108) en terceras menores. */
const PITCHES = Array.from({ length: 30 }, (_, index) => 21 + index * 3);

function sha1(file) {
  return new Promise((resolvePromise, rejectPromise) => {
    const hash = createHash("sha1");
    createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", rejectPromise)
      .on("end", () => resolvePromise(hash.digest("hex").toUpperCase()));
  });
}

async function sha256(file) {
  const hash = createHash("sha256");
  hash.update(await readFile(file));
  return hash.digest("hex");
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

function run(command, args, label) {
  const result = spawnSync(command, args, { stdio: ["ignore", "ignore", "inherit"] });
  if (result.error) {
    throw new Error(`${label}: no se pudo ejecutar "${command}" (${result.error.message}).`);
  }
  if (result.status !== 0) {
    throw new Error(`${label}: "${command}" terminó con código ${result.status}.`);
  }
}

async function download(url, destination) {
  const partial = `${destination}.parcial`;
  console.log(`Descargando ${url}`);
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Descarga fallida: HTTP ${response.status}.`);
  }
  let received = 0;
  let lastReport = 0;
  const progress = new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      if (received - lastReport > 32 * 1024 * 1024) {
        console.log(`  ${(received / 1024 / 1024).toFixed(0)} MB`);
        lastReport = received;
      }
      callback(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(response.body), progress, createWriteStream(partial));
  await rename(partial, destination);
  console.log(`  ${(received / 1024 / 1024).toFixed(1)} MB descargados`);
}

async function main() {
  const force = process.argv.includes("--force");
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(CACHE_DIR, { recursive: true });

  // 1. Salida rápida si el trabajo ya está hecho (manifiesto + ficheros + hashes).
  const manifestPath = join(OUT_DIR, "manifest.json");
  if (!force && (await exists(manifestPath))) {
    try {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      let complete = true;
      for (const entry of manifest.files) {
        const file = join(OUT_DIR, entry.file);
        if (!(await exists(file)) || (await sha256(file)) !== entry.sha256) {
          complete = false;
          break;
        }
      }
      if (complete) {
        const total = manifest.files.reduce((sum, entry) => sum + entry.bytes, 0);
        console.log(
          `Muestras al día: ${manifest.files.length} ficheros, ${(total / 1024 / 1024).toFixed(1)} MB en public/audio/piano.`,
        );
        console.log("Usa --force para regenerarlas desde cero.");
        return;
      }
    } catch {
      // Manifiesto ilegible: se regenera.
    }
  }

  // 2. Asegurar el banco descargado y verificarlo por SHA-1 (el del archivo original).
  const archive = join(CACHE_DIR, SOURCE.file);
  if (!(await exists(archive)) || (await sha1(archive)) !== SOURCE.sha1) {
    if (await exists(archive)) {
      console.log("El banco en caché no coincide con el hash fijado; se vuelve a descargar.");
      await rm(archive, { force: true });
    }
    await download(SOURCE.url, archive);
  }
  const digest = await sha1(archive);
  if (digest !== SOURCE.sha1) {
    throw new Error(`SHA-1 del banco: ${digest}; se esperaba ${SOURCE.sha1}.`);
  }
  console.log("Banco verificado por SHA-1.");

  // 3. Extraer solo las capas que usamos (de 646 ficheros del banco, 120).
  await rm(TMP_DIR, { recursive: true, force: true });
  await mkdir(TMP_DIR, { recursive: true });
  const members = [];
  for (const pitch of PITCHES) {
    for (const layer of [SOFT_LAYER, HARD_LAYER]) {
      members.push(`${SOURCE.members}/${bankName(pitch, layer)}`);
    }
  }
  console.log(`Extrayendo ${members.length} muestras originales…`);
  run("tar", ["-xjf", archive, "-C", TMP_DIR, ...members], "Extracción");

  // 4. Trascodificar a MP3 en las dos calidades (Safari no reproduce Ogg).
  console.log("Trascodificando a MP3 (HQ para el rango visible, LQ para el resto)…");
  const files = [];
  let totalBytes = 0;
  for (const pitch of PITCHES) {
    const trim = trimSeconds(pitch);
    const fadeStart = Math.max(0, trim * 0.7);
    for (const [layer, tag] of [
      [SOFT_LAYER, "soft"],
      [HARD_LAYER, "hard"],
    ]) {
      const source = join(TMP_DIR, SOURCE.members, bankName(pitch, layer));
      for (const [tier, config] of Object.entries(TIERS)) {
        const seconds = config.trim(trim);
        const name = `${noteName(pitch)}-${tag}-${tier}.mp3`;
        const destination = join(OUT_DIR, name);
        const fade = Math.max(0.2, seconds - fadeStart);
        run(
          "ffmpeg",
          [
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            source,
            "-ac",
            "1",
            "-ar",
            "44100",
            "-t",
            seconds.toFixed(2),
            "-af",
            `afade=t=out:st=${Math.max(0, seconds - fade).toFixed(2)}:d=${fade.toFixed(2)}`,
            "-b:a",
            config.bitrate,
            destination,
          ],
          `ffmpeg ${name}`,
        );
        const bytes = (await stat(destination)).size;
        totalBytes += bytes;
        files.push({
          pitch,
          layer: tag,
          tier,
          file: name,
          duration_s: Number(seconds.toFixed(2)),
          bytes,
          sha256: await sha256(destination),
        });
      }
    }
    process.stdout.write(`  ${noteName(pitch)} (${files.length}/${PITCHES.length * 4})\r`);
  }
  console.log("");

  // 5. Manifiesto que consume el cargador (src/lib/piano-samples.ts).
  const manifest = {
    source: "Salamander Grand Piano V3 de Alexander Holm (archive.org: SalamanderGrandPianoV3)",
    license: "CC BY 3.0",
    license_url: "https://creativecommons.org/licenses/by/3.0/",
    notices: "THIRD_PARTY_NOTICES.md",
    bank_sha1: SOURCE.sha1,
    layers: { soft: SOFT_LAYER, hard: HARD_LAYER },
    generated_by: "scripts/fetch-piano-samples.mjs",
    files: files.sort((a, b) => a.pitch - b.pitch || a.layer.localeCompare(b.layer) || a.tier.localeCompare(b.tier)),
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  await rm(TMP_DIR, { recursive: true, force: true });
  console.log(
    `Listo: ${files.length} MP3 + manifest.json, ${(totalBytes / 1024 / 1024).toFixed(1)} MB en public/audio/piano.`,
  );
  console.log("El banco descargado queda en .cache/piano-samples (ignorado por git).");
}

main().catch((error) => {
  console.error(`\nERROR: ${error.message}`);
  process.exitCode = 1;
});
