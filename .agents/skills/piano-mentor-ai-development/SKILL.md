---
name: piano-mentor-ai-development
description: Desarrollo y mantenimiento de PianoMentor AI, un sistema interactivo de enseñanza de piano basado en MIDI, FastAPI y un agente pedagógico validado. Usar al modificar este proyecto, diseñar módulos, implementar parsing o reproducción MIDI, evaluar interpretaciones, crear la consola retro, integrar el frontend o añadir LangGraph/LLM.
license: Complete terms in LICENSE.txt
---

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

## Arquitectura recomendada

Organizar el código para que consola y frontend compartan el mismo dominio:

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
console/              interfaz TUI retro; sin lógica musical duplicada
frontend/             Next.js, TypeScript, Tone.js y visualización
shared/               esquemas compartidos cuando sea necesario
data/                 MIDI de prueba y fixtures
```

Preferir módulos pequeños y contratos explícitos. La consola debe llamar a casos de uso del dominio; no debe importar directamente detalles de Mido para implementar reglas propias.

## Orden de implementación

Seguir este orden salvo una justificación explícita:

1. Leer MIDI y normalizar notas, tracks, tempo y compases.
2. Implementar reproducción y un piano virtual de consola.
3. Capturar eventos del teclado del ordenador.
4. Comparar notas esperadas y recibidas.
5. Calcular precisión, timing, notas omitidas y notas extra.
6. Implementar la máquina de estados sin LLM.
7. Exponer casos de uso mediante FastAPI.
8. Añadir Docker y Docker Compose reproducibles.
9. Crear frontend web con Next.js/TypeScript y Tone.js.
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

Usar Docker desde el inicio para reproducibilidad. Separar dependencias de producción y desarrollo cuando sea práctico. En imágenes FastAPI:

- copiar primero los archivos de dependencias para aprovechar la caché;
- usar un `CMD` en formato exec;
- no incluir secretos en la imagen;
- montar datos o fixtures de desarrollo de forma explícita;
- mantener un healthcheck sencillo.

## Interfaz de consola retro

La primera interfaz puede usar Rich o Textual y debe mostrar como mínimo:

- pieza cargada;
- tempo y sección actual;
- modo del agente;
- teclado de piano estilizado;
- nota esperada y nota recibida;
- puntuaciones de notas y timing;
- quién controla el piano;
- acción actual y motivo;
- pausa, detención y devolución de control.

La estética puede inspirarse en paneles retro de teclados Yamaha, pero no copiar marcas, logotipos ni recursos propietarios.

## Frontend web

Preferir Next.js, TypeScript, Tone.js y Canvas/SVG. Mantener la evaluación local o en un proceso de baja latencia cuando sea necesario. Usar WebSocket para estado de sesión en tiempo real y HTTP para operaciones de piezas, sesiones y acciones.

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

Versionar o documentar cualquier cambio incompatible.

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
- arranque reproducible con Docker.

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
- [ ] Se verificó el arranque local o Docker afectado.
- [ ] Se documentaron decisiones de arquitectura.
