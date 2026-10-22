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
Next.js: elegir una pieza del catálogo (Library) o cargar un archivo MIDI
  ↓ HTTP
FastAPI: validar la pieza (el corpus ya está registrado; la subida efímera solo se valida y no se registra)
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

El árbol siguiente describe la estructura objetivo del MVP de forma acumulativa. La creación de la estructura base de B-001.1 no exige que todos los módulos funcionales ya existan: los archivos de aplicación se incorporan progresivamente junto con sus Issues. En particular, `database.py` (SQLite + sqlite-vec) se incorporó con B-003, los componentes y clientes HTTP iniciales con B-004, y el cliente WebSocket y la vista de práctica con B-012.1. Las tablas de sesiones (`sessions`) y su log de eventos (`session_events`) llegan en la migración 0005.

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
│       │   ├── PianoStage/
│       │   │   ├── NoteFallGrid/
│       │   │   └── Keyboard/
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
| `/backend/src/piano_mentor/api.py` | Rutas HTTP y WebSocket del MVP, incluidas las de sesión de práctica y el registro en memoria de conexiones WS. Debe mantenerse delgado. |
| `/backend/src/piano_mentor/schemas.py` | Modelos Pydantic para peticiones y respuestas de la API, con el estado de sesión (`SessionStateResponse`) como contrato. |
| `/backend/src/piano_mentor/database.py` | Conexión y operaciones con SQLite + sqlite-vec (metadatos de piezas, sesiones y su log de eventos, y migraciones SQL versionadas) en modo WAL con `busy_timeout`; los vectores quedan pendientes de B-005/B-013. Los bytes MIDI siguen en filesystem (`MIDI_STORAGE_PATH`). |
| `/backend/src/piano_mentor/midi.py` | Lectura, validación y normalización de archivos MIDI. |
| `/backend/src/piano_mentor/evaluation.py` | Comparación de notas, omisiones, extras, precisión y timing. |
| `/backend/src/piano_mentor/practice.py` | Creación de sesiones, lectura del estado vivo y registro de los eventos MIDI de la interpretación. |
| `/backend/src/piano_mentor/agent.py` | Reglas deterministas y acciones iniciales del agente. |
| `/backend/tests/` | Pruebas automáticas del backend. |
| `/backend/tests/test_health.py` | Comprueba que la API arranca y responde correctamente. |
| `/backend/tests/test_midi.py` | Pruebas de MIDI válido, inválido y normalización básica. |
| `/backend/tests/test_evaluation.py` | Pruebas de notas correctas, omitidas, adicionales y timing. |
| `/backend/tests/test_agent.py` | Pruebas de reglas, validación y devolución del control. |
| `/backend/tests/test_sessions.py` | Pruebas de sesión de práctica: creación, estado, eventos por WebSocket y broadcast. |
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
| `/frontend/src/components/PianoStage/` | Escenario del piano: cuadrícula de notas cayendo y teclado SVG real (B-007). |
| `/frontend/src/components/PracticeSession.tsx` | Vista de una sesión de práctica: teclado del PC, WebSocket y estado en vivo (B-012.1). |
| `/frontend/src/components/SessionStatus.tsx` | Estado de la sesión: modo, compás, control del piano, conexión y último error. |
| `/frontend/src/lib/api-client.ts` | Cliente HTTP tipado para comunicarse con FastAPI, incluida la creación y consulta de sesiones (B-012.1). |
| `/frontend/src/lib/websocket-client.ts` | Cliente WebSocket con reconexión para el estado de la sesión de práctica (B-012.1). |
| `/data/midi/` | MIDI de prueba o archivos preparados para demostraciones. |
| `/data/uploads/` | Archivos MIDI cargados localmente durante el desarrollo. |
| `/data/sessions/` | Datos temporales o exportaciones de sesiones. |
| `/shared/schemas/action.schema.json` | Esquema compartido para validar acciones del agente. |

### 4.3 Responsabilidades de los módulos simples

