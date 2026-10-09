# description: Script que combina base + filetree real + files.csv y escribe ARCHITECTURE.md.
# context: Ejecutar con python tras editar la base o el CSV; no modifica la base.

"""Genera ARCHITECTURE.md desde architecture_base.md + filetree real + files.csv.

Uso (desde la raíz del repo):
    python architecture/generate_architecture.py            # solo regenera ARCHITECTURE.md
    python architecture/generate_architecture.py --write    # escribe cabeceras en archivos + regenera
    python architecture/generate_architecture.py --write --dry-run   # previsualiza sin escribir

Reglas:
- Lee `architecture/architecture_base.md` (fuente manual, NO la modifica).
- Lee `architecture/files.csv` (columnas: path,description,context).
- Genera el filetree real del repo (omite ruido: .git, __pycache__, node_modules, .next, etc.).
- Escribe `ARCHITECTURE.md` = base + Anexo A (filetree) + Anexo B (tabla del CSV).
- Con --write, inserta `description` y `context` del CSV como comentario de
  cabecera en cada archivo (estilo según extensión: `#`, `//`, `<!-- -->`, `/* */`).
  Reemplaza la cabecera anterior si existe; nunca duplica. Sin --write no toca código.
- Nunca modifica la base ni el CSV. Reejecutable sin duplicar anexos ni cabeceras.
"""

from __future__ import annotations

import csv
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
BASE = HERE / "architecture_base.md"
CSV = HERE / "files.csv"
OUT = ROOT / "ARCHITECTURE.md"

SKIP_DIRS = {
    ".git",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    "node_modules",
    ".next",
    ".venv",
    "venv",
    "env",
    ".nx",
    ".turbo",
    "htmlcov",
    ".work",
    "out",
    "dist",
    "build",
}

SKIP_SUFFIXES = {".pyc", ".pyo", ".bak", ".skill"}
SKIP_NAMES = {"opencode.exe"}

# Estilo de comentario por extensión. None = sin sintaxis de comentario (se omite en --write).
HASH_SUFFIXES = {".py", ".toml", ".yml", ".yaml", ".sh", ".ps1", ".example", ".gitignore", ""}
SLASH_SUFFIXES = {".js", ".mjs", ".ts", ".tsx"}
HASH_NAMES = {"Dockerfile", ".env.example", ".gitignore"}

WRITE_SKIP_SUFFIXES = {".json", ".jsonl"}  # modificarlos rompería contratos/esquemas
WRITE_SKIP_NAMES = {"files.csv", ".gitkeep", "LICENSE", "ARCHITECTURE.md"}

HEADER_KEYS = ("description", "context")
SCAN_LINES = 15


