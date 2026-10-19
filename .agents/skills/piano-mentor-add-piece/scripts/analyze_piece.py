# description: Analiza un MIDI antes de meterlo en el corpus y emite el veredicto de aceptación.
# context: Soporte de la skill piano-mentor-add-piece; se lanza desde la raíz del repo sobre un MIDI candidato.

"""Analiza un MIDI candidato al corpus y dice si cumple las reglas del proyecto.

Comprueba lo que los tests del catálogo y de manos van a exigir después:
notas reales (note_on con velocity > 0), pistas con notas [1, 2], la regla de
mano por altura (B-009.2) y que las notas caigan dentro del piano de 88 teclas.

Uso:
    python .agents/skills/piano-mentor-add-piece/scripts/analyze_piece.py <ruta.mid>
"""

from __future__ import annotations

import json
import statistics
import sys
from pathlib import Path

import mido

# Salida en UTF-8 aunque la consola de Windows diga otra cosa.
sys.stdout.reconfigure(encoding="utf-8")


def find_repo_root(start: Path) -> Path:
    """Sube hasta encontrar data/midi/catalog.json (la raíz del repositorio)."""
    for candidate in [start, *start.parents]:
        if (candidate / "data" / "midi" / "catalog.json").exists():
            return candidate
    raise SystemExit("No encuentro la raíz del repo (data/midi/catalog.json). Lanza el script desde dentro del repositorio.")


ROOT = find_repo_root(Path.cwd())
sys.path.insert(0, str(ROOT / "backend" / "src"))

LOWEST_KEY, HIGHEST_KEY = 21, 108  # teclas extremas de un piano de 88


def count_notes(mid: mido.MidiFile) -> int:
    """Mismo criterio que count_notes de backend/tests/test_catalog.py."""
    return sum(
        1
        for track in mid.tracks
        for msg in track
        if msg.type == "note_on" and msg.velocity > 0
    )


def hand_verdict(path: Path) -> None:
    """Aplica la regla de manos de B-009.2 y la compara con la partitura."""
    from piano_mentor.midi import MidiService, describe_tracks

    notes = MidiService().normalize(path)
    tracks = describe_tracks(notes)
    if not tracks:
        print("  manos: AVISO ninguna pista con notas")
        return

    print("  pistas con notas:", [info.track for info in tracks])
    for info in tracks:
        print(
            f"    pista {info.track}: {info.note_count} notas, "
            f"rango {info.lowest_pitch}-{info.highest_pitch}, "
            f"mediana {info.median_pitch:g}, mano {info.hand}"
        )

    left = next((i for i in tracks if i.hand == "left"), None)
    right = next((i for i in tracks if i.hand == "right"), None)
    if left is None or right is None:
        print("  manos: AVISO no hay par izquierda/derecha (¿una sola mano o más de dos pistas?)")
        return
    if not (left.median_pitch < right.median_pitch and left.lowest_pitch < right.lowest_pitch):
        print("  manos: FALLO la pista grave no queda como mano izquierda")
        return
    print(f"  manos: OK izquierda pista {left.track}, derecha pista {right.track}")


def tempo_verdict(mid: mido.MidiFile) -> None:
    """Aviso si el archivo va sospechoso de doble velocidad."""
    tempos = [msg.tempo for track in mid.tracks for msg in track if msg.type == "set_tempo"]
    if not tempos:
        print("  tempo: AVISO sin set_tempo (se leerá a 120 BPM)")
        return
    bpm = 60_000_000 / statistics.median(tempos)
    if bpm > 240 or bpm < 30:
        print(f"  tempo: AVISO {bpm:.1f} BPM fuera de lo normal: compara la duración con otra fuente")
    else:
        print(f"  tempo: {bpm:.1f} BPM")


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2

    path = Path(sys.argv[1])
    if not path.is_absolute():
        path = ROOT / path
    if not path.exists():
        raise SystemExit(f"No existe: {path}")

    mid = mido.MidiFile(path)
    notes = count_notes(mid)
    pitches = [
        msg.note
        for track in mid.tracks
        for msg in track
        if msg.type == "note_on" and msg.velocity > 0
    ]
    named = [
        (index, track.name.strip(), sum(1 for m in track if m.type == "note_on" and m.velocity > 0))
        for index, track in enumerate(mid.tracks)
    ]
    named = [row for row in named if row[2]]

    try:
        shown = path.relative_to(ROOT)
    except ValueError:  # descarga temporal todavía fuera del repo
        shown = path
    print(f"archivo: {shown} ({path.stat().st_size} bytes)")
    print(f"  tipo {mid.type}, {len(mid.tracks)} pistas, división {mid.ticks_per_beat}, {round(mid.length, 1)} s")
    print(f"  notas (criterio del test): {notes}")
    if pitches:
        print(f"  rango: {min(pitches)}-{max(pitches)} (piano de 88 teclas: 21-108)")
    for index, name, count in named:
        print(f"    pista {index} {name!r}: {count} notas")
    tempo_verdict(mid)

    problems: list[str] = []
    if notes == 0:
        problems.append("sin notas")
    if pitches and (min(pitches) < LOWEST_KEY or max(pitches) > HIGHEST_KEY):
        problems.append("notas fuera del piano de 88 teclas")
    tracks_with_notes = [index for index, _, _ in named]
    if len(tracks_with_notes) > 2:
        problems.append(
            f"{len(tracks_with_notes)} pistas con notas: ¿es una pieza de orquesta en vez de piano?"
        )

    print("  manos:")
    try:
        hand_verdict(path)
    except Exception as failure:  # noqa: BLE001 - el veredicto de manos es auxiliar
        print(f"    AVISO no se pudo evaluar ({failure})")

    if problems:
        print("VEREDICTO: NO APTO")
        for problem in problems:
            print(f"  - {problem}")
        return 1

    print("VEREDICTO: APTO")
    print(f"  fíjate en los campos del catálogo: notes={notes}, duration_s={round(mid.length, 1)}, tracks={len(mid.tracks)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
