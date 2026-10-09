<!-- description: Fuente manual de ARCHITECTURE.md: principios, capas, contratos y evolución. Sin filetree. -->
<!-- context: Editar aquí la arquitectura; el script añade los anexos generados. -->

# Arquitectura de PianoMentor AI

## 1. Propósito

Este documento define la estructura de carpetas y archivos recomendada para PianoMentor AI en dos niveles:

1. **Estructura simple del MVP:** mínima, funcional y orientada a validar el flujo principal.
2. **Estructura completa escalable:** separación estricta entre dominio musical, casos de uso, API, infraestructura, agente y frontend.

La aplicación se desarrollará como un **monorepo** con:

- **Backend:** Python, FastAPI, Pydantic y SQLite + sqlite-vec durante el MVP.
- **Frontend:** Next.js y TypeScript.
- **Comunicación:** HTTP para operaciones normales y WebSocket para sesiones en tiempo real.
- **MIDI:** procesamiento determinista, separado del LLM y de la interfaz.
- **Agente:** reglas deterministas primero; LangGraph y LLM posteriormente.
- **Ejecución:** Docker y Docker Compose desde el inicio.

> La interfaz inicial será web. La antigua idea de una consola retro queda descartada como interfaz principal.

## 2. Principios arquitectónicos

1. **El motor musical determinista controla MIDI, reproducción, timing y evaluación.**
2. **FastAPI expone casos de uso, pero no contiene la lógica musical principal.**
3. **Next.js muestra el estado y captura la interacción del usuario.**
4. **El agente propone acciones estructuradas; nunca envía MIDI directamente.**
5. **Toda acción del agente se valida antes de ejecutarse.**
6. **El control del piano debe ser visible, limitado, pausible, detenible y reversible.**
7. **El sistema debe funcionar sin LLM mediante reglas deterministas.**
8. **El dominio musical debe poder probarse sin levantar FastAPI, Next.js ni Docker.**
9. **La primera versión debe priorizar el flujo vertical:** cargar MIDI → mostrar pieza → practicar → evaluar.

## 3. Flujo principal del MVP

```text
Usuario
  ↓
Next.js: cargar archivo MIDI
  ↓ HTTP
FastAPI: validar y registrar la pieza
  ↓
Dominio MIDI: normalizar notas, tempo, tracks y duración
  ↓ HTTP/WebSocket
Next.js: mostrar pieza y piano virtual
  ↓
Crear sesión de práctica
  ↓ WebSocket
Capturar teclado del ordenador y actualizar estado
  ↓
Evaluador determinista: notas, omisiones, extras y timing
  ↓
Estado pedagógico y acciones validadas
```

## 4. Estructura simple del MVP

Esta estructura es la recomendada para comenzar. Evita crear demasiadas abstracciones antes de validar la funcionalidad, pero mantiene separadas las responsabilidades principales.

### 4.1 Árbol del MVP

El árbol siguiente describe la estructura objetivo del MVP de forma acumulativa. La creación de la estructura base de B-001.1 no exige que todos los módulos funcionales ya existan: los archivos de aplicación se incorporan progresivamente junto con sus Issues. En particular, `database.py` (SQLite + sqlite-vec) se incorporará con B-003, los componentes y clientes HTTP iniciales con B-004, y el cliente WebSocket y la vista de práctica con B-012. Hasta entonces, las carpetas pueden no contener esos archivos.

```text
piano-mentor-ai/
├── README.md
├── PLAN.md
├── GLOSSARY.md
├── ARCHITECTURE.md
├── issues/
│   └── B-001/
│       ├── B-001.md
│       └── B-001.N.md
├── docs/
│   ├── GETTING_STARTED.md
│   └── TROUBLESHOOTING.md
├── .env.example
├── .gitignore
├── docker-compose.yml
│
├── backend/
│   ├── Dockerfile
│   ├── pyproject.toml
│   ├── src/
│   │   └── piano_mentor/
│   │       ├── __init__.py
│   │       ├── main.py
│   │       ├── config.py
│   │       ├── api.py
│   │       ├── schemas.py
│   │       ├── database.py
│   │       ├── midi.py
│   │       ├── evaluation.py
│   │       ├── practice.py
│   │       └── agent.py
│   └── tests/
│       ├── test_health.py
│       ├── test_midi.py
│       ├── test_evaluation.py
│       └── test_agent.py
│
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── next.config.ts
│   ├── tsconfig.json
│   └── src/
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── page.tsx
│       │   ├── globals.css
│       │   └── practice/
│       │       └── [sessionId]/
│       │           └── page.tsx
│       ├── components/
│       │   ├── MidiUploader.tsx
│       │   ├── PianoKeyboard.tsx
│       │   ├── PracticeSession.tsx
│       │   └── SessionStatus.tsx
│       └── lib/
│           ├── api-client.ts
│           └── websocket-client.ts
│
├── data/
│   ├── midi/.gitkeep
│   ├── uploads/.gitkeep
│   └── sessions/.gitkeep
│
└── shared/
    └── schemas/
        └── action.schema.json
```

### 4.2 Tabla de archivos y carpetas del MVP