def one_line(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def comment_style(path: Path) -> str | None:
    if path.name in WRITE_SKIP_NAMES or path.suffix.lower() in WRITE_SKIP_SUFFIXES:
        return None
    if path.name in HASH_NAMES:
        return "hash"
    suffix = path.suffix.lower()
    if suffix in HASH_SUFFIXES:
        # Archivos sin extensión solo si son nombres conocidos (ya filtrados arriba)
        if suffix == "" and path.name not in HASH_NAMES:
            return None
        return "hash"
    if suffix in SLASH_SUFFIXES:
        return "slash"
    if suffix in (".md", ".svg"):
        # SVG es XML: los comentarios <!-- --> antes del elemento raíz son válidos
        return "html"
    if suffix == ".css":
        return "css"
    return None


def header_block(style: str, description: str, context: str) -> list[str]:
    desc, ctx = one_line(description), one_line(context)
    if style == "hash":
        return [f"# description: {desc}", f"# context: {ctx}"]
    if style == "slash":
        return [f"// description: {desc}", f"// context: {ctx}"]
    if style == "html":
        return [f"<!-- description: {desc} -->", f"<!-- context: {ctx} -->"]
    if style == "css":
        desc = desc.replace("*/", "* /")
        ctx = ctx.replace("*/", "* /")
        return [f"/* description: {desc} */", f"/* context: {ctx} */"]
    raise ValueError(style)


def header_key_re(style: str) -> re.Pattern[str]:
    if style == "hash":
        return re.compile(r"^\s*#\s*(description|context)\s*:", re.IGNORECASE)
    if style == "slash":
        return re.compile(r"^\s*//\s*(description|context)\s*:", re.IGNORECASE)
    if style == "html":
        return re.compile(r"^\s*<!--\s*(description|context)\s*:", re.IGNORECASE)
    if style == "css":
        return re.compile(r"^\s*/\*\s*(description|context)\s*:", re.IGNORECASE)
    raise ValueError(style)


def apply_header(path: Path, description: str, context: str, dry_run: bool) -> str:
    """Inserta o reemplaza la cabecera. Devuelve: written | unchanged | skipped:<motivo>."""
    try:
        raw = path.read_bytes()
    except OSError:
        return "skipped:no-legible"
    if b"\x00" in raw[:8192]:
        return "skipped:binario"
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return "skipped:binario"
    # Normalizar saltos de línea para comparar bien (el disco puede tener CRLF)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    style = comment_style(path)
    if style is None:
        return "skipped:sin-sintaxis-de-comentario"

    lines = text.splitlines()
    key_re = header_key_re(style)
    # Quitar cabeceras previas dentro de las primeras líneas (evita duplicados)
    kept: list[str] = []
    removed = 0
    for i, line in enumerate(lines):
        if i < SCAN_LINES and key_re.match(line):
            removed += 1
            continue
        kept.append(line)

    block = header_block(style, description, context)
    # Quitar blancos iniciales residuales tras la limpieza (si no, ocultan shebang/frontmatter)
    while kept and kept[0].strip() == "":
        kept.pop(0)
    insert_at = 0
    if kept and kept[0].startswith("#!"):
        insert_at = 1
    elif kept and kept[0].strip() == "---":
        # Frontmatter YAML (SKILL.md): la cabecera va después del bloque ---...---
        for i in range(1, min(30, len(kept))):
            if kept[i].strip() in ("---", "..."):
                insert_at = i + 1
                break
    # Evitar línea en blanco duplicada entre cabecera y cuerpo
    rest = kept[insert_at:]
    while rest and rest[0].strip() == "":
        rest.pop(0)
    new_lines = kept[:insert_at] + block + [""] + rest
    new_text = "\n".join(new_lines) + "\n"

    if new_text == text:
        return "unchanged"
    if not dry_run:
        path.write_text(new_text, encoding="utf-8")  # UTF-8 sin BOM
    return "written" if not dry_run else "would-write"


def iter_tree_lines() -> list[str]:
    """Devuelve el filetree como lista de líneas `path/` o `path` ordenadas."""
    entries: list[str] = []
    for path in sorted(ROOT.rglob("*")):
        try:
            rel = path.relative_to(ROOT)
        except ValueError:
            continue
        parts = rel.parts
        if any(p in SKIP_DIRS for p in parts):
            continue
        name = path.name
        if name in SKIP_NAMES:
            continue
        if path.is_file() and path.suffix in SKIP_SUFFIXES:
            continue
        # Omitir contenido volátil de data/ (solo conservar .gitkeep)
        if parts[0] == "data" and path.is_file() and name != ".gitkeep":
            continue
        suffix = "/" if path.is_dir() else ""
        entries.append(rel.as_posix() + suffix)
    # Quitar la propia salida generada y directorios vacíos de ruido ya filtrados
    entries = [e for e in entries if e != "ARCHITECTURE.md"]
    return entries


def read_csv_rows() -> list[dict[str, str]]:
    with CSV.open("r", encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        rows = []
        for row in reader:
            path = (row.get("path") or "").strip()
            if not path:
                continue
            rows.append(
                {
                    "path": path,
                    "description": (row.get("description") or "").strip(),
                    "context": (row.get("context") or "").strip(),
                }
            )
    return rows


def md_escape(text: str) -> str:
    return text.replace("|", "\\|").replace("\n", " ").strip()


def build_annex(tree: list[str], rows: list[dict[str, str]]) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines = [
        "---",
        "",
        f"> Anexo generado automáticamente el {stamp} por `architecture/generate_architecture.py`. No editar a mano.",
        "",
        "## Anexo A — Filetree real del repositorio",
        "",
        "```text",
        "piano-mentor-ai/",
    ]
    lines.extend(f"├── {e}" for e in tree)
    lines.append("```")
    lines.append("")
    lines.append("## Anexo B — Contexto por archivo (`architecture/files.csv`)")
    lines.append("")
    lines.append("| Ruta | Descripción | Contexto para el agente |")
    lines.append("|---|---|---|")
    for r in rows:
        lines.append(
            f"| `{md_escape(r['path'])}` | {md_escape(r['description'])} | {md_escape(r['context'])} |"
        )
    lines.append("")
    lines.append(
        "_Para añadir un archivo nuevo: agrega su fila en `architecture/files.csv` "
        "y ejecuta `python architecture/generate_architecture.py`._"
    )
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    flags = set(sys.argv[1:])
    write_mode = "--write" in flags
    dry_run = "--dry-run" in flags

    if not BASE.exists():
        raise SystemExit(f"[ERROR] No existe la base: {BASE}")
    if not CSV.exists():
        raise SystemExit(f"[ERROR] No existe el CSV: {CSV}")

    rows = read_csv_rows()

    if write_mode:
        stats: dict[str, int] = {}
        for r in rows:
            target = ROOT / r["path"]
            if not target.exists():
                print(f"  [omitido] {r['path']} (no existe en disco)")
                stats["skipped:no-existe"] = stats.get("skipped:no-existe", 0) + 1
                continue
            if target.is_dir():
                print(f"  [omitido] {r['path']} (es carpeta)")
                stats["skipped:carpeta"] = stats.get("skipped:carpeta", 0) + 1
                continue
            if not r["description"] and not r["context"]:
                print(f"  [omitido] {r['path']} (fila vacía en CSV)")
                stats["skipped:vacio"] = stats.get("skipped:vacio", 0) + 1
                continue
            result = apply_header(target, r["description"], r["context"], dry_run)
            stats[result] = stats.get(result, 0) + 1
            if result in ("written", "would-write"):
                print(f"  [{'escrito' if result == 'written' else 'escribiría'}] {r['path']}")
            elif result == "unchanged":
                print(f"  [igual] {r['path']}")
            else:
                print(f"  [omitido] {r['path']} ({result.split(':', 1)[1]})")
        label = " (dry-run, sin cambios)" if dry_run else ""
        print(f"[WRITE{label}] {stats}")

    base_text = BASE.read_text(encoding="utf-8").rstrip() + "\n"
    tree = iter_tree_lines()
    annex = build_annex(tree, rows)

    if not dry_run:
        OUT.write_text(base_text + "\n" + annex, encoding="utf-8")
        print(f"[DONE] {OUT} generado desde {BASE.name} + filetree ({len(tree)} entradas) + {CSV.name} ({len(rows)} filas).")
    else:
        print(f"[DRY-RUN] {OUT} no modificado; filetree ({len(tree)} entradas), CSV ({len(rows)} filas).")

    # Avisos útiles (no bloquean): CSV vs realidad
    real_files = {e.rstrip("/") for e in tree}
    csv_paths = {r["path"] for r in rows} - {"ARCHITECTURE.md"}
    missing = sorted(csv_paths - real_files - {d.rstrip("/") for d in tree})
    # Solo avisar de archivos fuente relevantes, no de carpetas genéricas
    relevant_missing = [m for m in missing if not m.startswith("issues/")]
    if relevant_missing:
        print("[WARN] En files.csv pero no existen en disco:")
        for m in relevant_missing:
            print(f"  - {m}")


if __name__ == "__main__":
    main()