| Módulo | Responsabilidad | No debe hacer |
|---|---|---|
| `midi.py` | Leer, normalizar y analizar MIDI (acordes, pistas y manos). | Decidir acciones pedagógicas o responder HTTP directamente. |
| `evaluation.py` | Comparar interpretación y calcular métricas. | Renderizar UI o llamar al LLM. |
| `practice.py` | Gestionar sesiones y estado de práctica. | Implementar componentes web. |
| `agent.py` | Seleccionar y validar acciones estructuradas. | Enviar eventos MIDI directamente desde un LLM. |
| `api.py` | Traducir HTTP/WebSocket a casos de uso. | Contener algoritmos musicales complejos. |
| `PianoStage/Keyboard/Keyboard.tsx` | Mostrar el teclado virtual y su estado visual. | Parsear MIDI o calcular timing. |

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
| `/frontend/public/audio/piano/` | Banco de muestras de piano versionado (120 MP3 + `manifest.json`, 4,7 MB); se regenera con `npm run samples` y su licencia está en `THIRD_PARTY_NOTICES.md`. |
| `/frontend/scripts/` | Scripts de desarrollo del frontend; hoy el de descarga y trascodificación de las muestras de piano. |
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
GET  /api/v1/pieces
GET  /api/v1/pieces/{piece_id}
POST /api/v1/pieces/preview
POST /api/v1/sessions
GET  /api/v1/sessions/{session_id}/state
POST /api/v1/sessions/{session_id}/actions
POST /api/v1/sessions/{session_id}/agent-step
POST /api/v1/sessions/{session_id}/evaluation
WS   /api/v1/ws/sessions/{session_id}
```

Los eventos MIDI de la interpretación no tienen endpoint propio: entran por el WebSocket de la sesión y se persisten en `session_events`. Los mensajes del canal van envueltos en un campo `type` (`state` con el estado vivo y `error` con un `code` estable; B-012.5 añadirá `agent_action`), para que el contrato pueda crecer sin romperse. Un payload inválido se responde con `invalid_event_payload` sin cerrar la sesión, y una sesión inexistente se cierra con el código 4404 después de avisar. El registro de conexiones que sostiene el broadcast vive en la memoria del proceso, así que el MVP se despliega con un solo worker.

El frontend debe consumir estos contratos a través de `api-client.ts` y `websocket-client.ts`, no mediante URLs dispersas dentro de los componentes.

`POST /api/v1/pieces` deduplica por SHA-256 del contenido: si la pieza ya existe (incluido el corpus) devuelve la fila existente con `deduplicated: true` en lugar de crear un archivo o una fila nueva. La procedencia se marca en `source` (`corpus` o `upload`) y `owner_id` (reservado para autenticación; `NULL` = anónimo). Corpus y subidas comparten la tabla `pieces` y se separan por columnas, no por tablas, para no fragmentar las consultas de sesiones y evaluación.

`GET /api/v1/pieces` alimenta el selector de piezas (la Library): devuelve el catálogo ordenado con el corpus primero y admite `?source=corpus|upload` para separar el repertorio incluido de las piezas subidas. El catálogo mezcla las 17 piezas de terceros (Mutopia) con una **pieza propia de práctica** (`p16`, CC0, 4 compases, sin fuente externa ni portada) que aporta material determinista a los tests de sesión y evaluación y que, por eso, es el único `.mid` del corpus que viaja en git. Como la base no está versionada, antes de listar siembra el corpus del repositorio cuando no hay ninguna pieza suya (`ensure_catalog_loaded`, B-027.4): un arranque limpio ya sirve la Library en la primera petición y las siguientes no vuelven a leer el catálogo. Si el catálogo o los MIDI del corpus faltan en el host, se avisa por el log y el listado responde vacío en vez de fallar.

`POST /api/v1/pieces/preview` es la **única ruta de carga que no persiste**: valida el MIDI igual que `POST /api/v1/pieces`, lo lee en un directorio temporal y devuelve la partitura para poder escucharla, pero no escribe en el almacén ni en la tabla `pieces`. Así, subir un archivo a mano para probarlo no ensucia el catálogo; lo persistente sigue siendo el corpus del repositorio. La subida persistente (`POST /api/v1/pieces` y `uploadPiece` en el cliente) se conserva en el código aunque hoy la interfaz use la efímera.

`GET /api/v1/pieces/{piece_id}/notes` sirve la partitura ordenada con ventana opcional (`from_s`/`to_s` o `from_measure`/`to_measure` junto con `measures`) y admite dos añadidos de **B-009.3**: `?with_hands=true` pone `hand` (`left`/`right`/`unknown`) en cada nota y añade el resumen `tracks` de la pieza, y `?with_chords=true` añade `chords` con las notas que suenan a la vez. Sin pedirlos, la respuesta es exactamente la anterior: los campos nuevos son opcionales y se excluyen cuando no se piden. La mano se decide sobre **toda la pieza** (una ventana con una sola mano no la vuelve `unknown`) y los acordes sobre **las notas devueltas**, para que ninguno se salga de la ventana. `POST /api/v1/pieces/preview` acepta los mismos dos parámetros.

## 8. Destino de despliegue inicial

La estrategia de despliegue separa frontend y backend, manteniendo el monorepo como unidad de desarrollo:

| Componente | Plataforma inicial | Responsabilidad | Requisitos principales |
|---|---|---|---|
| Frontend Next.js | [Vercel](https://vercel.com/) | Servir la interfaz web y sus rutas de Next.js. | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL` y configuración de CORS en el backend. |
| Backend FastAPI | [Render](https://render.com/) (o equivalente con soporte Docker gratis) | Ejecutar la API, sesiones, evaluación y motor MIDI del MVP. | Servicio web Docker construido desde `backend/Dockerfile`, variables secretas y almacenamiento adecuado para archivos temporales. |
| Persistencia MVP | SQLite + sqlite-vec local (metadatos y vectores) en filesystem efímero | Guardar estado básico durante la validación. | No asumir que el filesystem efímero es persistente: el plan gratuito se limita a demos; para persistencia real haría falta PostgreSQL (+ pgvector) o un disco persistente de pago. |
| Archivos MIDI MVP | Filesystem del backend | Recibir y procesar archivos cargados. | Limitar tamaño, validar extensión/contenido y tratar los archivos como privados. |

**Justificación del cambio de Hugging Face Spaces a Render:** Hugging Face retiró los Spaces con SDK Docker y Gradio del plan gratuito a finales de 2025; crear cualquiera de los dos exige ahora un plan de pago (PRO para cuentas personales), y solo los Spaces estáticos siguen siendo gratuitos. Como el backend necesita un contenedor Docker con FastAPI y WebSocket, se eligió Render, que sí despliega desde `backend/Dockerfile` en su capa gratuita.

### Flujo entre despliegues

```text
Navegador
   ↓
Vercel / Next.js
   ├── HTTPS → Render / FastAPI
   └── WSS  → Render / WebSocket de sesión
```

La URL pública de Vercel debe configurarse en `CORS_ORIGINS` del backend. El frontend no debe depender de `localhost` en producción; las URLs públicas deben entrar mediante variables de entorno de Vercel.

### Condiciones antes de producción

- [ ] Confirmar que el servicio en Render construye el contenedor y expone FastAPI correctamente.
- [ ] Configurar secretos en Vercel y Render, nunca en el repositorio.
- [ ] Usar HTTPS y WSS en las URLs públicas.
- [ ] Verificar que el WebSocket de sesión mantiene la conexión con las reglas de inactividad de Render (el plan gratuito duerme tras 15 minutos sin tráfico).
- [ ] Documentar que SQLite y los archivos cargados se pierden al reiniciar el servicio gratuito; aceptarlo solo para la demo o migrar a persistencia real.
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
