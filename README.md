# 🎹 PianoMentor AI

> **Profesor de piano virtual con IA** que analiza la interpretación del estudiante, reproduce MIDI, genera ejercicios y puede tomar temporalmente el control del piano para demostrar o acompañar una sección.

![Estado](https://img.shields.io/badge/estado-MVP%20en%20desarrollo-orange)
![Backend](https://img.shields.io/badge/backend-Python%20%7C%20FastAPI-009688)
![IA](https://img.shields.io/badge/IA-LLM%20%2B%20LangGraph-6f42c1)

**PianoMentor AI** convierte una pieza MIDI en una sesión de práctica adaptativa: observa al estudiante, evalúa su interpretación y propone una intervención pedagógica concreta.

## 📚 Propósito de este documento

Este README funciona como **contexto de producto, arquitectura y desarrollo** para cualquier persona o agente de IA que vaya a crear, modificar o revisar PianoMentor AI.

Antes de implementar una funcionalidad, la IA debe leer este documento y respetar especialmente estas reglas:

1. **La IA coordina la enseñanza; el código determinista controla el MIDI.**
2. **No se debe construir un chatbot genérico.** El agente tiene que interactuar con una pieza, una interpretación y un estado pedagógico.
3. **El estudiante debe conservar el control final.** La IA solo toma el piano temporalmente dentro de una acción explícita y visible.
4. **Toda acción producida por un LLM debe validarse antes de ejecutarse.**
5. **El MVP debe priorizar MIDI, piano virtual, evaluación y demostración antes que funcionalidades secundarias.**

---

## 🎯 Objetivos del proyecto

### Objetivo general

> **Desarrollar en un plazo de seis semanas una aplicación web de mentoría para el aprendizaje de piano basada en inteligencia artificial, capaz de cargar, analizar y reproducir piezas MIDI, evaluar la interpretación del estudiante mediante métricas de precisión y timing, y proporcionar intervenciones pedagógicas personalizadas como pistas, demostraciones y acompañamiento, procesando correctamente al menos el 80 % de un corpus validado de 15 piezas MIDI de piano de dominio público o con licencia compatible.**

El porcentaje se medirá sobre un **corpus de validación definido para el MVP**. Una pieza se considerará procesada correctamente cuando pueda cargarse, analizarse, reproducirse y utilizarse dentro del flujo de práctica sin errores críticos.

### Objetivos específicos

1. 🧱 Diseñar una arquitectura modular y reproducible con Python, FastAPI, Docker y Docker Compose.
2. 🎼 Implementar la carga, validación, normalización, reproducción y análisis de archivos MIDI.
3. 🎹 Crear un piano virtual web con una interfaz visual inspirada en paneles retro de teclados electrónicos.
4. 🎧 Capturar la interpretación del estudiante mediante el teclado del ordenador y dejar preparada la integración con dispositivos MIDI físicos.
5. 📊 Evaluar notas correctas, omitidas, adicionales, precisión, timing, errores repetidos y secciones débiles.
6. 🧠 Implementar una máquina de estados pedagógica que represente la observación, evaluación, decisión e intervención del agente.
7. 🤖 Integrar LangGraph y un proveedor LLM para generar recomendaciones y feedback pedagógico estructurado.
8. 🛡️ Validar toda acción del agente antes de ejecutarla y garantizar que la IA nunca controle directamente el motor MIDI.
9. 🔁 Permitir demostraciones y acompañamientos limitados, pausables y con devolución automática del control al estudiante.
10. ✅ Crear pruebas automatizadas, documentación y una demo reproducible de extremo a extremo.

El detalle de ejecución, entregables y prioridades por semana se encuentra en [PLAN.md](PLAN.md).

---

## 🧭 Navegación rápida

- [Objetivos del proyecto](#-objetivos-del-proyecto)
- [Visión del producto](#1-️-visión-del-producto)
- [Alcance del MVP](#2-📦-alcance-del-mvp)
- [Arquitectura técnica](#7-️-arquitectura-técnica)
- [Roadmap](#14-️-roadmap)
- [Plan de trabajo de seis semanas](PLAN.md)
- [Criterios de aceptación](#15-️-criterios-de-aceptación-del-mvp)

---

## ⚙️ Estado actual de configuración

La configuración local confirmada para el MVP es:

- **Proveedor LLM inicial:** Groq mediante API compatible con OpenAI.
- **Modelo inicial validado:** `openai/gpt-oss-20b`.
- **Observabilidad:** LangSmith habilitado para tracing de alto nivel en el proyecto `PianoMentor`.
- **Persistencia:** SQLite local.
- **Archivos MIDI:** filesystem local durante el MVP.
- **Repositorio:** `andrupax94/PianoMentor-IA` detectado y acceso de GitHub validado; el checkout local todavía no se ha publicado mediante `push`.

Las credenciales se mantienen exclusivamente en `.env`, que está excluido por `.gitignore`. Nunca incluir claves, tokens ni valores de secretos en este README, en commits o en mensajes de diagnóstico.

---

## 1. 👁️ Visión del producto

PianoMentor AI convierte una pieza MIDI en una sesión de práctica adaptativa.

El estudiante puede:

- Cargar un archivo MIDI.
- Ver la pieza en un piano virtual.
- Reproducirla a velocidad reducida.
- Practicar por compases.
- Usar el teclado del ordenador o un teclado MIDI.
- Recibir puntuaciones de notas y timing.
- Ver cuáles son sus puntos débiles.
- Pedir una demostración de la IA.
- Tocar acompañado por la IA.
- Recuperar el control después de una demostración.

La propuesta central es:

> **La IA no solo explica cómo practicar: observa cómo toca el estudiante y decide cuándo debe esperar, demostrar, acompañar o dar una pista.**

### Gimmick principal

La IA puede tomar temporalmente el control del piano virtual para demostrar un fragmento concreto y luego devolver el control al estudiante.

Ejemplo:

```text
El estudiante falla tres veces una transición de la mano izquierda.
        ↓
La IA detecta el patrón de error.
        ↓
La IA reproduce los compases 12–16 al 60% de velocidad.
        ↓
El sistema devuelve el control.
        ↓
El estudiante repite la transición con feedback.
```

---

## 2. 📦 Alcance del MVP

El MVP de seis semanas debe ser pequeño, funcional y demostrable.

### Incluido

- Carga de archivos `.mid` o `.midi`.
- Parsing de tracks y notas.
- Reproducción MIDI.
- Piano virtual en el navegador.
- Falling notes o visualización equivalente.
- Control de tempo.
- Selección y repetición de compases.
- Entrada por teclado del ordenador.
- Comparación entre notas esperadas y notas tocadas.
- Métricas de precisión y timing.
- Acciones iniciales del agente:
  - `wait`
  - `demonstrate`
  - `accompany`
- Integración básica con LangGraph, preferiblemente después de validar el flujo determinista.
- Una demo de IA que toca una mano y devuelve el control.

### Opcional si el núcleo ya funciona

- Web MIDI API para teclados físicos.
- Plan de práctica persistente.
- Memoria entre sesiones.
- Diferenciación automática de mano izquierda y derecha.
- Feedback generado por LLM.
- Ajuste automático de tempo.
- Gráficos de progreso.

### Fuera del MVP

No implementar inicialmente:

- Transcripción de audio a MIDI.
- Reconocimiento perfecto mediante micrófono.
- Catálogo universal de partituras.
- Scraping indiscriminado de webs.
- Red social.
- Rankings.
- Aplicación móvil nativa.
- Entrenamiento de un modelo musical propio.
- Soporte de todos los instrumentos.
- Partituras profesionales completas si no son necesarias para la demo.

---

## 3. 🧩 Principios de diseño

### 3.1 Arquitectura híbrida

```text
Algoritmos musicales deterministas
        +
Motor MIDI y audio
        +
Estado estructurado del estudiante
        +
LLM para razonamiento y explicación
        +
LangGraph para orquestación
```

El LLM no debe encargarse de operaciones sensibles al tiempo.

### 3.2 El LLM nunca controla MIDI directamente

El LLM puede elegir una acción abstracta:

```json
{
  "action": "demonstrate",
  "hand": "left",
  "measure_range": [12, 16],
  "tempo_ratio": 0.6
}
```

Pero una capa determinista debe:

- Validar la acción.
- Comprobar que los compases existen.
- Limitar el rango de tempo.
- Confirmar que el MIDI está cargado.
- Convertir la acción en eventos `note_on` y `note_off`.
- Ejecutar la reproducción.

### 3.3 El estado debe ser visible

La interfaz debe comunicar qué está haciendo el agente:

```text
Agent state: OBSERVING
Reason: late left-hand entries detected
Next action: DEMONSTRATE
```

Durante una demostración:

```text
AI DEMONSTRATION
Left hand · measures 12–16 · 60% speed
AI is playing — your turn next
```

El usuario nunca debe preguntarse si el sistema está escuchando, reproduciendo o esperando.

### 3.4 Control compartido y reversible

Toda intervención de la IA debe:

- Tener un principio y un final claros.
- Mostrar quién controla el piano.
- Poder detenerse o pausarse.
- Devolver el control automáticamente.
- Evitar acciones inesperadas o indefinidas.

---

## 4. 🤖 Modos del agente

### `OBSERVING`

La IA no toca. El sistema recoge y analiza la interpretación.

Datos relevantes:

- Nota esperada.
- Nota recibida.
- Timestamp esperado.
- Timestamp real.
- Error temporal.
- Notas omitidas.
- Notas adicionales.
- Compás actual.
- Mano activa.

### `EVALUATING`

Se calculan métricas y se actualiza el estado del estudiante.

Ejemplo:

```json
{
  "timing_score": 0.74,
  "notes_score": 0.91,
  "repeated_errors": ["late_left_hand_transition"],
  "current_measure": 14
}
```

### `WAITING_FOR_STUDENT`

El sistema espera la siguiente nota, frase o intento del usuario. No debe avanzar automáticamente si el modo de práctica requiere que el estudiante complete una nota.

### `DEMONSTRATING`

La IA reproduce un fragmento seleccionado para enseñar una idea concreta.

Parámetros mínimos:

- Mano.
- Compás inicial.
- Compás final.
- Tempo.
- Número de repeticiones.
- Motivo de la demostración.

### `ACCOMPANYING`

El estudiante toca una parte y la IA reproduce otra.

Ejemplos:

- Estudiante: mano derecha; IA: mano izquierda.
- Estudiante: melodía; IA: acordes.
- Estudiante: parte principal; IA: acompañamiento simplificado.

### `GIVING_HINT`

La IA no toma el control completo. Puede:

- Resaltar la siguiente nota.
- Mostrar el dedo o la mano sugerida.
- Reproducir solo el primer tiempo.
- Reducir la velocidad.
- Mostrar una explicación textual.

---

## 5. 🔄 Máquina de estados

La primera implementación puede usar una máquina de estados sencilla. Después puede migrarse a LangGraph.

```text
START
  ↓
OBSERVING
  ↓
EVALUATING
  ↓
DECIDE_ACTION
  ├── WAITING_FOR_STUDENT
  ├── DEMONSTRATING
  ├── ACCOMPANYING
  └── GIVING_HINT
          ↓
EXECUTE_ACTION
          ↓
OBSERVING
```

### Reglas iniciales sugeridas

Estas reglas son una base determinista y deben funcionar aunque el LLM no esté disponible:

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

El LLM puede sustituir o complementar `DECIDE_ACTION`, pero no debe ser la única forma de hacer funcionar el producto.

---

## 6. 🕸️ LangGraph

LangGraph es apropiado para la **orquestación del comportamiento pedagógico**, no para el procesamiento de MIDI de baja latencia.

### Uso recomendado

```text
ObservePerformance
        ↓
EvaluateAttempt
        ↓
UpdateStudentState
        ↓
DecideIntervention
        ↓
ExecuteValidatedAction
        ↓
ObserveAgain
```

### Estado sugerido

```python
class MentorState(TypedDict):
    session_id: str
    piece_id: str
    current_measure: int
    selected_measure_range: tuple[int, int]
    student_level: str
    attempts: int
    notes_score: float
    timing_score: float
    weak_points: list[str]
    current_tempo: int
    agent_mode: str
    last_action: str | None
    pending_action: dict | None
```

### Herramientas del agente

El agente puede tener herramientas conceptuales como:

```text
analyze_performance()
get_current_measure()
get_weak_sections()
play_left_hand()
play_right_hand()
play_full_section()
set_tempo()
start_accompaniment()
stop_accompaniment()
show_hint()
return_control_to_student()
```

Cada herramienta debe tener validación, timeout y un resultado estructurado.

### No usar LangGraph para

- Enviar cada `note_on` en tiempo real.
- Controlar directamente el reloj de reproducción.
- Comparar muestras de audio.
- Hacer cálculos de timing por nota.
- Reemplazar el motor MIDI.

---

## 7. 🏗️ Arquitectura técnica

```text
┌─────────────────────────────┐
│ Frontend                     │
│ React / Next.js / TypeScript │
│ Piano virtual + UI de sesión │
└──────────────┬──────────────┘
               │ WebSocket / HTTP
               ▼
┌─────────────────────────────┐
│ Backend                     │
│ FastAPI                     │
│ Sesiones + MIDI + evaluación│
└──────────────┬──────────────┘
               │
       ┌───────┴────────┐
       ▼                ▼
┌───────────────┐ ┌───────────────┐
│ Motor musical │ │ Agente        │
│ MIDI / timing │ │ LangGraph +   │
│ parsing       │ │ LLM           │
└───────────────┘ └───────────────┘
```

### Frontend

Tecnologías sugeridas:

- Next.js o React.
- TypeScript.
- Tailwind CSS.
- Tone.js o Web Audio API.
- Canvas o SVG para falling notes.
- Web MIDI API para hardware compatible.

Responsabilidades:

- Mostrar el piano.
- Mostrar notas esperadas.
- Capturar teclado o MIDI.
- Mostrar el estado del agente.
- Mostrar métricas.
- Mostrar cuándo el control es del agente.
- Enviar eventos de usuario al backend o al evaluador local.

### Backend

Tecnologías sugeridas:

- Python.
- FastAPI.
- Pydantic.
- SQLite durante el MVP.
- Groq como proveedor LLM inicial, detrás de una interfaz desacoplada.
- `mido`, `pretty_midi` o `miditoolkit`.
- LangGraph.
- LangSmith para tracing y evaluación de alto nivel, sin registrar cada evento MIDI.
- Cliente de LLM compatible con salida estructurada.

Responsabilidades:

- Cargar y validar MIDI.
- Normalizar eventos.
- Analizar compases y tempo.
- Evaluar interpretación.
- Mantener sesiones.
- Ejecutar acciones validadas.
- Generar feedback.

---

## 8. 🗃️ Modelo de datos

### Pieza

```json
{
  "id": "beethoven-5-demo",
  "title": "Beethoven — Symphony No. 5",
  "arrangement": "piano solo",
  "source": "user_upload",
  "duration_seconds": 214.0,
  "tempo_bpm": 108,
  "tracks": 2
}
```

### Nota normalizada

```json
{
  "id": "note-001",
  "pitch": 60,
  "name": "C4",
  "start": 2.48,
  "duration": 0.52,
  "velocity": 82,
  "track": 1,
  "hand": "right",
  "measure": 12
}
```

### Evaluación

```json
{
  "measure_range": [12, 16],
  "accuracy": 0.82,
  "timing_score": 0.74,
  "notes_correct": 91,
  "notes_missed": 8,
  "extra_notes": 3,
  "weak_points": ["late_left_hand_entries"]
}
```

### Acción del agente

```json
{
  "action": "demonstrate",
  "hand": "left",
  "measure_range": [12, 16],
  "tempo_ratio": 0.6,
  "repetitions": 1,
  "reason": "The student missed the left-hand transition three times"
}
```

---

## 9. 🔐 Contrato de acciones

Todas las acciones del agente deben ajustarse a un esquema similar a este:

```json
{
  "type": "object",
  "required": ["action"],
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "wait",
        "demonstrate",
        "accompany",
        "give_hint",
        "slow_down",
        "return_control"
      ]
    },
    "hand": {
      "type": ["string", "null"],
      "enum": ["left", "right", "both", null]
    },
    "measure_range": {
      "type": ["array", "null"],
      "minItems": 2,
      "maxItems": 2
    },
    "tempo_ratio": {
      "type": ["number", "null"],
      "minimum": 0.25,
      "maximum": 1.25
    },
    "repetitions": {
      "type": ["integer", "null"],
      "minimum": 1,
      "maximum": 8
    },
    "reason": {
      "type": "string"
    }
  }
}
```

### Validaciones obligatorias

Antes de ejecutar una acción:

- Rechazar acciones desconocidas.
- Comprobar que el rango de compases existe.
- Limitar el `tempo_ratio`.
- Limitar repeticiones.
- Confirmar que el MIDI está disponible.
- Confirmar que la mano solicitada contiene eventos.
- Impedir reproducción indefinida.
- Registrar la acción y su resultado.

---

## 10. 🌐 API conceptual

### `POST /pieces`

Carga un MIDI y devuelve el identificador de la pieza.

### `GET /pieces/{piece_id}`

Devuelve metadatos, tracks, tempo y secciones.

### `POST /sessions`

Crea una sesión de práctica.

### `POST /sessions/{session_id}/events`

Recibe eventos de teclado o MIDI.

### `GET /sessions/{session_id}/state`

Devuelve el estado actual del estudiante y del agente.

### `POST /sessions/{session_id}/action`

Ejecuta una acción previamente validada.

### `POST /sessions/{session_id}/agent-step`

Ejecuta un ciclo del grafo del agente:

```text
observar → evaluar → decidir → ejecutar
```

Para una implementación en tiempo real, la evaluación de notas puede vivir en el cliente o en un proceso local de baja latencia, mientras que LangGraph se usa para decisiones de nivel superior.

---

## 11. 🎮 Reglas de interacción

### Cuando la IA demuestra

La interfaz debe mostrar:

- `AI DEMONSTRATION`.
- Mano activa.
- Compases.
- Velocidad.
- Motivo.
- Tiempo restante.
- Mensaje `AI is playing — your turn next`.

### Cuando el usuario tiene el control

La interfaz debe mostrar:

- `YOUR TURN`.
- Nota o compás actual.
- Feedback de precisión.
- Botón para pedir pista.

### Cuando el control es compartido

La interfaz debe mostrar:

- Qué mano toca la IA.
- Qué mano toca el estudiante.
- Tempo actual.
- Si la IA está siguiendo el tempo del usuario.

---

## 12. 🔒 Privacidad y seguridad

- No subir audio si el MVP solo necesita MIDI.
- Tratar los archivos MIDI del usuario como datos privados.
- Eliminar archivos temporales si no son necesarios.
- No ejecutar scripts incluidos dentro de archivos externos.
- No permitir que el LLM genere comandos del sistema.
- No dar al modelo acceso directo al puerto MIDI.
- Usar una lista blanca de acciones permitidas.
- Registrar errores y acciones del agente sin guardar datos innecesarios.
- Mantener las credenciales en `.env` local y excluirlo mediante `.gitignore`.
- Rotar inmediatamente cualquier credencial que aparezca en logs, terminales, commits o conversaciones.
- No enviar claves ni contenido sensible del `.env` a LangSmith.
- Registrar en LangSmith solo trazas de decisiones y ejecuciones de alto nivel; no registrar cada evento `note_on` o `note_off`.

---

## 13. 📜 Copyright y fuentes musicales

Para la demo:

- Usar composiciones de dominio público.
- Usar MIDI creado por el desarrollador.
- Usar archivos con licencia compatible.
- Permitir carga de archivos del usuario.
- Guardar la procedencia y licencia cuando sea posible.
- No construir inicialmente un catálogo universal de descargas.

Que una composición sea de dominio público no significa automáticamente que cualquier transcripción MIDI encontrada online pueda redistribuirse.

---

## 14. 🗺️ Roadmap

### Fase 1 — Núcleo musical

- Importar MIDI.
- Normalizar notas.
- Reproducir MIDI.
- Mostrar piano virtual.

### Fase 2 — Evaluación

- Capturar teclado.
- Comparar notas.
- Calcular timing.
- Detectar secciones débiles.

### Fase 3 — Agente básico

- Máquina de estados.
- Acciones `wait`, `demonstrate` y `accompany`.
- JSON Schema.
- Registro de decisiones.

### Fase 4 — LangGraph

- Estado persistente de sesión.
- Nodos de observación, evaluación y decisión.
- Herramientas de reproducción.
- Pausas y devolución de control.

### Fase 5 — MIDI físico y adaptación

- Web MIDI API.
- Seguimiento de tempo.
- Memoria de progreso.
- Plan de práctica.

---

> El plan operativo de seis semanas, con objetivos y entregables por semana, está documentado en [PLAN.md](PLAN.md).

---

## 15. ✅ Criterios de aceptación del MVP

El MVP se considera terminado cuando:

- El usuario puede cargar un MIDI.
- El sistema muestra las notas en un piano virtual.
- El usuario puede reproducir una sección lentamente.
- El usuario puede practicar con el teclado del ordenador.
- El sistema detecta notas correctas, incorrectas y omitidas.
- El sistema calcula una métrica de timing.
- El agente puede demostrar una mano en un rango de compases.
- La interfaz indica que la IA está tocando.
- La IA devuelve el control automáticamente.
- El usuario puede repetir la sección.
- Las acciones del agente están validadas.
- El flujo funciona aunque el LLM esté temporalmente deshabilitado usando reglas básicas.

---

## 16. 🧪 Checklist para una IA que modifique el proyecto

Antes de modificar código:

- [ ] Leer este README.
- [ ] Identificar si el cambio pertenece a frontend, motor MIDI, evaluación o agente.
- [ ] No mezclar lógica de UI con lógica de reproducción.
- [ ] No enviar eventos MIDI desde el LLM directamente.
- [ ] Mantener las acciones del agente estructuradas.
- [ ] Añadir o actualizar tests si se modifica timing, parsing o validación.
- [ ] Mantener el control del usuario visible y reversible.
- [ ] No ampliar el alcance sin justificarlo.

Después de modificar código:

- [ ] Ejecutar tests.
- [ ] Probar carga de MIDI.
- [ ] Probar reproducción.
- [ ] Probar errores de notas.
- [ ] Probar acción `demonstrate`.
- [ ] Probar devolución del control.
- [ ] Verificar que un fallo del LLM no rompe el reproductor.
- [ ] Actualizar este README si cambia la arquitectura.

---

## 17. 📝 Decisiones pendientes

Estas decisiones siguen abiertas y deben documentarse cuando se elijan:

- React o Next.js.
- Tone.js o motor propio con Web Audio API.
- Evaluación en cliente o backend.
- Web MIDI desde el inicio o después del MVP.
- LangGraph desde la semana 4 o máquina de estados propia.
- Algoritmo para separar manos.
- Migración futura de SQLite a PostgreSQL.
- Migración futura del filesystem local a S3/Cloudflare R2.

Decisiones ya tomadas para el MVP:

- **Proveedor LLM:** Groq, manteniendo un `MockProvider` y reglas deterministas como fallback.
- **Observabilidad:** LangSmith opcional y limitado a tracing de alto nivel.
- **Persistencia inicial:** SQLite local.
- **Almacenamiento inicial de MIDI:** filesystem local.
- **GitHub Actions:** se usará mediante el repositorio de GitHub; no requiere un token personal dentro de los workflows, ya que Actions proporciona `GITHUB_TOKEN`.

## Resumen final

PianoMentor AI debe ser tratado como un **sistema interactivo de enseñanza musical**, no como un chatbot con piano.

La división correcta de responsabilidades es:

```text
MIDI / timing / reproducción = código determinista
Estado y flujo pedagógico = LangGraph
Explicaciones y decisiones ambiguas = LLM
Interacción y visualización = frontend
```

La característica que debe guiar el proyecto es:

> **El agente observa al estudiante, decide una intervención concreta y puede tocar temporalmente para enseñar, pero siempre devuelve el control al usuario.**

