---
name: piano-mentor-architecture
description: Mantenimiento de la arquitectura de PianoMentor AI. Usar al documentar archivos nuevos, mover módulos, o actualizar ARCHITECTURE.md, architecture_base.md o architecture/files.csv. Regenera ARCHITECTURE.md desde la base + filetree real + CSV.
---
<!-- description: Skill de arquitectura: regenerar ARCHITECTURE.md desde base + CSV + filetree. -->
<!-- context: Cargar al documentar archivos o estructura; ejecuta el script. -->

# PianoMentor Architecture

## Objetivo

Mantener `ARCHITECTURE.md` sincronizado con el código real sin reescribirlo a mano y dar a cualquier agente el contexto de cada archivo en un solo CSV.

## Fuentes de verdad

- `architecture/architecture_base.md`: contenido manual (principios, capas, contratos, evolución). **Sí se edita.**
- `architecture/files.csv`: contexto por archivo (`path,description,context`). **Sí se edita.**
- `architecture/generate_architecture.py`: script generador. Solo se toca si cambia el formato.
- `ARCHITECTURE.md`: salida generada (base + Anexo A filetree + Anexo B tabla CSV). **No editar a mano.**

## Flujo obligatorio

1. Leer `architecture/files.csv` para localizar el contexto de cada archivo.
2. Si el cambio es arquitectónico, editar `architecture/architecture_base.md`, nunca `ARCHITECTURE.md`.
3. Si se crea, mueve o elimina un archivo relevante, añadir/actualizar su fila en `architecture/files.csv` (`path,description,context` en una línea, sin saltos).
4. Regenerar desde la raíz del repo:

```powershell
python architecture/generate_architecture.py
```

5. Revisar el diff de `ARCHITECTURE.md` (Anexo A y Anexo B) antes de commitear.

## Escritura de cabeceras en archivos (`--write`)

El CSV es la fuente de verdad; con `--write` el script propaga `description` y `context` como comentario de cabecera en cada archivo (estilo según extensión: `#` en Python/Dockerfile/YAML, `//` en TS/JS, `<!-- -->` en Markdown tras el frontmatter, `/* */` en CSS). Reemplaza la cabecera anterior sin duplicar.

```powershell
python architecture/generate_architecture.py --write --dry-run  # previsualizar
python architecture/generate_architecture.py --write            # aplicar + regenerar
```

Omitidos automáticamente: `*.json` (rompería contratos), `.gitkeep`, `LICENSE`, `files.csv`, `ARCHITECTURE.md` (generado) y rutas inexistentes. Tras aplicar, ejecutar los tests del área tocada y revisar el diff (debe ser +2 líneas de cabecera por archivo).

## Reglas del script

- Nunca modifica `architecture_base.md` ni `files.csv`; solo escribe `ARCHITECTURE.md`.
- Es reejecutable: siempre reconstruye los anexos desde la base, sin duplicarlos.
- Omite ruido del filetree: `.git`, `__pycache__`, `node_modules`, `.next`, `venv`, `*.pyc`, `*.skill`, contenido volátil de `data/` (conserva `.gitkeep`).
- Avisa en consola si una ruta del CSV ya no existe en disco.

## Checklist antes de entregar

- [ ] La base sigue siendo la fuente manual y el final solo añade anexos.
- [ ] Cada archivo nuevo o movido tiene su fila en `files.csv`.
- [ ] Se ejecutó el script y `ARCHITECTURE.md` contiene el filetree actualizado.
- [ ] No se editó `ARCHITECTURE.md` directamente.