| Archivo o carpeta | Descripción |
|---|---|
| `/README.md` | Contexto del producto, objetivos, alcance y reglas principales. |
| `/PLAN.md` | Plan operativo del MVP y entregables por fase o semana. |
| `/GLOSSARY.md` | Definiciones de términos musicales, técnicos y pedagógicos. |
| `/ARCHITECTURE.md` | Este documento; describe la evolución arquitectónica del proyecto. |
| `/issues/` | Documentación operativa agrupada por Issue principal. Cada carpeta contiene el resumen y sus Sub-issues. |
| `/issues/B-001/` | Documentación agrupada de la Issue B-001 y sus Sub-issues. |
| `/issues/B-001/B-001.md` | Resumen, alcance, Sub-issues y criterios de aceptación de la Issue principal B-001. |
| `/issues/B-001/B-001.N.md` | Documento detallado de una Sub-issue de B-001; `N` representa su número secuencial. |
| `/docs/` | Documentación operativa para instalar, arrancar y diagnosticar el proyecto. |
| `/docs/GETTING_STARTED.md` | Guía reproducible de instalación, configuración, arranque, validaciones y detención local. |
| `/docs/TROUBLESHOOTING.md` | Bitácora viva de problemas frecuentes, diagnóstico, workarounds y soluciones. |
| `/.env.example` | Plantilla de variables de entorno sin secretos. |
| `/.gitignore` | Archivos y carpetas que no deben versionarse. |
| `/docker-compose.yml` | Orquestación local del backend y frontend. |
| `/backend/` | Aplicación Python/FastAPI y lógica inicial del producto. |
| `/backend/Dockerfile` | Imagen reproducible para ejecutar el backend. |
| `/backend/pyproject.toml` | Dependencias, configuración de herramientas y metadatos Python. |
| `/backend/src/piano_mentor/` | Paquete principal del backend. |
| `/backend/src/piano_mentor/__init__.py` | Marca el paquete Python y puede contener la versión del proyecto. |
| `/backend/src/piano_mentor/main.py` | Punto de entrada de FastAPI y creación de la aplicación. |
| `/backend/src/piano_mentor/config.py` | Configuración tipada desde variables de entorno. |
| `/backend/src/piano_mentor/api.py` | Rutas HTTP y WebSocket iniciales del MVP. Debe mantenerse delgado. |
| `/backend/src/piano_mentor/schemas.py` | Modelos Pydantic para peticiones y respuestas de la API. |
| `/backend/src/piano_mentor/database.py` | Conexión y operaciones iniciales con SQLite + sqlite-vec (metadatos de piezas y vectores); se incorporará con B-003. Los bytes MIDI siguen en filesystem (`MIDI_STORAGE_PATH`). |
| `/backend/src/piano_mentor/midi.py` | Lectura, validación y normalización de archivos MIDI. |
| `/backend/src/piano_mentor/evaluation.py` | Comparación de notas, omisiones, extras, precisión y timing. |
| `/backend/src/piano_mentor/practice.py` | Creación de sesiones y actualización del estado de práctica. |
| `/backend/src/piano_mentor/agent.py` | Reglas deterministas y acciones iniciales del agente. |
| `/backend/tests/` | Pruebas automáticas del backend. |
| `/backend/tests/test_health.py` | Comprueba que la API arranca y responde correctamente. |
| `/backend/tests/test_midi.py` | Pruebas de MIDI válido, inválido y normalización básica. |
| `/backend/tests/test_evaluation.py` | Pruebas de notas correctas, omitidas, adicionales y timing. |
| `/backend/tests/test_agent.py` | Pruebas de reglas, validación y devolución del control. |
| `/frontend/` | Aplicación web Next.js/TypeScript. |
| `/frontend/Dockerfile` | Imagen reproducible para ejecutar el frontend. |
| `/frontend/package.json` | Dependencias y scripts del frontend. |
| `/frontend/next.config.ts` | Configuración de Next.js. |
| `/frontend/tsconfig.json` | Configuración del compilador TypeScript. |
| `/frontend/src/app/layout.tsx` | Layout global de la aplicación web. |
| `/frontend/src/app/page.tsx` | Página inicial: carga de MIDI y acceso al flujo de práctica. |
| `/frontend/src/app/globals.css` | Estilos globales de la aplicación. |
| `/frontend/src/app/practice/[sessionId]/page.tsx` | Página de una sesión de práctica concreta. |
| `/frontend/src/components/MidiUploader.tsx` | Selector y carga de archivos MIDI. |
| `/frontend/src/components/PianoKeyboard.tsx` | Piano virtual básico y resaltado de notas. |
| `/frontend/src/components/PracticeSession.tsx` | Vista principal de práctica; se incorporará con B-012. |
| `/frontend/src/components/SessionStatus.tsx` | Estado actual, tempo, compás y control del piano. |
| `/frontend/src/lib/api-client.ts` | Cliente HTTP tipado para comunicarse con FastAPI; se incorporará con B-004. |
| `/frontend/src/lib/websocket-client.ts` | Cliente WebSocket para actualizaciones en tiempo real; se incorporará con B-012. |
| `/data/midi/` | MIDI de prueba o archivos preparados para demostraciones. |
| `/data/uploads/` | Archivos MIDI cargados localmente durante el desarrollo. |
| `/data/sessions/` | Datos temporales o exportaciones de sesiones. |
| `/shared/schemas/action.schema.json` | Esquema compartido para validar acciones del agente. |

### 4.3 Responsabilidades de los módulos simples

| Módulo | Responsabilidad | No debe hacer |
|---|---|---|
| `midi.py` | Leer y normalizar MIDI. | Decidir acciones pedagógicas o responder HTTP directamente. |
| `evaluation.py` | Comparar interpretación y calcular métricas. | Renderizar UI o llamar al LLM. |
| `practice.py` | Gestionar sesiones y estado de práctica. | Implementar componentes web. |
| `agent.py` | Seleccionar y validar acciones estructuradas. | Enviar eventos MIDI directamente desde un LLM. |
| `api.py` | Traducir HTTP/WebSocket a casos de uso. | Contener algoritmos musicales complejos. |
| `PianoKeyboard.tsx` | Mostrar el teclado virtual y su estado visual. | Parsear MIDI o calcular timing. |

## 5. Estructura completa escalable

Cuando el MVP esté validado, se recomienda evolucionar a una separación por capas y módulos de dominio. La estructura completa permite añadir LangGraph, un proveedor LLM, persistencia más avanzada, MIDI físico y funcionalidades de progreso sin mezclar responsabilidades.

### 5.1 Árbol completo

