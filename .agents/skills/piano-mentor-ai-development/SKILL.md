---
name: piano-mentor-ai-development
description: Desarrollo y mantenimiento de PianoMentor AI, un sistema interactivo de enseñanza de piano basado en MIDI, FastAPI y un agente pedagógico validado. Usar al modificar este proyecto, diseñar módulos, implementar parsing o reproducción MIDI, evaluar interpretaciones, integrar el frontend web o añadir LangGraph/LLM.
license: Complete terms in LICENSE.txt
---
<!-- description: Skill de desarrollo: separación determinista/API/UI/agente, contratos y checklist. -->
<!-- context: Cargar al modificar MIDI, evaluación, frontend o agente. -->

# PianoMentor AI Development

## Objetivo

Mantener PianoMentor AI como un sistema de enseñanza musical interactivo, no como un chatbot genérico. Leer siempre el `README.md` raíz antes de modificar la arquitectura o el comportamiento del producto.

## Principios obligatorios

1. Separar estrictamente el motor musical determinista, la API, la interfaz y el agente pedagógico.
2. El código determinista controla MIDI, reproducción, timing y evaluación de notas.
3. El LLM solo puede proponer acciones estructuradas; nunca puede enviar MIDI, ejecutar comandos del sistema ni controlar directamente el reloj de reproducción.
4. Validar toda acción antes de ejecutarla con modelos tipados y una lista blanca.
5. Mantener visible quién tiene el control del piano.
6. Toda intervención de la IA debe ser limitada, pausible, detenible y devolver el control automáticamente.
7. El sistema debe funcionar sin LLM mediante reglas deterministas.
8. Añadir o actualizar tests cuando se modifique parsing, timing, evaluación, validación o transiciones de estado.
9. No ampliar el alcance del MVP sin documentar la razón.
10. Registrar cada decisión de arquitectura como ADR en `docs/decisions/`; un ADR aceptado no se edita, se sustituye por el siguiente número.
11. Para cualquier tarea legal o de cumplimiento (RGPD/LOPDGDD, privacidad, cookies/CMP, términos, aviso legal, derechos del interesado, transferencias), usar las skills `rgpd` y `terms-of-service` disponibles en `.agents/skills/`. Los textos generados son borradores para revisión legal, no asesoramiento jurídico.

## Arquitectura recomendada

Organizar el código para que backend, frontend y contratos compartan el mismo dominio:

```text
backend/
  src/piano_mentor/
    api/              FastAPI, DTOs y WebSockets
    application/      casos de uso
    domain/
      midi/           eventos, notas, compases y normalización
      performance/    comparación, timing y puntuaciones
      practice/       sesiones y ejercicios
      agent/          estados, acciones y reglas
    infrastructure/  Mido, SQLite + sqlite-vec, filesystem y proveedores externos
frontend/             Next.js, TypeScript, Web Audio (sampler + voz de reserva) y visualización
shared/               esquemas compartidos cuando sea necesario
data/                 MIDI de prueba y fixtures
```

Preferir módulos pequeños y contratos explícitos. La interfaz web debe llamar a casos de uso del dominio; no debe importar directamente detalles de Mido para implementar reglas propias.

La estructura por capas de arriba es el objetivo, no el estado actual (2026-10). El repo real es más plano: `backend/src/piano_mentor/` con módulos hermanos (`api.py`, `midi.py`, `evaluation.py`, `practice.py`, `agent.py`, `llm.py`, `chat.py`, `database.py`, `storage.py`, `catalog.py`, `schemas.py`, `tools.py`, `validators.py` y `migrations/`); `frontend/src/` con `app/`, `components/` y `lib/`; `shared/schemas/`; `data/`; `docs/` con `architecture/`, `decisions/`, `issues/` y `design/`; y `ARCHITECTURE.md` generado en la raíz. No crear carpetas de capas vacías: la separación se hace por módulo y por contrato hasta que el tamaño la justifique.

## Orden de implementación

Seguir este orden salvo una justificación explícita:

1. Leer MIDI y normalizar notas, tracks, tempo y compases.
2. Implementar reproducción y un piano virtual en el navegador.
3. Capturar eventos del teclado del ordenador.
4. Comparar notas esperadas y recibidas.
5. Calcular precisión, timing, notas omitidas y notas extra.
6. Implementar la máquina de estados sin LLM.
7. Exponer casos de uso mediante FastAPI.
8. Añadir Docker y Docker Compose reproducibles.
9. Crear el frontend web con Next.js/TypeScript y Web Audio.
10. Añadir Web MIDI API si el flujo principal ya es estable.
11. Integrar LangGraph para orquestación de alto nivel.
12. Conectar un LLM con salida estructurada y observabilidad.

## Contratos principales

Las acciones del agente deben ser datos, no código ejecutable:

```json
{
  "action": "demonstrate",
  "hand": "left",
  "measure_range": [12, 16],
  "tempo_ratio": 0.6,
  "repetitions": 1,
  "reason": "late_left_hand_entries"
}
```

Acciones permitidas inicialmente:

```text
wait
 demonstrate
accompany
give_hint
slow_down
return_control
```

