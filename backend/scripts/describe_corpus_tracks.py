# description: Tabla regenerable de pistas, rangos y manos del corpus (evidencia de B-009.2).
# context: Comprobar con datos que la pista grave es la mano izquierda antes de fiarse de la regla.

"""Genera la tabla de pistas y manos del corpus para la evidencia de B-009.2.

Uso:
    python backend/scripts/describe_corpus_tracks.py

Salida: dos tablas Markdown. La primera, una fila por pista (notas, rango, mediana y
mano); la segunda, una fila por pieza (distancia entre medianas, solape de rangos y
comparación con la mano izquierda de referencia).

La referencia de mano izquierda está puesta a mano leyendo el sentido musical de cada
pieza (quién lleva el bajo o el acompañamiento) y es la que valida la regla por altura.
No descarga nada: solo lee `data/midi/catalog.json` y los MIDI del repositorio.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# Ejecutable desde la raíz sin PYTHONPATH: el paquete vive en backend/src.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from piano_mentor.midi import HAND_LEFT, MidiService, describe_tracks

REPO_ROOT = Path(__file__).resolve().parents[2]
CATALOG = REPO_ROOT / "data" / "midi" / "catalog.json"

# Mano izquierda esperada (índice de pista) según la partitura de cada pieza.
EXPECTED_LEFT_TRACK: dict[str, int] = {
    "p01": 2,  # Bach, Minueto en Sol: la izquierda es la pista del bajo
    "p02": 1,  # Bach, Preludio en Do: este archivo trae las pistas al revés
    "p03": 2,
    "p04": 2,
    "p05": 2,
    "p06": 2,
    "p07": 2,
    "p08": 2,
    "p09": 2,
    "p10": 2,
    "p11": 2,
    "p12": 2,
    "p13": 2,
    "p14": 2,
    "p15": 2,
    "p17": 2,  # Beethoven, Sinfonía n.º 5 (reducción para piano): la izquierda es la pista del bajo
}


def load_pieces() -> list[tuple[str, Path]]:
    """Piezas del catálogo en orden: (id, ruta del MIDI)."""
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    entries = catalog["pieces"] if isinstance(catalog, dict) else catalog
    return [(entry["id"], REPO_ROOT / "data" / "midi" / entry["file"]) for entry in entries]


def build_tables() -> tuple[list[str], list[str]]:
    """Devuelve las dos tablas Markdown: por pista y por pieza."""
    service = MidiService()
    per_track = ["| Pieza | Pista | Notas | Rango | Mediana | Mano |", "|---|---|---|---|---|---|"]
    per_piece = [
        (
            "| Pieza | Mediana izquierda | Mediana derecha | Distancia | Solape | "
            "Izquierda esperada | ¿Coincide? |"
        ),
        "|---|---|---|---|---|---|---|",
    ]
    agreements: list[int] = []
    distances: list[int] = []

    for piece_id, path in load_pieces():
        notes = service.normalize(path)
        tracks = describe_tracks(notes)
        for info in tracks:
            median = f"{info.median_pitch:g}"
            per_track.append(
                f"| {piece_id} | {info.track} | {info.note_count} | "
                f"{info.lowest_pitch}-{info.highest_pitch} | {median} | {info.hand} |"
            )

        left = next((info for info in tracks if info.hand == HAND_LEFT), None)
        right = next((info for info in tracks if info.hand == "right"), None)
        if left is None or right is None:  # pragma: no cover - el corpus siempre trae dos manos
            continue

        expected = EXPECTED_LEFT_TRACK.get(piece_id)
        matches = "sí" if expected == left.track else f"**no** (esperada {expected})"
        if expected == left.track:
            agreements.append(left.track)
        distance = round(right.median_pitch - left.median_pitch)
        distances.append(distance)
        overlap = max(0, min(left.highest_pitch, right.highest_pitch) - max(left.lowest_pitch, right.lowest_pitch))
        per_piece.append(
            f"| {piece_id} | {left.median_pitch:g} | {right.median_pitch:g} | {distance} | "
            f"{overlap} semitonos | {expected} | {matches} |"
        )

    if distances:
        per_piece.append("")
        per_piece.append(
            f"{len(agreements)}/{len(distances)} piezas con la pista grave como mano izquierda; "
            f"distancia entre medianas de {min(distances)} a {max(distances)} semitonos."
        )
    return per_track, per_piece


def main() -> None:
    # Salida siempre en UTF-8: la tabla se pega en los documentos, no en la consola.
    sys.stdout.reconfigure(encoding="utf-8")
    per_track, per_piece = build_tables()
    print("### Pistas del corpus\n")
    print("\n".join(per_track))
    print("\n### Manos por pieza\n")
    print("\n".join(per_piece))


if __name__ == "__main__":
    main()