```text
piano-mentor-ai/
├── README.md
├── PLAN.md
├── GLOSSARY.md
├── ARCHITECTURE.md
├── issues/
│   └── B-001/
│       ├── B-001.md
│       └── B-001.N.md
├── LICENSE
├── .env.example
├── .gitignore
├── docker-compose.yml
├── Makefile
│
├── backend/
│   ├── Dockerfile
│   ├── pyproject.toml
│   ├── alembic.ini
│   ├── migrations/
│   │   ├── env.py
│   │   └── versions/
│   │
│   ├── src/
│   │   └── piano_mentor/
│   │       ├── __init__.py
│   │       ├── main.py
│   │       │
│   │       ├── api/
│   │       │   ├── __init__.py
│   │       │   ├── deps.py
│   │       │   ├── router.py
│   │       │   └── v1/
│   │       │       ├── __init__.py
│   │       │       ├── pieces.py
│   │       │       ├── sessions.py
│   │       │       ├── events.py
│   │       │       ├── actions.py
│   │       │       └── websocket.py
│   │       │
│   │       ├── application/
│   │       │   ├── __init__.py
│   │       │   ├── pieces/
│   │       │   │   ├── commands.py
│   │       │   │   ├── queries.py
│   │       │   │   └── services.py
│   │       │   ├── practice/
│   │       │   │   ├── commands.py
│   │       │   │   ├── queries.py
│   │       │   │   └── services.py
│   │       │   └── agent/
│   │       │       └── services.py
│   │       │
│   │       ├── domain/
│   │       │   ├── __init__.py
│   │       │   ├── midi/
│   │       │   │   ├── entities.py
│   │       │   │   ├── value_objects.py
│   │       │   │   ├── services.py
│   │       │   │   └── exceptions.py
│   │       │   ├── performance/
│   │       │   │   ├── entities.py
│   │       │   │   ├── evaluator.py
│   │       │   │   ├── metrics.py
│   │       │   │   └── timing.py
│   │       │   ├── practice/
│   │       │   │   ├── entities.py
│   │       │   │   ├── states.py
│   │       │   │   └── events.py
│   │       │   └── agent/
│   │       │       ├── entities.py
│   │       │       ├── actions.py
│   │       │       ├── policies.py
│   │       │       ├── state_machine.py
│   │       │       └── validators.py
│   │       │
│   │       ├── infrastructure/
│   │       │   ├── config/
│   │       │   │   ├── settings.py
│   │       │   │   └── logging.py
│   │       │   ├── database/
│   │       │   │   ├── connection.py
│   │       │   │   ├── models.py
│   │       │   │   └── repositories.py
│   │       │   ├── midi/
│   │       │   │   ├── mido_reader.py
│   │       │   │   ├── midi_player.py
│   │       │   │   └── filesystem.py
│   │       │   ├── agent/
│   │       │   │   ├── deterministic_provider.py
│   │       │   │   ├── groq_provider.py
│   │       │   │   └── langgraph_graph.py
│   │       │   └── observability/
│   │       │       └── langsmith.py
│   │       │
│   │       └── schemas/
│   │           ├── pieces.py
│   │           ├── sessions.py
│   │           ├── events.py
│   │           ├── evaluations.py
│   │           └── actions.py
│   │
│   ├── tests/
│   │   ├── unit/
│   │   │   ├── domain/
│   │   │   │   ├── test_midi.py
│   │   │   │   ├── test_evaluator.py
│   │   │   │   ├── test_timing.py
│   │   │   │   └── test_agent_actions.py
│   │   │   └── application/
│   │   │       └── test_practice_services.py
│   │   ├── integration/
│   │   │   ├── test_piece_upload.py
│   │   │   ├── test_sessions.py
│   │   │   └── test_agent_flow.py
│   │   └── fixtures/
│   │       ├── midi/
│   │       └── performances/
│   │
│   └── scripts/
│       ├── seed_demo_data.py
│       └── validate_midi_corpus.py
│
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── pnpm-lock.yaml
│   ├── next.config.ts
│   ├── tsconfig.json
│   ├── eslint.config.mjs
│   ├── public/
│   │   ├── icons/
│   │   └── audio/
│   └── src/
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── page.tsx
│       │   ├── globals.css
│       │   ├── pieces/
│       │   │   ├── page.tsx
│       │   │   └── [pieceId]/
│       │   │       └── page.tsx
│       │   └── practice/
│       │       └── [sessionId]/
│       │           └── page.tsx
│       ├── components/
│       │   ├── piano/
│       │   │   ├── PianoKeyboard.tsx
│       │   │   ├── PianoKey.tsx
│       │   │   └── NoteHighlight.tsx
│       │   ├── pieces/
│       │   │   ├── MidiUploader.tsx
│       │   │   └── PieceSummary.tsx
│       │   ├── practice/
│       │   │   ├── PracticeSession.tsx
│       │   │   ├── ExpectedNotes.tsx
│       │   │   ├── PerformanceScore.tsx
│       │   │   └── SessionControls.tsx
│       │   └── agent/
│       │       ├── AgentStatus.tsx
│       │       ├── CurrentAction.tsx
│       │       └── ControlIndicator.tsx
│       ├── features/
│       │   ├── pieces/
│       │   │   ├── api.ts
│       │   │   ├── hooks.ts
│       │   │   └── types.ts
│       │   ├── practice/
│       │   │   ├── api.ts
│       │   │   ├── hooks.ts
│       │   │   ├── websocket.ts
│       │   │   └── types.ts
│       │   └── agent/
│       │       ├── api.ts
│       │       └── types.ts
│       ├── lib/
│       │   ├── api-client.ts
│       │   ├── websocket-client.ts
│       │   ├── keyboard-mapping.ts
│       │   └── validation.ts
│       ├── hooks/
│       │   ├── useComputerKeyboard.ts
│       │   ├── usePracticeSession.ts
│       │   └── usePlayback.ts
│       ├── store/
│       │   └── practice-store.ts
│       └── types/
│           ├── midi.ts
│           ├── practice.ts
│           └── agent.ts
│
├── shared/
│   ├── README.md
│   └── schemas/
│       ├── action.schema.json
│       ├── piece.schema.json
│       └── session.schema.json
│
├── data/
│   ├── midi/.gitkeep
│   ├── uploads/.gitkeep
│   └── sessions/.gitkeep
│
├── scripts/
│   ├── seed_demo_data.py
│   ├── validate_midi_corpus.py
│   └── export_openapi.py
│
└── docs/
    ├── architecture.md
    ├── api.md
    ├── decisions/
    │   ├── 0001-monorepo.md
    │   ├── 0002-deterministic-music-engine.md
    │   └── 0003-web-first-interface.md
    └── demos/
        └── first-mvp-flow.md
```

### 5.2 Tabla de archivos y carpetas de la estructura completa

