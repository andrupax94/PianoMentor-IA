# description: Busca, verifica y descarga portadas de dominio público desde Wikimedia Commons.
# context: Soporte de la skill piano-mentor-add-piece; consulta la API de Commons y guarda en frontend/public/assets/covers.

"""Portadas del corpus desde Wikimedia Commons.

Uso (desde la raíz del repositorio):
    python .agents/skills/piano-mentor-add-piece/scripts/cover_from_commons.py --search "<texto>"
    python .agents/skills/piano-mentor-add-piece/scripts/cover_from_commons.py --file "File:<nombre>" --save <slug>

Tres modos, que corresponden a los tres pasos del proceso:

1. `--search <texto>`: lista candidatos con dimensiones y licencia en una sola
   petición, para elegir sin abrir la web.
2. `--file "File:<nombre>"`: imprime los datos que van a la tabla de
   `frontend/public/assets/covers/CREDITS.md`.
3. `--file "File:<nombre>" --save <slug>`: descarga a 960 px de ancho en
   `frontend/public/assets/covers/<slug>.jpg` y imprime la fila lista para pegar.

Solo se aceptan imágenes de dominio público (PD-old-100 y compañía): son obras
de compositores fallecidos hace más de un siglo. Sin texto superpuesto, porque
el título y el compositor los pinta la interfaz.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

API = "https://commons.wikimedia.org/w/api.php"
# Wikimedia rechaza los UAs genéricos: hay que identificarse.
USER_AGENT = "PianoMentor-add-piece-skill/1.0 (https://github.com/; portadas de catalog.json)"
COVERS_DIR = Path("frontend") / "public" / "assets" / "covers"
WIDTH = 960  # ancho de las portadas ya existentes (CREDITS.md: ~800 px, actual 960)


def find_repo_root(start: Path) -> Path:
    """Sube hasta encontrar data/midi/catalog.json (la raíz del repositorio)."""
    for candidate in [start, *start.parents]:
        if (candidate / "data" / "midi" / "catalog.json").exists():
            return candidate
    raise SystemExit(
        "No encuentro la raíz del repo (data/midi/catalog.json): lanza el script desde dentro del repositorio."
    )

PD_MARKERS = ("public domain", "pd-old", "cc-zero", "cc0", "no rights reserved")
# Convención de CREDITS.md: TODAS las portadas son de dominio público. El
# CC BY-SA (aceptado en catalog.json para los MIDI con atribución) no encaja
# aquí porque metería ShareAlike en un asset del repo: se marca para revisión.
ATTRIBUTION_MARKERS = ("cc by-sa",)


def api(params: dict[str, str]) -> dict:
    """Llama a la API de Commons y devuelve el JSON ya cargado."""
    params = {**params, "format": "json"}
    request = urllib.request.Request(
        f"{API}?{urllib.parse.urlencode(params)}", headers={"User-Agent": USER_AGENT}
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def strip_html(raw: str | None) -> str:
    """Quita el marcado que Commons mete en autor y fecha."""
    if not raw:
        return ""
    return html.unescape(re.sub(r"<[^>]+>", "", raw)).strip()


def clean_date(raw: str | None) -> str:
    """Deja solo la fecha legible: Commons añade el cualificador de Wikidata."""
    text = strip_html(raw)
    text = re.split(r"\s*date\s+QS:", text)[0]  # p. ej. "1820date QS:P571,+1820-00-00..."
    text = re.split(r"\s+QS:", text)[0]
    return text.strip(" ,;")


def rows(payload: dict) -> list[dict]:
    """Normaliza las páginas devueltas por la API a una lista de candidatos."""
    pages = payload.get("query", {}).get("pages", {})
    candidates = []
    for page in pages.values():
        info = (page.get("imageinfo") or [{}])[0]
        meta = info.get("extmetadata", {})
        candidates.append(
            {
                "title": page.get("title", ""),
                "width": info.get("width"),
                "height": info.get("height"),
                "license": strip_html(meta.get("LicenseShortName", {}).get("value")),
                "artist": strip_html(meta.get("Artist", {}).get("value")),
                "date": clean_date(meta.get("DateTimeOriginal", {}).get("value")),
                "object": strip_html(meta.get("ObjectName", {}).get("value")),
                "page": info.get("descriptionurl", ""),
                "bytes": info.get("size", 0),
            }
        )
    return candidates


def acceptable(candidate: dict) -> bool:
    """Convención de CREDITS.md: solo portadas de dominio público."""
    license_name = candidate["license"].lower()
    return any(marker in license_name for marker in PD_MARKERS)


def license_verdict(candidate: dict) -> str:
    license_name = candidate["license"].lower()
    if any(marker in license_name for marker in PD_MARKERS):
        return "PD OK"
    if any(marker in license_name for marker in ATTRIBUTION_MARKERS):
        return (
            f"REVISAR: {candidate['license']} (fuera de la convención: CREDITS.md "
            "guarda solo portadas PD, y ShareAlike arrastrarías al repo)"
        )
    return f"NO APTA: {candidate['license'] or 'licencia desconocida'}"


def show(candidate: dict, position: int) -> None:
    width = candidate["width"]
    size = f"{width}x{candidate['height']}" if width else "?"
    notes = [license_verdict(candidate)]
    if width and width < WIDTH:
        # Commons no amplía: la portada quedaría como mucho a ese ancho.
        notes.append(f"AVISO estrecha ({width} px < {WIDTH}): se verá pequeña")
    print(f"{position:2d}. {candidate['title']}")
    print(f"    {size} | {' | '.join(notes)} | autor: {candidate['artist'] or '?'} | fecha: {candidate['date'] or '?'}")


def search(text: str) -> int:
    payload = api(
        {
            "action": "query",
            "generator": "search",
            "gsrsearch": text,
            "gsrnamespace": "6",
            "gsrlimit": "15",
            "prop": "imageinfo",
            "iiprop": "url|size|extmetadata",
        }
    )
    candidates = rows(payload)
    if not candidates:
        print("Sin resultados.")
        return 1
    for position, candidate in enumerate(candidates, 1):
        show(candidate, position)
    print("\nSiguiente paso: --file \"File:<nombre elegido>\" para ver los datos o --save <slug> para bajarla.")
    return 0


def info(title: str) -> dict | None:
    payload = api(
        {
            "action": "query",
            "titles": title,
            "prop": "imageinfo",
            "iiprop": "url|size|extmetadata",
        }
    )
    candidates = rows(payload)
    if not candidates:
        print(f"No existe {title!r} en Commons.")
        return None
    candidate = candidates[0]
    show(candidate, 1)
    if not acceptable(candidate):
        print("No se usa: CREDITS.md exige portadas de dominio público. Busca otra imagen.")
        return None
    return candidate


def download(title: str, slug: str) -> Path:
    """Descarga la imagen a 960 px en la carpeta de portadas."""
    covers = find_repo_root(Path.cwd()) / COVERS_DIR
    covers.mkdir(parents=True, exist_ok=True)
    filename = title.removeprefix("File:")
    url = f"https://commons.wikimedia.org/wiki/Special:FilePath/{urllib.parse.quote(filename)}?width={WIDTH}"
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    destination = covers / f"{slug}.jpg"
    with urllib.request.urlopen(request, timeout=60) as response:
        destination.write_bytes(response.read())
    print(f"Descargada: {destination} ({destination.stat().st_size} bytes)")
    return destination


def credits_row(slug: str, candidate: dict) -> str:
    """Fila de la tabla de CREDITS.md con los datos automáticos rellenos."""
    return (
        f"| `{slug}.jpg` | <RETRATADO> | <OBRA> | {candidate['artist']} | "
        f"{candidate['date']} | {candidate['license']} | {candidate['page']} |"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--search", metavar="TEXTO", help="busca retratos en Commons")
    mode.add_argument("--file", metavar="FILE:", help="muestra los datos de una imagen concreta")
    parser.add_argument("--save", metavar="SLUG", help="la descarga como portada de ese compositor")
    args = parser.parse_args()

    if args.search:
        return search(args.search)

    candidate = info(args.file)
    if candidate is None:
        return 1

    slug = args.save
    if slug:
        download(args.file, slug)
    print("\nFila para frontend/public/assets/covers/CREDITS.md:")
    print(credits_row(slug or "<slug>", candidate))
    if slug:
        print(f"\nY en la lista 'Asignacion a las piezas': - `{slug}.jpg` → <ids de ese compositor>")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
