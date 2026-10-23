---
name: piano-mentor-architecture
description: Mantenimiento de la arquitectura de PianoMentor AI. Usar al documentar archivos nuevos, mover módulos, registrar o sustituir una decisión (ADR), o actualizar ARCHITECTURE.md, architecture_base.md o docs/architecture/files.csv. Regenera ARCHITECTURE.md desde la base + filetree real + CSV.
---
<!-- description: Skill de arquitectura: regenerar ARCHITECTURE.md desde base + CSV + filetree. -->
<!-- context: Cargar al documentar archivos o estructura; ejecuta el script. -->

# PianoMentor Architecture

## Objetivo

Mantener `ARCHITECTURE.md` sincronizado con el código real sin reescribirlo a mano y dar a cualquier agente el contexto de cada archivo en un solo CSV.

## Fuentes de verdad

- `docs/architecture/architecture_base.md`: contenido manual (principios, capas, contratos, evolución). **Sí se edita.**
- `docs/architecture/files.csv`: contexto por archivo (`path,description,context`). **Sí se edita.**
- `docs/architecture/generate_architecture.py`: script generador. Solo se toca si cambia el formato.
- `ARCHITECTURE.md`: salida generada en la raíz (base + Anexo A filetree + Anexo B tabla CSV). **No editar a mano.**

## Mapa de documentación

- Raíz: `README.md`, `PLAN.md`, `GLOSSARY.md`, `AGENTS.md` y `ARCHITECTURE.md` (generado).
- `docs/architecture/`: fuentes de `ARCHITECTURE.md` (base, CSV y generador).
- `docs/decisions/`: un ADR por decisión de arquitectura.
- `docs/issues/`: especificación versionada de cada Issue y Sub-issue.
- `docs/design/`: referencias visuales de la interfaz.
- `docs/`: guías operativas (`GETTING_STARTED.md`, `TROUBLESHOOTING.md`, `DEMO_AGENT.md`).

Todo lo narrativo vive bajo `docs/`; la raíz solo conserva los documentos que se leen primero.

## Decisiones de arquitectura (ADR)

- Formato: `docs/decisions/000N-titulo-corto.md` con estado, fecha, contexto, opciones consideradas, decisión y consecuencias.
- Un ADR **aceptado no se edita**: si la decisión cambia, se crea el número siguiente y el anterior se marca como `sustituida por 000N`.
- Si un cambio altera capas, contratos, persistencia o el papel del LLM, se escribe o sustituye el ADR **antes** de tocar código.
- ADR vigentes: `0001` monorepo, `0002` motor determinista, `0003` interfaz web, `0004` acciones estructuradas, `0005` SQLite + sqlite-vec.
- Los ADR son archivos como cualquier otro: fila en `files.csv` y regeneración.

## Flujo obligatorio

1. Leer `docs/architecture/files.csv` para localizar el contexto de cada archivo.
2. Si el cambio es arquitectónico, escribir o sustituir el ADR en `docs/decisions/` y editar `docs/architecture/architecture_base.md`, nunca `ARCHITECTURE.md`.
3. Si se crea, mueve o elimina un archivo relevante, añadir/actualizar su fila en `docs/architecture/files.csv` (`path,description,context` en una línea, sin saltos).
4. Regenerar (el script localiza la raíz del repo por `.git`; vale desde cualquier carpeta):

```powershell
python docs/architecture/generate_architecture.py
```

5. Revisar el diff de `ARCHITECTURE.md` (Anexo A y Anexo B) antes de commitear.

## Escritura de cabeceras en archivos (`--write`)

El CSV es la fuente de verdad; con `--write` el script propaga `description` y `context` como comentario de cabecera en cada archivo (estilo según extensión: `#` en Python/Dockerfile/YAML, `//` en TS/JS, `<!-- -->` en Markdown tras el frontmatter, `/* */` en CSS). Reemplaza la cabecera anterior sin duplicar.

```powershell
python docs/architecture/generate_architecture.py --write --dry-run  # previsualizar
python docs/architecture/generate_architecture.py --write            # aplicar + regenerar
```

Omitidos automáticamente: `*.json` (rompería contratos), `.gitkeep`, `LICENSE`, `files.csv`, `ARCHITECTURE.md` (generado) y rutas inexistentes. Tras aplicar, ejecutar los tests del área tocada y revisar el diff (debe ser +2 líneas de cabecera por archivo).

> **Deriva conocida (2026-10-23):** `--write --dry-run` marca ~184 ficheros porque las descripciones del CSV evolucionaron sin re-propagarse. No lanzar `--write` global dentro de un cambio funcional: hacerlo en un commit propio, con el árbol limpio, y comprobar que el diff solo toca cabeceras.

## Reglas del script

- Nunca modifica `architecture_base.md` ni `files.csv`; solo escribe `ARCHITECTURE.md`.
- Es reejecutable: siempre reconstruye los anexos desde la base, sin duplicarlos.
- Omite ruido del filetree: `.git`, `__pycache__`, `node_modules`, `.next`, `venv`, `*.pyc`, `*.skill`, contenido volátil de `data/` (conserva `.gitkeep`).
- Avisa en consola si una ruta del CSV ya no existe en disco, salvo las de `docs/issues/`: una Issue sin documento local es un caso válido, no un error.

## Checklist antes de entregar

- [ ] La base sigue siendo la fuente manual y el final solo añade anexos.
- [ ] Cada archivo nuevo o movido tiene su fila en `files.csv`.
- [ ] Si la decisión es arquitectónica, existe su ADR (o el que la sustituye) en `docs/decisions/`.
- [ ] Se ejecutó el script y `ARCHITECTURE.md` contiene el filetree actualizado.
- [ ] No se editó `ARCHITECTURE.md` directamente.