| Archivo o carpeta | Descripción |
|---|---|
| `/LICENSE` | Licencia del código, si el proyecto adopta una licencia explícita. |
| `/issues/` | Documentación operativa versionada agrupada por Issue principal; no sustituye a `PLAN.md`. |
| `/issues/B-001/` | Carpeta de la Issue B-001, con su resumen y Sub-issues. |
| `/issues/B-001/B-001.md` | Resumen, alcance y aceptación de la Issue principal B-001. |
| `/issues/B-001/B-001.N.md` | Descripción, dependencias, validación y criterios de una Sub-issue. |
| `/Makefile` | Comandos abreviados para instalar, probar, levantar Docker y ejecutar tareas comunes. |
| `/backend/migrations/` | Migraciones de base de datos gestionadas por Alembic. |
| `/backend/migrations/env.py` | Configuración del entorno de Alembic. |
| `/backend/migrations/versions/` | Versiones incrementales del esquema de base de datos. |
| `/backend/src/piano_mentor/api/` | Capa HTTP y WebSocket. No contiene reglas musicales complejas. |
| `/backend/src/piano_mentor/api/deps.py` | Dependencias de FastAPI, como sesiones de base de datos y servicios. |
| `/backend/src/piano_mentor/api/router.py` | Registro central de routers y versionado de la API. |
| `/backend/src/piano_mentor/api/v1/pieces.py` | Endpoints para cargar y consultar piezas MIDI. |
| `/backend/src/piano_mentor/api/v1/sessions.py` | Endpoints para crear y consultar sesiones de práctica. |
| `/backend/src/piano_mentor/api/v1/events.py` | Endpoint para recibir eventos del teclado o MIDI. |
| `/backend/src/piano_mentor/api/v1/actions.py` | Endpoint para solicitar o ejecutar acciones validadas. |
| `/backend/src/piano_mentor/api/v1/websocket.py` | Canal de tiempo real para el estado de una sesión. |
| `/backend/src/piano_mentor/application/` | Casos de uso que coordinan dominio e infraestructura. |
| `/backend/src/piano_mentor/application/pieces/commands.py` | Operaciones que modifican piezas, como cargar un MIDI. |
| `/backend/src/piano_mentor/application/pieces/queries.py` | Consultas de piezas y sus metadatos. |
| `/backend/src/piano_mentor/application/pieces/services.py` | Servicios de aplicación relacionados con piezas. |
| `/backend/src/piano_mentor/application/practice/commands.py` | Operaciones que modifican sesiones de práctica. |
| `/backend/src/piano_mentor/application/practice/queries.py` | Consultas del estado y el historial de práctica. |
| `/backend/src/piano_mentor/application/practice/services.py` | Coordinación de creación, evaluación y actualización de sesiones. |
| `/backend/src/piano_mentor/application/agent/services.py` | Coordinación de decisiones y ejecución de acciones validadas. |
| `/backend/src/piano_mentor/domain/` | Núcleo del negocio musical y pedagógico, independiente de frameworks. |
| `/backend/src/piano_mentor/domain/midi/` | Entidades y reglas para piezas, tracks, eventos y notas normalizadas. |
| `/backend/src/piano_mentor/domain/midi/entities.py` | Entidades como pieza MIDI, track y nota. |
| `/backend/src/piano_mentor/domain/midi/value_objects.py` | Valores inmutables como pitch, tempo, compás y rango de medidas. |
| `/backend/src/piano_mentor/domain/midi/services.py` | Servicios deterministas de normalización y análisis MIDI. |
| `/backend/src/piano_mentor/domain/midi/exceptions.py` | Errores específicos de validación y procesamiento MIDI. |
| `/backend/src/piano_mentor/domain/performance/` | Reglas para evaluar la interpretación del estudiante. |
| `/backend/src/piano_mentor/domain/performance/entities.py` | Entidades de eventos recibidos, intentos y evaluaciones. |
| `/backend/src/piano_mentor/domain/performance/evaluator.py` | Comparación entre notas esperadas y notas recibidas. |
| `/backend/src/piano_mentor/domain/performance/metrics.py` | Cálculo de precisión, notas correctas, omitidas y adicionales. |
| `/backend/src/piano_mentor/domain/performance/timing.py` | Cálculo determinista de errores temporales y puntuación de timing. |
| `/backend/src/piano_mentor/domain/practice/` | Entidades y transiciones de las sesiones de práctica. |
| `/backend/src/piano_mentor/domain/practice/entities.py` | Entidades de sesión, intento, sección y control del piano. |
| `/backend/src/piano_mentor/domain/practice/states.py` | Estados explícitos de una sesión de práctica. |
| `/backend/src/piano_mentor/domain/practice/events.py` | Eventos de dominio, como nota recibida, pausa o control devuelto. |
| `/backend/src/piano_mentor/domain/agent/` | Estado, políticas y acciones del agente pedagógico. |
| `/backend/src/piano_mentor/domain/agent/entities.py` | Entidades del estado pedagógico y decisiones del agente. |
| `/backend/src/piano_mentor/domain/agent/actions.py` | Modelos de acciones estructuradas permitidas. |
| `/backend/src/piano_mentor/domain/agent/policies.py` | Reglas deterministas para elegir una intervención. |
| `/backend/src/piano_mentor/domain/agent/state_machine.py` | Máquina de estados observable y testeable. |
| `/backend/src/piano_mentor/domain/agent/validators.py` | Lista blanca y límites de acciones, tempo, compases y repeticiones. |
| `/backend/src/piano_mentor/infrastructure/` | Implementaciones concretas de almacenamiento, MIDI, LLM y observabilidad. |
| `/backend/src/piano_mentor/infrastructure/config/settings.py` | Configuración de la aplicación desde variables de entorno. |
| `/backend/src/piano_mentor/infrastructure/config/logging.py` | Configuración de logs y niveles de observabilidad. |
| `/backend/src/piano_mentor/infrastructure/database/connection.py` | Conexión y ciclo de vida de SQLite (+ sqlite-vec) o PostgreSQL (+ pgvector). |
| `/backend/src/piano_mentor/infrastructure/database/models.py` | Modelos ORM de persistencia. |
| `/backend/src/piano_mentor/infrastructure/database/repositories.py` | Implementaciones de repositorios del dominio. |
| `/backend/src/piano_mentor/infrastructure/midi/mido_reader.py` | Adaptador de Mido para leer archivos MIDI. |
| `/backend/src/piano_mentor/infrastructure/midi/midi_player.py` | Adaptador de reproducción y control de eventos MIDI. |
| `/backend/src/piano_mentor/infrastructure/midi/filesystem.py` | Guardado y lectura segura de archivos MIDI locales. |
| `/backend/src/piano_mentor/infrastructure/agent/deterministic_provider.py` | Proveedor de decisiones sin LLM para el fallback del sistema. |
| `/backend/src/piano_mentor/infrastructure/agent/groq_provider.py` | Cliente desacoplado para el proveedor LLM Groq. |
| `/backend/src/piano_mentor/infrastructure/agent/langgraph_graph.py` | Grafo de orquestación de alto nivel con LangGraph. |
| `/backend/src/piano_mentor/infrastructure/observability/langsmith.py` | Trazas de decisiones de alto nivel, sin registrar cada evento MIDI. |
| `/backend/src/piano_mentor/schemas/` | DTOs y contratos externos del backend. |
| `/backend/src/piano_mentor/schemas/pieces.py` | Esquemas de entrada y salida para piezas. |
| `/backend/src/piano_mentor/schemas/sessions.py` | Esquemas de sesiones y estados. |
| `/backend/src/piano_mentor/schemas/events.py` | Esquemas de eventos de teclado y MIDI. |
| `/backend/src/piano_mentor/schemas/evaluations.py` | Esquemas de puntuaciones y resultados de evaluación. |
| `/backend/src/piano_mentor/schemas/actions.py` | Esquemas de acciones del agente para la API. |
| `/backend/tests/unit/` | Tests de unidades aisladas y rápidos. |
| `/backend/tests/unit/domain/` | Tests del dominio sin infraestructura ni red. |
| `/backend/tests/unit/application/` | Tests de casos de uso con dependencias simuladas. |
| `/backend/tests/integration/` | Tests de API, base de datos, flujo MIDI y agente. |
| `/backend/tests/fixtures/midi/` | Archivos MIDI de prueba y corpus reducido. |
| `/backend/tests/fixtures/performances/` | Interpretaciones correctas e incorrectas para evaluación. |
| `/backend/scripts/seed_demo_data.py` | Carga piezas y datos mínimos para una demostración local. |
| `/backend/scripts/validate_midi_corpus.py` | Comprueba el corpus de piezas del MVP. |
| `/frontend/public/` | Recursos estáticos servidos directamente por Next.js. |
| `/frontend/public/icons/` | Iconos de la interfaz. |
| `/frontend/public/audio/` | Audio auxiliar permitido por el diseño, si fuese necesario. |
| `/frontend/src/app/pieces/` | Rutas para listar y consultar piezas. |
| `/frontend/src/app/pieces/page.tsx` | Página de listado o selección de piezas. |
| `/frontend/src/app/pieces/[pieceId]/page.tsx` | Página de detalle de una pieza. |
| `/frontend/src/components/piano/` | Componentes visuales del piano virtual. |
| `/frontend/src/components/piano/PianoKeyboard.tsx` | Teclado completo y distribución de teclas. |
| `/frontend/src/components/piano/PianoKey.tsx` | Tecla individual y sus estados visuales. |
| `/frontend/src/components/piano/NoteHighlight.tsx` | Resaltado de notas esperadas o recibidas. |
| `/frontend/src/components/pieces/` | Componentes de carga y resumen de piezas. |
| `/frontend/src/components/pieces/MidiUploader.tsx` | Carga y validación inicial del archivo desde el navegador. |
| `/frontend/src/components/pieces/PieceSummary.tsx` | Metadatos, duración, tempo y tracks de una pieza. |
| `/frontend/src/components/practice/` | Componentes de la sesión de práctica. |
| `/frontend/src/components/practice/PracticeSession.tsx` | Composición principal de la experiencia de práctica. |
| `/frontend/src/components/practice/ExpectedNotes.tsx` | Representación de las notas que deben tocarse. |
| `/frontend/src/components/practice/PerformanceScore.tsx` | Puntuaciones y resultados de la interpretación. |
| `/frontend/src/components/practice/SessionControls.tsx` | Reproducción, pausa, detención y repetición. |
| `/frontend/src/components/agent/` | Componentes que hacen visible el agente pedagógico. |
| `/frontend/src/components/agent/AgentStatus.tsx` | Estado actual del agente. |
| `/frontend/src/components/agent/CurrentAction.tsx` | Acción activa y motivo. |
| `/frontend/src/components/agent/ControlIndicator.tsx` | Indicador de quién controla el piano. |
| `/frontend/src/features/pieces/` | Lógica de datos y tipos de la funcionalidad de piezas. |
| `/frontend/src/features/practice/` | Lógica de datos, hooks y WebSocket de práctica. |
| `/frontend/src/features/agent/` | Lógica y tipos de las acciones del agente. |
| `/frontend/src/lib/api-client.ts` | Cliente HTTP común y configuración de API. |
| `/frontend/src/lib/websocket-client.ts` | Cliente WebSocket común. |
| `/frontend/src/lib/keyboard-mapping.ts` | Mapeo del teclado del ordenador a notas musicales. |
| `/frontend/src/lib/validation.ts` | Validaciones de entrada en el cliente. |
| `/frontend/src/hooks/useComputerKeyboard.ts` | Hook para capturar el teclado del ordenador. |
| `/frontend/src/hooks/usePracticeSession.ts` | Hook para consultar y actualizar una sesión. |
| `/frontend/src/hooks/usePlayback.ts` | Hook para controlar el estado visual de reproducción. |
| `/frontend/src/store/practice-store.ts` | Estado global de la sesión si la complejidad lo requiere. |
| `/frontend/src/types/` | Tipos compartidos dentro del frontend. |
| `/frontend/src/types/midi.ts` | Tipos de piezas, notas, tracks y tempo. |
| `/frontend/src/types/practice.ts` | Tipos de sesiones, eventos y evaluación. |
| `/frontend/src/types/agent.ts` | Tipos de estados y acciones del agente. |
| `/shared/README.md` | Explicación de los contratos compartidos entre frontend y backend. |
| `/shared/schemas/piece.schema.json` | Contrato JSON de una pieza normalizada. |
| `/shared/schemas/session.schema.json` | Contrato JSON de una sesión y su estado. |
| `/shared/schemas/action.schema.json` | Contrato JSON de las acciones permitidas del agente. |
| `/scripts/seed_demo_data.py` | Preparación de datos de demo desde la raíz del monorepo. |
| `/scripts/validate_midi_corpus.py` | Validación del corpus completo de piezas MIDI. |
| `/scripts/export_openapi.py` | Exportación del contrato OpenAPI para documentación o clientes. |
| `/docs/architecture.md` | Documentación técnica más detallada cuando este archivo crezca. |
| `/docs/api.md` | Referencia de endpoints, payloads y códigos de respuesta. |
| `/docs/decisions/0001-monorepo.md` | Justificación de usar un monorepo. |
| `/docs/decisions/0002-deterministic-music-engine.md` | Justificación de separar el motor musical del LLM. |
| `/docs/decisions/0003-web-first-interface.md` | Decisión de comenzar con una interfaz web y no con consola retro. |
| `/docs/demos/first-mvp-flow.md` | Guion reproducible de la primera demostración de extremo a extremo. |