Validar siempre:

- acción perteneciente a la lista blanca;
- MIDI cargado y sesión válida;
- rango de compases existente;
- mano con eventos disponibles;
- `tempo_ratio` entre `0.25` y `1.25`;
- repeticiones entre `1` y `8`;
- duración finita y timeout;
- registro de la acción, validación, ejecución y resultado.

## Máquina de estados

Usar primero una máquina explícita y testeable:

```text
START
  -> OBSERVING
  -> EVALUATING
  -> DECIDE_ACTION
  -> WAITING_FOR_STUDENT | DEMONSTRATING | ACCOMPANYING | GIVING_HINT
  -> EXECUTE_VALIDATED_ACTION
  -> OBSERVING
```

Reglas base de fallback:

```python
if repeated_errors >= 3:
    action = "demonstrate"
elif timing_score < 0.60:
    action = "slow_down"
elif notes_score >= 0.90 and timing_score >= 0.85:
    action = "accompany"
else:
    action = "wait"
```

LangGraph puede sustituir la orquestación posterior, pero no debe manejar cada `note_on`, el reloj de reproducción, el cálculo de timing ni la reproducción MIDI.

## Backend y Docker

Usar Python, FastAPI, Pydantic, SQLite + sqlite-vec durante el MVP, Mido y Pytest. Mantener configuración por variables de entorno y proporcionar `.env.example`.

**El `.env` real vive en la RAÍZ del repo** (junto a `docker-compose.yml`), ni en `backend/` ni en `frontend/`: front y back leen de ahí (el compose inyecta al backend y el front consume las `NEXT_PUBLIC_*`). El `.env.example` de la raíz es su plantilla versionada. Única excepción: `frontend/.env.local` (gitignored) para secretos y flags de Next que solo el front necesita (Auth.js de Google, `NEXT_PUBLIC_ENABLE_MIDI_UPLOAD` de B-023) — Next 16 solo lee los `.env*` de su propio directorio. Tras cambiar cualquier `NEXT_PUBLIC_*` hay que reiniciar `npm run dev`.

Usar Docker desde el inicio para reproducibilidad. Separar dependencias de producción y desarrollo cuando sea práctico. En imágenes FastAPI:

- copiar primero los archivos de dependencias para aprovechar la caché;
- usar un `CMD` en formato exec;
- no incluir secretos en la imagen;
- montar datos o fixtures de desarrollo de forma explícita;
- mantener un healthcheck sencillo.

## Frontend web

Para crear o rediseñar pantallas, apoyarse en **Stitch MCP** (`tools.stitch.*`) para generar el diseño/HTML de referencia y en la skill **`impeccable`** para revisar y pulir el resultado. El HTML de Stitch se adapta a los componentes React, tokens y CSS Modules del proyecto (ver skill `piano-mentor-css`); no se copia tal cual ni se introducen frameworks CSS nuevos.

**Aviso de identidad Stitch:** el proyecto Stitch existente (`projects/91769299213639956`) usa el sistema auto-generado "Acoustic Intelligence" (tema claro, violeta, Epilogue/Plus Jakarta Sans/JetBrains Mono), que **no coincide** con la identidad real (oscuro, navy+oro, Gabriola+Manrope). Sus pantallas son referencia **exploratoria**, no fiel. Ver `docs/design/stitch/README.md`. No adoptar ese tema ni esas fuentes.

Next.js y TypeScript, con Web Audio para el sonido y SVG para el teclado. El sampler de piano (Salamander) se programa contra `AudioContext.currentTime` y conserva una voz sintetizada de reserva; la evaluación vive en el backend y el navegador solo reproduce y pinta. Usar WebSocket para el estado de sesión en tiempo real y HTTP para piezas, sesiones y acciones.

La interfaz debe hacer visible el estado en todo momento:

- pieza cargada, tempo y compás actual;
- teclado de piano con nota esperada y nota recibida;
- puntuaciones de notas y timing;
- quién controla el piano (estudiante o agente);
- acción actual del agente y su motivo;
- pausa, detención y devolución de control.

### Convención de componentes (trío .tsx/.module.css/.types.ts)

Cada componente vive en su propia carpeta y se reparte en tres ficheros separados:

```text
Componente/
  ├── Componente.tsx         solo JSX y composición (sin lógica de negocio)
  ├── Componente.module.css  solo estilos del componente (CSS Modules)
  └── Componente.types.ts    solo props y tipos (interfaces exportadas)
```

Reglas:

- El `.tsx` no lleva tipos inline (van al `.types.ts`) ni estilos globales (van al `.module.css`).
- Los subcomponentes son subcarpetas que repiten el mismo trío.
- Los componentes solo llaman a la API vía `api-client.ts`; nunca `fetch` directo.
- La lógica testeable (matemática, transporte, validación) vive en `src/lib/`, no en los componentes.

La Web MIDI API requiere contexto seguro y permisos del usuario. Tratarla como capacidad opcional hasta validar la experiencia con teclado del ordenador.

## API conceptual

Conservar contratos equivalentes a:

```text
POST /pieces
GET  /pieces/{piece_id}
POST /sessions
POST /sessions/{session_id}/events
GET  /sessions/{session_id}/state
POST /sessions/{session_id}/action
POST /sessions/{session_id}/agent-step
```

Lo implementado en B-012.1 se aparta en un punto de esa lista: los eventos MIDI de la interpretación **no** tienen endpoint propio, entran por el WebSocket `WS /api/v1/ws/sessions/{session_id}` en un sobre `{type, ...}` (`state`, `error`; `agent_action` llega en B-012.5) y se persisten en `session_events`. Los códigos estables son `piece_not_found`, `session_not_found`, `invalid_event_payload` y `ws_error`, y un payload inválido no cierra la sesión.

Versionar o documentar cualquier cambio incompatible.

## Verificación: el agente no ejecuta Docker

El usuario valida los despliegues Docker; el agente no debe correr `docker`, `docker compose` ni comandos equivalentes (`build`, `up`, `exec`, `logs`, `ps`, healthchecks). El entorno local ya tiene las dependencias instaladas y es la vía de validación del agente:

- Frontend: `npm test -- --run` y `npm run build` dentro de `frontend/`.
- Backend: `python -m pytest -q` y `python -m compileall src tests` dentro de `backend/`.
- Arquitectura: `python docs/architecture/generate_architecture.py` (y `--write --dry-run` para previsualizar cabeceras).

Cuando una Issue pida verificación en Docker (por ejemplo, reproducir una pieza del corpus y adjuntar una captura), ese criterio queda **pendiente para el usuario**: el agente deja el código listo, ejecuta las validaciones locales y prepara un resumen con lo que hay que comprobar en el navegador, pero no arranca ni inspecciona contenedores.

## Pruebas mínimas

Antes de considerar terminado un cambio, ejecutar las pruebas disponibles y comprobar:

- parsing de MIDI válido y rechazo de archivos inválidos;
- normalización de notas, tempo, tracks y compases;
- cálculo de timing en casos adelantados, tardíos y exactos;
- notas correctas, omitidas y adicionales;
- rechazo de acciones desconocidas o fuera de límites;
- demostración con devolución automática del control;
- detención y pausa sin reproducción indefinida;
- funcionamiento con el LLM deshabilitado;
- endpoints de carga, sesión y estado;
- arranque reproducible con Docker (criterio que ejecuta el usuario, no el agente).

## Privacidad y fuentes musicales

Tratar los MIDI cargados como privados. No subir audio si no es necesario. No ejecutar contenido de archivos externos. Guardar procedencia y licencia cuando sea posible. Para demos, preferir composiciones de dominio público, MIDI creados por el proyecto o fuentes con licencia explícita. La composición de dominio público no implica que una transcripción MIDI concreta pueda redistribuirse.

## Checklist antes de entregar

- [ ] Se leyó el `README.md` raíz.
- [ ] El cambio pertenece a un módulo claramente identificado.
- [ ] No se mezcló UI con reproducción o evaluación.
- [ ] El LLM no controla MIDI directamente.
- [ ] Las acciones están validadas y limitadas.
- [ ] El control del piano es visible y reversible.
- [ ] Se añadieron o actualizaron tests.
- [ ] Se ejecutaron las validaciones locales afectadas (tests y build); Docker queda para el usuario.
- [ ] Se documentaron decisiones de arquitectura.


## Vertical B-032 (la sesion manda en el piano)

- **Transporte unico:** `TransportProvider` sube `usePlayback` al layout; `useTransport()` es el unico reloj. `PracticeBridge` consume y empuja posicion al backend.
- **t_s sin escalar:** `musicalPosition(position_s, tempoFactor)`; el motor guarda `position_s` escalado. WS envia `{type:position, t_s, measure}`; backend guarda y difunde por cambio de compas o cada 500 ms.
- **Puerto de entrada unico:** `note-input` (bus de modulo con puerta `setNoteInputEnabled`); la puerta corta solo `note_on` (audio+envio), `note_off` pasa siempre. PC keyboard, piano en pantalla y Web MIDI entran por ahi. El adaptador del teclado del PC vive en `TransportProvider`.
- **Distribucion partida:** `splitLayoutFor` con ventanas de 17 semitonos por mano, alineadas a la nota mas grave de cada mano (no a Do).
- **Gate en navegador, backend decide:** `control: agent` bloquea `note_on`; `return_control` reabre. Strikes: grano=gate, decision por compas (2 fallos->slow_down, 3->give_hint, silencio->demonstrate).
- **Evaluacion por mano (B-032.3):** `PerformanceEvaluator`/`EvaluationService` aceptan `hand` (left/right/both, default both). Filtro de notas esperadas por `hand_by_track` antes de `group_chords`. Filtro de recibidas por altura (`pitch_hands`). Contrato HTTP `hand` opcional + `invalid_hand` (400). Migracion `0011` anade columnas `mode`/`hand` a `sessions` (defaults observe/both).
- **Modos (B-032.4 pendiente):** observar/una mano/dos manos; selector gobierna cascada, audio y evaluacion; se restaura tras intervencion.
