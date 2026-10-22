---
name: piano-mentor-add-piece
description: Añadir una pieza MIDI nueva al corpus de PianoMentor AI: elegir fuente (piano, no orquesta), licencia de la transcripción, descargar y analizar el MIDI, buscar portada de dominio público en Wikimedia Commons, entrada en catalog.json, recuento de tests que fijan números, recarga obligatoria de SQLite, documentación y verificación. Usar al meter una canción nueva, ampliar el repertorio, arreglar una pieza del catálogo o cambiar la pieza por defecto de la portada.
---
<!-- description: Skill de altas de piezas: fuente, MIDI, portada, catálogo, tests y base. -->
<!-- context: Cargar al añadir una canción nueva al corpus o al elegir pieza por defecto. -->

# PianoMentor Add Piece

## Objetivo

Que una pieza nueva sirva en la Library, suene en el piano de 88 teclas con las
manos bien etiquetadas y con su procedencia documentada, sin romper los tests
que fijan recuentos ni dejar la portada descolocada.

Proceso real: `p17`, la reducción para piano de la *Sinfonía n.º 5* de Beethoven
(commit `dd9068c`). Los errores de ese alta son los que recogen las reglas de abajo.

## Reglas de oro (antes de descargar nada)

1. **Tiene que ser una pieza de piano.** El criterio del proyecto es un corpus de
   piezas MIDI de piano (README, PLAN) y el etiquetado de manos (B-009.2) deduce
   izquierda/derecha de la altura de la pista. Un MIDI orquestal **no sirve**: la
   partitura de Gutenberg de la 5.ª traía 26 pistas (18 con notas: flautas, oboes,
   trompetas, timbales, cuerdas) y 9 869 notas, frente a la reducción de Mutopia
   con 3 pistas (`rh:`/`lh:`) y 4 223 notas. Ojo: **la regla de manos da un OK
   falso en la orquesta** (timbales→izquierda, flauta→derecha); quien la detecta
   es el recuento de pistas, por eso el script lo mira aparte.
2. **La licencia que importa es la de la transcripción MIDI, no la de la obra.**
   Todo el mundo puede copiar la 5.ª; no cualquier MIDI de la web está cedido.
   `ALLOWED_LICENSES` en `test_catalog.py`: `Public Domain`, `CC BY-SA 3.0`,
   `CC BY-SA 2.5`, `CC0-1.0` (con CC BY-SA, anota la versión y atribuye al
   transcriptor en el `source_note`/comentario).
3. **Los `.mid` del corpus sí se versionan** (política revisada 2026-10): las
   licencias de las transcripciones (Public Domain, CC0 y CC BY-SA con
   atribución en `catalog.json` y `CREDITS.md`) permiten redistribución, y el
   despliegue en Render necesita el corpus en el repo para sembrar la Library
   sin depender de la disponibilidad de Mutopia en cada arranque.

## Fuentes

| Fuente | Cuándo | Cómo |
|---|---|---|
| **Mutopia Project** (preferida) | Casi siempre: repertorio de piano, PD o CC BY-SA, URL directa | Página de la pieza `piece-info.cgi?id=<n>` → enlace *MIDI file* bajo `/ftp/...` y `Copyright` en la tabla |
| **Project Gutenberg** | Solo si confirma que es arreglo para piano | `files/<id>/<id>-h/music/*.mid`; muchas colecciones son transcripciones **orquestales por instrumento** |
| IMSLP / otros | Último recurso | Exigir la licencia de ese fichero MIDI concreto, no la de la partitura |

Mismo sitio que las 15 piezas ya incluidas: Mutopia garantiza procedencia
(`source_url` trazable) y licencia declarada en la propia página.

## 1. Descarga y análisis

```powershell
curl -sS -L -o "$env:TEMP\candidato.mid" "<URL MIDI>"
python .agents/skills/piano-mentor-add-piece/scripts/analyze_piece.py "$env:TEMP\candidato.mid"
```

El script imprime tipo, pistas, notas, rango, tempo y manos, y termina con
`VEREDICTO: APTO` (salida 0) o `NO APTO` (salida 1). Qué comprueba, que es lo
que luego van a exigir los tests:

- Notas con el criterio exacto de `count_notes`: `note_on` con `velocity > 0`.
- Pistas con notas `[1, 2]` (la 0 es de metadatos). Más pistas ⇒ orquesta.
- Mano izquierda = pista grave: mediana **y** altura mínima menores que la derecha.
- Notas dentro de 21-108 (piano de 88 teclas).
- Tempo entre 30 y 240 BPM. Si el número huele raro, contrasta la duración con
  otra fuente independiente del mismo movimiento: la de Gutenberg y la de Mutopia
  quedaron en 202,5 BPM/300 s y 216 BPM/280 s ⇒ el archivo **no** iba a doble velocidad.

Si está bien, se mueve al corpus con nombre descriptivo en inglés:

```powershell
Move-Item "$env:TEMP\candidato.mid" "data\midi\corpus\beethoven_symphony_no5_piano.mid"
```

## 2. Portada (carátula)

Convenio vigente en `CREDITS.md`: retratos de **dominio público** (obra anterior a
1900, PD-old-100), verticales, ~960 px de ancho, **sin texto superpuesto** (el
título y el compositor los pinta la interfaz).

1. **Mira antes si el compositor ya tiene retrato** en
   `frontend/public/assets/covers/`: hoy `bach.jpg`, `mozart.jpg`, `beethoven.jpg`,
   `chopin.jpg`. Se reutiliza por slug `<compositor en minúsculas sin espacios>.jpg`
   y solo hay que añadir el id a la lista de asignación. No dupliques retratos.
2. **Si no existe, búscalo y verifícalo:**

   ```powershell
   python .agents/skills/piano-mentor-add-piece/scripts/cover_from_commons.py --search "<compositor> portrait"
   python .agents/skills/piano-mentor-add-piece/scripts/cover_from_commons.py --file "File:<nombre elegido>" --save <slug>
   ```

   Lista candidatos de Wikimedia Commons con dimensiones y licencia en una sola
   llamada, marca `PD OK` / `REVISAR` / `NO APTA`, descarga a 960 px (Commons no
   amplía: por eso avisa de las estrechas) y imprime la fila de `CREDITS.md` lista
   para pegar. Solo acepta PD/CC0; el CC BY-SA queda fuera porque CREDITS.md
   guarda solo dominio público y meterías ShareAlike en el repo.
3. **Completa la fila** de la tabla de `CREDITS.md` con `Retratado` y `Obra`
   (los dos huecos que deja el script) y añade el id en la lista
   `Asignacion a las piezas`. `CREDITS.md` está en ASCII sin acentos: mantenlo.
4. **`catalog.json`**: `cover: "/assets/covers/<slug>.jpg"` es obligatorio en las
   piezas de terceros (`test_third_party_covers_point_to_public_assets` exige que
   empiece por `/assets/covers/` y termine en `.jpg`; `test_referenced_covers_exist`
   exige que el fichero exista).

## 3. Entrada en `data/midi/catalog.json`

- `id` incremental `pNN` y **al final del array**: `test_piece_ids_unique_and_ordered`
  exige el orden exacto `p01..pN`.
- Campos obligatorios: `id`, `title`, `composer`, `file`, `license`, `difficulty`;
  de terceros además `source_url` (https) y `cover`.
- `file`: `corpus/<fichero>.mid`.
- `difficulty`: `principiante` | `intermedio` | `avanzado`. Cójela por densidad
  (notas/duración) frente a las existentes: `p17` con 4 223 notas en 4:41 es la
  más densa del corpus ⇒ `avanzado`.
- `notes` **exactamente** igual que `count_notes` y `duration_s` con un decimal
  (los imprime el script de análisis); `tracks` = todas las pistas del fichero.

## 4. Ficheros con recuentos fijos

Al cambiar el número de piezas hay que mover todos a la vez:

| Fichero | Qué fijar |
|---|---|
| `backend/tests/test_catalog.py` | `THIRD_PARTY_PIECES` y el comentario "las N piezas de terceros" |
| `backend/tests/test_catalog_load.py` | `CATALOG_PIECES` (terceros + propia), su comentario y la cabecera `description:` |
| `backend/tests/test_hands.py` | `assert len(third_party_pieces()) == N` y el comentario de la misma función |
| `backend/scripts/describe_corpus_tracks.py` | `EXPECTED_LEFT_TRACK["pNN"]` con el índice de la pista grave; sin esa entrada el script imprime **no** en la comprobación |

**No** se tocan `issues/**` ni `.github_projects/**`: son el histórico de issues
ya cerradas. En `PLAN.md` solo el objetivo de validación, no las mediciones
narradas de B-009.

## 5. Recarga obligatoria de la base (la trampa)