## 6. Límites entre capas

### 6.1 Dependencias permitidas

```text
API
  → Application
      → Domain
      → Infrastructure

Frontend
  → API pública mediante HTTP/WebSocket

Infrastructure
  → Librerías externas, base de datos, filesystem, Mido, Groq, LangGraph
```

La capa `domain` debe mantenerse independiente de FastAPI, Next.js, Mido, SQLAlchemy, LangGraph y proveedores LLM.

### 6.2 Dependencias que se deben evitar

- `domain` importando módulos de `api`.
- Componentes React ejecutando SQL o leyendo archivos del backend.
- FastAPI calculando timing nota por nota directamente en los endpoints.
- El LLM enviando `note_on` o `note_off`.
- LangGraph controlando el reloj de reproducción.
- El frontend duplicando las reglas oficiales de evaluación.
- La interfaz llamando directamente a Mido.

## 7. Contratos principales de API

La API debe versionarse desde el comienzo:

```text
POST /api/v1/pieces
GET  /api/v1/pieces/{piece_id}
POST /api/v1/sessions
GET  /api/v1/sessions/{session_id}
POST /api/v1/sessions/{session_id}/events
GET  /api/v1/sessions/{session_id}/state
POST /api/v1/sessions/{session_id}/actions
POST /api/v1/sessions/{session_id}/agent-step
WS   /api/v1/ws/sessions/{session_id}
```

El frontend debe consumir estos contratos a través de `api-client.ts` y `websocket-client.ts`, no mediante URLs dispersas dentro de los componentes.

## 8. Destino de despliegue inicial

La primera estrategia de despliegue será separar frontend y backend, manteniendo el monorepo como unidad de desarrollo:

| Componente | Plataforma inicial | Responsabilidad | Requisitos principales |
|---|---|---|---|
| Frontend Next.js | [Vercel](https://vercel.com/) | Servir la interfaz web y sus rutas de Next.js. | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL` y configuración de CORS en el backend. |
| Backend FastAPI | [Hugging Face Spaces](https://huggingface.co/spaces) | Ejecutar la API, sesiones, evaluación y motor MIDI del MVP. | Space con SDK Docker, `Dockerfile`, variables secretas y almacenamiento adecuado para archivos temporales. |
| Persistencia MVP | SQLite + sqlite-vec local (metadatos y vectores) o volumen persistente del Space | Guardar estado básico durante la validación. | No asumir que el filesystem efímero es persistente; documentar el volumen o limitarlo a demos. |
| Archivos MIDI MVP | Filesystem del backend | Recibir y procesar archivos cargados. | Limitar tamaño, validar extensión/contenido y tratar los archivos como privados. |

### Flujo entre despliegues

```text
Navegador
   ↓
Vercel / Next.js
   ├── HTTPS → Hugging Face Space / FastAPI
   └── WSS  → Hugging Face Space / WebSocket de sesión
```

La URL pública de Vercel debe configurarse en `CORS_ORIGINS` del backend. El frontend no debe depender de `localhost` en producción; las URLs públicas deben entrar mediante variables de entorno de Vercel.

### Condiciones antes de producción

- [ ] Confirmar que el Space elegido permite ejecutar el contenedor y exponer FastAPI correctamente.
- [ ] Configurar secretos en Vercel y Hugging Face, nunca en el repositorio.
- [ ] Usar HTTPS y WSS en las URLs públicas.
- [ ] Verificar si el plan y la configuración del Space mantienen WebSocket y archivos durante la sesión.
- [ ] Sustituir SQLite (+ sqlite-vec)/filesystem por PostgreSQL (+ pgvector) y almacenamiento de objetos si se requiere persistencia real.
- [ ] Añadir límites de tamaño, timeout y limpieza de archivos MIDI cargados.
- [ ] Ejecutar una prueba end-to-end desde la URL pública de Vercel.

Este destino es adecuado para el **primer despliegue demostrable**, no constituye todavía una arquitectura de alta disponibilidad. La decisión de migrar a otra plataforma debe conservar los contratos de la API y la separación de capas descritos en este documento.

## 9. Evolución recomendada

### Etapa 1 — MVP simple

- Crear backend y frontend independientes dentro del monorepo.
- Implementar carga y validación de MIDI.
- Mostrar metadatos en Next.js.
- Crear piano virtual básico.
- Crear sesión de práctica.
- Capturar teclado del ordenador.
- Implementar evaluación determinista básica.
- Ejecutar todo con Docker Compose.

### Etapa 2 — Separación del dominio

- Extraer MIDI, evaluación, práctica y agente a `domain/`.
- Convertir `api.py` en routers versionados.
- Introducir servicios de aplicación y repositorios.
- Añadir tests unitarios e integración.

### Etapa 3 — Agente validado

- Implementar máquina de estados explícita.
- Añadir acciones `wait`, `give_hint`, `slow_down`, `demonstrate`, `accompany` y `return_control`.
- Garantizar timeout, pausa, detención y devolución automática del control.
- Añadir proveedor determinista como fallback permanente.

### Etapa 4 — LangGraph y LLM

- Integrar LangGraph solo para orquestación de alto nivel.
- Añadir Groq detrás de una interfaz de proveedor.
- Validar toda salida estructurada antes de ejecutar acciones.
- Registrar únicamente trazas de decisiones de alto nivel.

### Etapa 5 — Producción y expansión

- Migrar SQLite (+ sqlite-vec) a PostgreSQL (+ pgvector) cuando sea necesario.
- Separar almacenamiento de archivos si el volumen lo exige.
- Añadir Web MIDI como capacidad opcional.
- Incorporar autenticación, historial, planes de práctica y progreso.
- Mantener los contratos de dominio y API compatibles o versionados.

## 10. Decisión actual

La estructura que debe implementarse primero es la de **MVP simple**. La estructura completa funciona como destino arquitectónico, no como requisito para crear todos los archivos desde el primer día.

La primera implementación debe evitar tanto:

- un único archivo monolítico con toda la lógica; como
- una sobrearquitectura con docenas de módulos vacíos.

La regla práctica será:

> Crear una separación cuando exista una responsabilidad real que probar, sustituir o evolucionar.

El proyecto comienza con una web simple, pero desde el inicio conserva los límites necesarios para que el motor musical, la evaluación, el agente y la interfaz puedan crecer de forma independiente.

## 11. Skills del agente

Las skills son instrucciones especializadas que el agente puede cargar para trabajar en áreas específicas del proyecto. Se ubican en:

```text
.agents/skills/
├── piano-mentor-ai-development/   Desarrollo y mantenimiento del proyecto
├── piano-mentor-github-projects/  Automatización de GitHub Projects
├── piano-mentor-architecture/     Mantenimiento del filetree y contexto por archivo
├── opencode/                      Gestión y configuración de OpenCode
└── report/                        Reporte de issues y bugs
```

| Skill | Propósito |
|---|---|
| `piano-mentor-ai-development` | Desarrollo y mantenimiento de PianoMentor AI: diseño de módulos, parsing/reproducción MIDI, evaluación, consola retro, frontend, LangGraph/LLM. |
| `piano-mentor-github-projects` | Automatización de GitHub Projects: crear Issues, sincronizar Priority y Target date, exportar respaldo, detectar duplicados, revisar límites de API. |
| `piano-mentor-architecture` | Regenerar `ARCHITECTURE.md` desde `architecture/architecture_base.md` + `architecture/files.csv` + filetree real. No editar `ARCHITECTURE.md` a mano. |
| `opencode` | Uso, configuración y troubleshooting de OpenCode: agentes, comandos, skills, herramientas, permisos, MCP, modelos, temas, keybinds, formatters, CLI, TUI, apps. |
| `report` | Reporte de issues o bugs de OpenCode con diagnósticos estándar y publicación mediante GitHub CLI. |

Las skills se cargan automáticamente cuando el agente detecta que una tarea coincide con su descripción. No modifican el código del proyecto; son instrucciones de contexto para el agente.

## 12. Mantenimiento de este documento (base + CSV + filetree generado)

`ARCHITECTURE.md` es un archivo **generado**. No editarlo a mano: cualquier cambio manual se pierde en la siguiente regeneración.

| Pieza | Rol | Se edita a mano |
|---|---|---|
| `architecture/architecture_base.md` | Contenido manual: principios, capas, contratos, evolución. Es la fuente de verdad arquitectónica. | Sí |
| `architecture/files.csv` | Contexto por archivo: columnas `path,description,context`. Fuente de verdad del "qué hace cada archivo" para agentes. | Sí |
| `architecture/generate_architecture.py` | Script que combina base + filetree real + tabla del CSV y escribe `ARCHITECTURE.md`. No toca la base. | Solo si cambia el formato |
| `ARCHITECTURE.md` | Salida final: base + `Anexo A` (filetree real) + `Anexo B` (tabla del CSV). | No |

Flujo de la skill `piano-mentor-architecture`:

```text
1. Editar architecture/architecture_base.md y/o architecture/files.csv
2. Ejecutar: python architecture/generate_architecture.py
3. Revisar el diff de ARCHITECTURE.md generado
```

El script nunca modifica `architecture_base.md` ni `files.csv`; solo lee y escribe `ARCHITECTURE.md`.

---

> Anexo generado automáticamente el 2026-10-09 14:30 UTC por `architecture/generate_architecture.py`. No editar a mano.

## Anexo A — Filetree real del repositorio

```text
piano-mentor-ai/
├── .agents/
├── .agents/skills/
├── .agents/skills/piano-mentor-ai-development/
├── .agents/skills/piano-mentor-ai-development/SKILL.md
├── .agents/skills/piano-mentor-architecture/
├── .agents/skills/piano-mentor-architecture/SKILL.md
├── .agents/skills/piano-mentor-github-projects/
├── .agents/skills/piano-mentor-github-projects/SKILL.md
├── .env
├── .env.example
├── .github_projects/
├── .github_projects/project-backlog.csv
├── .github_projects/project-backup.json
├── .github_projects/README.md
├── .github_projects/scripts/
├── .github_projects/scripts/create-github-subissues.ps1
├── .github_projects/scripts/export-github-project.ps1
├── .github_projects/scripts/import-github-issues.ps1
├── .github_projects/scripts/sync-github-project.ps1
├── .gitignore
├── .vscode/
├── .vscode/settings.json
├── AGENTS.md
├── architecture/
├── architecture/architecture_base.md
├── architecture/files.csv
├── architecture/generate_architecture.py
├── backend/
├── backend/Dockerfile
├── backend/pyproject.toml
├── backend/src/
├── backend/src/piano_mentor/
├── backend/src/piano_mentor/__init__.py
├── backend/src/piano_mentor/agent.py
├── backend/src/piano_mentor/api.py
├── backend/src/piano_mentor/config.py
├── backend/src/piano_mentor/evaluation.py
├── backend/src/piano_mentor/main.py
├── backend/src/piano_mentor/midi.py
├── backend/src/piano_mentor/practice.py
├── backend/src/piano_mentor/schemas.py
├── backend/src/piano_mentor/storage.py
├── backend/src/piano_mentor/validators.py
├── backend/src/piano_mentor_backend.egg-info/
├── backend/src/piano_mentor_backend.egg-info/dependency_links.txt
├── backend/src/piano_mentor_backend.egg-info/PKG-INFO
├── backend/src/piano_mentor_backend.egg-info/requires.txt
├── backend/src/piano_mentor_backend.egg-info/SOURCES.txt
├── backend/src/piano_mentor_backend.egg-info/top_level.txt
├── backend/tests/
├── backend/tests/test_agent.py
├── backend/tests/test_catalog.py
├── backend/tests/test_evaluation.py
├── backend/tests/test_health.py
├── backend/tests/test_midi.py
├── backend/tests/test_piece_contract.py
├── backend/tests/test_piece_upload.py
├── backend/tests/test_storage.py
├── backend/tests/test_validators.py
├── data/
├── data/midi/
├── data/midi/.gitkeep
├── data/midi/corpus/
├── data/sessions/
├── data/sessions/.gitkeep
├── data/uploads/
├── data/uploads/.gitkeep
├── desing/
├── desing/main_page.ai
├── docker-compose.yml
├── docs/
├── docs/GETTING_STARTED.md
├── docs/TROUBLESHOOTING.md
├── frontend/
├── frontend/assets/
├── frontend/assets/piano_virtual_88_pressed.svg
├── frontend/Dockerfile
├── frontend/next-env.d.ts
├── frontend/next.config.ts
├── frontend/package-lock.json
├── frontend/package.json
├── frontend/src/
├── frontend/src/app/
├── frontend/src/app/globals.css
├── frontend/src/app/layout.tsx
├── frontend/src/app/page.tsx
├── frontend/src/app/practice/
├── frontend/src/app/practice/[sessionId]/
├── frontend/src/app/practice/[sessionId]/page.tsx
├── frontend/src/components/
├── frontend/src/components/MidiUploader.tsx
├── frontend/src/components/PianoKeyboard.tsx
├── frontend/src/components/SessionStatus.tsx
├── frontend/src/lib/
├── frontend/src/lib/.gitkeep
├── frontend/tsconfig.json
├── frontend/tsconfig.tsbuildinfo
├── GLOSSARY.md
├── issues/
├── issues/B-001/
├── issues/B-001/B-001.1.md
├── issues/B-001/B-001.2.md
├── issues/B-001/B-001.3.md
├── issues/B-001/B-001.4.md
├── issues/B-001/B-001.5.md
├── issues/B-001/B-001.6.md
├── issues/B-001/B-001.7.md
├── issues/B-001/B-001.8.md
├── issues/B-001/B-001.md
├── issues/B-002/
├── issues/B-002/B-002.1.md
├── issues/B-002/B-002.2.md
├── issues/B-002/B-002.3.md
├── issues/B-002/B-002.4.md
├── issues/B-002/B-002.md
├── issues/B-003/
├── issues/B-003/B-003.1.md
├── issues/B-003/B-003.2.md
├── issues/B-003/B-003.3.md
├── issues/B-003/B-003.md
├── issues/B-027/
├── issues/B-027/B-027.1.md
├── issues/B-027/B-027.2.md
├── issues/B-027/B-027.3.md
├── issues/B-027/B-027.md
├── LICENSE
├── nota.txt
├── PLAN.md
├── README.md
├── shared/
├── shared/schemas/
├── shared/schemas/action.schema.json
```

## Anexo B — Contexto por archivo (`architecture/files.csv`)

| Ruta | Descripción | Contexto para el agente |
|---|---|---|
| `README.md` | Producto PianoMentor AI: visión, alcance del MVP, principios y mapa de documentos. | Leer antes de cualquier cambio de arquitectura o comportamiento. |
| `PLAN.md` | Cronograma y aceptación del MVP en 5 semanas: backlog, entregables semanales y Definition of Done. | Fuente de verdad de qué hacer y en qué orden; no describe estructura técnica. |
| `ARCHITECTURE.md` | Arquitectura generada: base manual + Anexo A (filetree real) + Anexo B (tabla de este CSV). | NO editar a mano; editar architecture_base.md o files.csv y regenerar. |
| `AGENTS.md` | Instrucciones persistentes del entorno: terminal PowerShell 5.1, UTF-8 sin BOM y reglas del proyecto. | Leer antes de crear o sobrescribir archivos desde herramientas. |
| `GLOSSARY.md` | Definiciones de términos musicales, técnicos y pedagógicos del proyecto. | Resolver vocabulario (nota, compás, timing, acción) antes de diseñar. |
| `docker-compose.yml` | Orquestación local: servicios backend (FastAPI) y frontend (Next.js) con volúmenes de datos. | Arranque reproducible del MVP; base del despliegue local. |
| `.env.example` | Plantilla de variables de entorno sin secretos (puertos, CORS, rutas MIDI, Groq). | Copiar a .env para desarrollo; nunca commitear valores reales. |
| `.gitignore` | Exclusiones de git: secretos, venv, node_modules, .next, datos locales y *.skill. | Evita subir .env, uploads MIDI y artefactos generados. |
| `LICENSE` | Licencia del repositorio. | Marco legal de uso y distribución del código. |
| `architecture/architecture_base.md` | Fuente manual de ARCHITECTURE.md: principios, capas, contratos y evolución. Sin filetree. | Editar aquí la arquitectura; el script añade los anexos generados. |
| `architecture/files.csv` | Único CSV de contexto por archivo: path,description,context para agentes. | Leer para saber qué hace cada archivo; mantener una fila por archivo relevante. |
| `architecture/generate_architecture.py` | Script que combina base + filetree real + files.csv y escribe ARCHITECTURE.md. | Ejecutar con python tras editar la base o el CSV; no modifica la base. |
| `backend/Dockerfile` | Imagen reproducible del backend FastAPI. | Despliegue local y base del Space de Hugging Face. |
| `backend/pyproject.toml` | Dependencias y config Python del backend (FastAPI, Pydantic, Mido, pytest). | Instalar y fijar versiones del backend. |
| `backend/src/piano_mentor/__init__.py` | Marca el paquete Python piano_mentor. | Raíz de importaciones del backend. |
| `backend/src/piano_mentor/main.py` | Entrada FastAPI: crea app, configura CORS y registra el router. | Arranque del backend y endpoint /health. |
| `backend/src/piano_mentor/config.py` | Configuración tipada desde variables de entorno (Settings). | Centraliza puertos, CORS, rutas MIDI y base de datos. |
| `backend/src/piano_mentor/api.py` | Rutas HTTP y WebSocket del MVP (/pieces, /sessions, /actions, /agent-step, /ws). Debe mantenerse delgado. | Traduce HTTP/WS a servicios; sin lógica musical compleja. |
| `backend/src/piano_mentor/schemas.py` | Modelos Pydantic de peticiones y respuestas de la API. | Contrato tipado entre frontend y backend. |
| `backend/src/piano_mentor/validators.py` | Validación de uploads MIDI: nombre, extensión, tamaño y contenido. | Rechaza archivos inválidos antes de guardarlos. |
| `backend/src/piano_mentor/storage.py` | Guardado local de piezas MIDI en filesystem. | Persistencia MVP de bytes MIDI; metadatos irán a SQLite. |
| `backend/src/piano_mentor/midi.py` | Motor MIDI determinista: lectura, validación y normalización con Mido. | Núcleo musical; no decide pedagogía ni responde HTTP. |
| `backend/src/piano_mentor/evaluation.py` | Evaluador determinista: notas correctas, omitidas, extras, precisión y timing. | Mide la interpretación sin LLM ni UI. |
| `backend/src/piano_mentor/practice.py` | Casos de uso de sesión de práctica: crear sesión, estado y eventos. | Coordina pieza + interpretación + estado. |
| `backend/src/piano_mentor/agent.py` | Agente determinista: lista blanca y reglas de decisión (wait, give_hint, slow_down, demonstrate, accompany, return_control). | Fallback obligatorio sin LLM; nunca envía MIDI directo. |
| `backend/tests/test_health.py` | Verifica que la API arranca y /health responde. | Humo del backend. |
| `backend/tests/test_midi.py` | MIDI válido, inválido y normalización básica. | Confianza en el parsing. |
| `backend/tests/test_evaluation.py` | Notas correctas, omitidas, adicionales y timing. | Confianza en el evaluador. |
| `backend/tests/test_agent.py` | Reglas, validación de acciones y devolución del control. | Confianza en el agente determinista. |
| `backend/tests/test_validators.py` | Extensión, tamaño, nombre y contenido de uploads. | Confianza en el rechazo de archivos malos. |
| `backend/tests/test_storage.py` | Guardado y recuperación local de piezas. | Confianza en el filesystem del MVP. |
| `backend/tests/test_piece_upload.py` | Integración del endpoint POST /pieces. | Contrato de carga extremo a extremo. |
| `backend/tests/test_piece_contract.py` | Contrato de metadatos de pieza del MVP. | Evita rupturas del formato de pieza. |
| `backend/tests/test_catalog.py` | Catálogo o listado base de piezas. | Orden y acceso a piezas de demo. |
| `frontend/Dockerfile` | Imagen reproducible del frontend Next.js. | Servir la UI en local y base del despliegue en Vercel. |
| `frontend/package.json` | Dependencias y scripts del frontend (Next.js, TypeScript). | Instalar y arrancar la web. |
| `frontend/next.config.ts` | Configuración de Next.js. | Ajustes de build y runtime web. |
| `frontend/tsconfig.json` | Configuración del compilador TypeScript. | Tipos estrictos en el frontend. |
| `frontend/src/app/layout.tsx` | Layout global de la aplicación web. | Envoltorio común de páginas. |
| `frontend/src/app/page.tsx` | Página inicial: carga de MIDI y acceso a práctica. | Entrada del flujo cargar → practicar. |
| `frontend/src/app/globals.css` | Estilos globales de la aplicación. | Base visual de la web. |
| `frontend/src/app/practice/[sessionId]/page.tsx` | Página de una sesión de práctica concreta. | Vista de tocar, evaluar y ver al agente. |
| `frontend/src/components/MidiUploader.tsx` | Selector y carga de archivos MIDI al backend. | Subida con validación y errores visibles. |
| `frontend/src/components/PianoKeyboard.tsx` | Piano virtual y resaltado de notas. | Muestra notas esperadas y recibidas; sin parsing MIDI. |
| `frontend/src/components/SessionStatus.tsx` | Estado actual: tempo, compás y quién controla el piano. | Hace visible practicing/waiting/demonstrating. |
| `frontend/src/components/PracticeSession.tsx` | Vista principal de práctica (se incorpora con B-012). | Composición de teclado + estado + controles. |
| `frontend/src/lib/api-client.ts` | Cliente HTTP tipado hacia FastAPI (se incorpora con B-004). | Único punto de llamadas REST desde componentes. |
| `frontend/src/lib/websocket-client.ts` | Cliente WebSocket de sesión en tiempo real (se incorpora con B-012). | Actualizaciones de estado de práctica. |
| `data/midi/.gitkeep` | Mantiene la carpeta de MIDI de demo en git. | Piezas de prueba con licencia compatible. |
| `data/uploads/.gitkeep` | Mantiene la carpeta de uploads locales en git. | MIDI subidos durante el desarrollo (privados). |
| `data/sessions/.gitkeep` | Mantiene la carpeta de sesiones locales en git. | Datos temporales o exportaciones de sesión. |
| `shared/schemas/action.schema.json` | Contrato JSON de acciones permitidas del agente. | Valida wait/give_hint/slow_down/demonstrate/accompany/return_control. |
| `docs/GETTING_STARTED.md` | Guía reproducible de instalación, arranque y validación local. | Primer arranque del proyecto. |
| `docs/TROUBLESHOOTING.md` | Bitácora viva de problemas, diagnóstico y soluciones. | Consultar ante fallos conocidos. |
| `issues/B-001/B-001.md` | Resumen y aceptación de la Issue B-001 (estructura monorepo). | alcance de la issue principal; detalle en B-001.N.md. |
| `issues/B-002/B-002.md` | Resumen y aceptación de la Issue B-002 (contrato y almacenamiento de piezas). | Contrato base de piezas MIDI. |
| `issues/B-003/B-003.md` | Resumen y aceptación de la Issue B-003 (carga MIDI con SQLite + sqlite-vec). | Persistencia MVP de piezas y vectores. |
| `.agents/skills/piano-mentor-ai-development/SKILL.md` | Skill de desarrollo: separación determinista/API/UI/agente, contratos y checklist. | Cargar al modificar MIDI, evaluación, frontend o agente. |
| `.agents/skills/piano-mentor-github-projects/SKILL.md` | Skill de GitHub Projects: importar issues, sincronizar Priority/Target date y respaldar. | Cargar al operar backlog e issues B-xxx. |
| `.agents/skills/piano-mentor-architecture/SKILL.md` | Skill de arquitectura: regenerar ARCHITECTURE.md desde base + CSV + filetree. | Cargar al documentar archivos o estructura; ejecuta el script. |
| `desing/main_page.ai` | Diseño en Illustrator de la main page del frontend (referencia visual, no asset compilado). | Fuente de diseño de la página inicial; implementar en Next.js según este diseño. |
| `frontend/assets/piano_virtual_88_pressed.svg` | Piano virtual de 88 teclas en SVG con ids por tecla y estados de tecla presionada. | Asset del teclado virtual para el frontend; manipular por id para resaltado y pressed. |

_Para añadir un archivo nuevo: agrega su fila en `architecture/files.csv` y ejecuta `python architecture/generate_architecture.py`._