```powershell
$env:PYTHONPATH="backend\src"; python -m piano_mentor.catalog
# Salida esperada: Catálogo cargado: N piezas en sqlite:///./data/piano_mentor.db
```

`ensure_catalog_loaded` solo siembra el corpus cuando la tabla **no tiene ninguna
pieza suya**: con una base existente el id nuevo **nunca entra**. Entonces
`GET /pieces` no lo lista y `GET /pieces/{id}/notes` responde 404… y la portada
no se entera, porque `PlaybackArea` traga el error y sigue funcionando sin
partitura. Con el alta de `p17` pasó: la base local tenía `p01`-`p15` y ni siquiera
`p16`. En cualquier máquina con base ya creada hay que lanzar este comando.

Comprobación rápida con la API sin levantar servidores (guárdalo en `%TEMP%` y
ejecútalo desde la raíz):

```python
import sys; from pathlib import Path
sys.path.insert(0, r"<ruta>\backend\src")
from fastapi import FastAPI
from fastapi.testclient import TestClient
from piano_mentor.api import router
app = FastAPI(); app.include_router(router); client = TestClient(app)
ids = [p["id"] for p in client.get("/api/v1/pieces?source=corpus").json()]
r = client.get("/api/v1/pieces/p17/notes")
print("p17 listada:", "p17" in ids, "| notas:", len(r.json()["notes"]))
```

## 6. Pieza por defecto de la portada (opcional)

- `frontend/src/components/PlaybackArea/PlaybackArea.tsx`: `DEMO_PIECE_ID` (la que
  suena sin pieza elegida) y `DEMO_SONG_TITLE` (lo que anuncia la barra). Van
  juntos a propósito: el título nunca puede ser un marcador que diga otra cosa
  de lo que suena.
- Por eso `songTitle`/`title` son **obligatorios** en `PlayerBar`/`SongInfo`:
  no reintroducir un valor fijo por defecto.
- Antes de cambiar la constante, comprueba que el `.mid` existe en el host: una
  pieza por defecto sin fichero es una portada en negro.

## 7. Documentación

| Fichero | Qué queda |
|---|---|
| `README.md` | "corpus de N piezas MIDI de piano" |
| `PLAN.md` | objetivo de validación (solo ese enunciado) |
| `GLOSSARY.md` | "un corpus de N piezas MIDI" |
| `architecture/architecture_base.md` | "las N piezas de terceros…`p16`" |
| `docs/GETTING_STARTED.md` | recuento de piezas y la salida esperada del cargador |
| `frontend/public/assets/covers/CREDITS.md` | tabla y asignación de portadas |
| `architecture/files.csv` | `description`/`context` de los ficheros tocados |
| `ARCHITECTURE.md` | **no se edita a mano**: `python architecture/generate_architecture.py` |

## 8. Verificación

```powershell
cd backend;  python -m pytest -q          # recuentos, catálogo y manos
cd frontend; npx tsc --noEmit; npm test; npm run build
python architecture/generate_architecture.py
```

Mínimo: ambas suites en verde, la prueba de humo del paso 5 y un ojo en la
Library (la pieza aparece, la portada carga y la barra anuncia el título correcto).

## 9. Git

- En el commit van `catalog.json`, portadas, ficheros propios y también los
  `.mid` del corpus (versionados desde la política revisada de 2026-10:
  licencias redistribuibles con atribución).
- Revisa `git status` y deja fuera el trabajo en curso del usuario.
- Regenera `files.csv`/`ARCHITECTURE.md` justo antes de commitear.

## Checklist

- [ ] El MIDI es de **piano** (≤2 pistas con notas) y su licencia está en `ALLOWED_LICENSES`.
- [ ] `analyze_piece.py` → `VEREDICTO: APTO`; manos con la pista grave como izquierda.
- [ ] Fichero en `data/midi/corpus/` con nombre descriptivo.
- [ ] Entrada `pNN` al final de `catalog.json`, con `notes` exactos y `cover`.
- [ ] Portada PD de 960 px + fila y asignación en `CREDITS.md`.
- [ ] Recuentos actualizados en `test_catalog`, `test_catalog_load`, `test_hands` y `EXPECTED_LEFT_TRACK`.
- [ ] `python -m piano_mentor.catalog` relanzado y pieza visible en `GET /pieces`.
- [ ] Documentación (README, PLAN, GLOSSARY, GETTING_STARTED, architecture_base).
- [ ] `pytest`, `tsc`, `npm test`, `next build` y regeneración de `ARCHITECTURE.md` en verde.
