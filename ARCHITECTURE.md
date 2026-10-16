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
| `/frontend/src/components/PianoStage/` | Escenario del piano: cuadrícula de notas cayendo y teclado SVG real (B-007). |
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
GET  /api/v1/sessions/{session_id}
POST /api/v1/sessions/{session_id}/events
GET  /api/v1/sessions/{session_id}/state
POST /api/v1/sessions/{session_id}/actions
POST /api/v1/sessions/{session_id}/agent-step
WS   /api/v1/ws/sessions/{session_id}
```

El frontend debe consumir estos contratos a través de `api-client.ts` y `websocket-client.ts`, no mediante URLs dispersas dentro de los componentes.

`POST /api/v1/pieces` deduplica por SHA-256 del contenido: si la pieza ya existe (incluido el corpus) devuelve la fila existente con `deduplicated: true` en lugar de crear un archivo o una fila nueva. La procedencia se marca en `source` (`corpus` o `upload`) y `owner_id` (reservado para autenticación; `NULL` = anónimo). Corpus y subidas comparten la tabla `pieces` y se separan por columnas, no por tablas, para no fragmentar las consultas de sesiones y evaluación.

`GET /api/v1/pieces` alimenta el selector de piezas (la Library): devuelve el catálogo ordenado con el corpus primero y admite `?source=corpus|upload` para separar el repertorio incluido de las piezas subidas. Como la base no está versionada, antes de listar siembra el corpus del repositorio cuando no hay ninguna pieza suya (`ensure_catalog_loaded`, B-027.4): un arranque limpio ya sirve la Library en la primera petición y las siguientes no vuelven a leer el catálogo. Si el catálogo o los MIDI del corpus faltan en el host, se avisa por el log y el listado responde vacío en vez de fallar.

`POST /api/v1/pieces/preview` es la **única ruta de carga que no persiste**: valida el MIDI igual que `POST /api/v1/pieces`, lo lee en un directorio temporal y devuelve la partitura para poder escucharla, pero no escribe en el almacén ni en la tabla `pieces`. Así, subir un archivo a mano para probarlo no ensucia el catálogo; lo persistente sigue siendo el corpus del repositorio. La subida persistente (`POST /api/v1/pieces` y `uploadPiece` en el cliente) se conserva en el código aunque hoy la interfaz use la efímera.

`GET /api/v1/pieces/{piece_id}/notes` sirve la partitura ordenada con ventana opcional (`from_s`/`to_s` o `from_measure`/`to_measure` junto con `measures`) y admite dos añadidos de **B-009.3**: `?with_hands=true` pone `hand` (`left`/`right`/`unknown`) en cada nota y añade el resumen `tracks` de la pieza, y `?with_chords=true` añade `chords` con las notas que suenan a la vez. Sin pedirlos, la respuesta es exactamente la anterior: los campos nuevos son opcionales y se excluyen cuando no se piden. La mano se decide sobre **toda la pieza** (una ventana con una sola mano no la vuelve `unknown`) y los acordes sobre **las notas devueltas**, para que ninguno se salga de la ventana. `POST /api/v1/pieces/preview` acepta los mismos dos parámetros.

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

> Anexo generado automáticamente el 2026-10-16 19:22 UTC por `architecture/generate_architecture.py`. No editar a mano.

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
├── .vscode/extensions.json
├── .vscode/launch.json
├── .vscode/settings.json
├── AGENTS.md
├── architecture/
├── architecture/architecture_base.md
├── architecture/files.csv
├── architecture/generate_architecture.py
├── backend/
├── backend/Dockerfile
├── backend/pyproject.toml
├── backend/scripts/
├── backend/scripts/build_midi_fixtures.py
├── backend/scripts/describe_corpus_tracks.py
├── backend/src/
├── backend/src/piano_mentor/
├── backend/src/piano_mentor/__init__.py
├── backend/src/piano_mentor/agent.py
├── backend/src/piano_mentor/api.py
├── backend/src/piano_mentor/catalog.py
├── backend/src/piano_mentor/config.py
├── backend/src/piano_mentor/database.py
├── backend/src/piano_mentor/evaluation.py
├── backend/src/piano_mentor/main.py
├── backend/src/piano_mentor/midi.py
├── backend/src/piano_mentor/migrations/
├── backend/src/piano_mentor/migrations/0001_init_pieces.sql
├── backend/src/piano_mentor/migrations/0002_add_tempo.sql
├── backend/src/piano_mentor/migrations/0003_add_hash_and_provenance.sql
├── backend/src/piano_mentor/migrations/0004_add_cover.sql
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
├── backend/tests/conftest.py
├── backend/tests/fixtures/
├── backend/tests/fixtures/midi/
├── backend/tests/fixtures/midi/corrupt.mid
├── backend/tests/fixtures/midi/mixed_problems.mid
├── backend/tests/fixtures/midi/multi_track.mid
├── backend/tests/fixtures/midi/no_tempo.mid
├── backend/tests/fixtures/midi/single_track.mid
├── backend/tests/fixtures/midi/tempo_change.mid
├── backend/tests/fixtures/midi/unclosed_note.mid
├── backend/tests/test_agent.py
├── backend/tests/test_catalog.py
├── backend/tests/test_catalog_load.py
├── backend/tests/test_chords.py
├── backend/tests/test_database.py
├── backend/tests/test_evaluation.py
├── backend/tests/test_hands.py
├── backend/tests/test_health.py
├── backend/tests/test_measure_grid.py
├── backend/tests/test_measure_range.py
├── backend/tests/test_midi.py
├── backend/tests/test_piece_contract.py
├── backend/tests/test_piece_dedup.py
├── backend/tests/test_piece_list.py
├── backend/tests/test_piece_musical_metadata.py
├── backend/tests/test_piece_notes.py
├── backend/tests/test_piece_persistence.py
├── backend/tests/test_piece_polyphony.py
├── backend/tests/test_piece_preview.py
├── backend/tests/test_piece_upload.py
├── backend/tests/test_storage.py
├── backend/tests/test_validators.py
├── data/
├── data/midi/
├── data/midi/.gitkeep
├── data/midi/catalog.json
├── data/midi/corpus/
├── data/sessions/
├── data/sessions/.gitkeep
├── data/uploads/
├── data/uploads/.gitkeep
├── desing/
├── desing/main_page.ai
├── desing/main_page_box.jpg
├── desing/main_page_desing.jpg
├── docker-compose.debug.yml
├── docker-compose.yml
├── docs/
├── docs/GETTING_STARTED.md
├── docs/TROUBLESHOOTING.md
├── frontend/
├── frontend/.cache/
├── frontend/.cache/piano-samples/
├── frontend/.cache/piano-samples/SalamanderGrandPianoV3_OggVorbis/
├── frontend/.cache/piano-samples/SalamanderGrandPianoV3_OggVorbis/ogg/
├── frontend/.cache/piano-samples/SalamanderGrandPianoV3_OggVorbis/ogg/A0v13.ogg
├── frontend/.cache/piano-samples/SalamanderGrandPianoV3_OggVorbis/ogg/A4v8.ogg
├── frontend/.cache/piano-samples/SalamanderGrandPianoV3_OggVorbis/ogg/C4v13.ogg
├── frontend/.cache/piano-samples/SalamanderGrandPianoV3_OggVorbis/ogg/C4v4.ogg
├── frontend/.cache/piano-samples/SalamanderGrandPianoV3_OggVorbis/ogg/C8v13.ogg
├── frontend/.cache/piano-samples/SalamanderGrandPianoV3_OggVorbis.tar.bz2
├── frontend/.dockerignore
├── frontend/AGENTS.md
├── frontend/Dockerfile
├── frontend/next-env.d.ts
├── frontend/next.config.ts
├── frontend/package-lock.json
├── frontend/package.json
├── frontend/public/
├── frontend/public/assets/
├── frontend/public/assets/covers/
├── frontend/public/assets/covers/bach.jpg
├── frontend/public/assets/covers/beethoven.jpg
├── frontend/public/assets/covers/chopin.jpg
├── frontend/public/assets/covers/CREDITS.md
├── frontend/public/assets/covers/mozart.jpg
├── frontend/public/assets/icons/
├── frontend/public/assets/icons/bot.svg
├── frontend/public/assets/icons/cronometer.svg
├── frontend/public/assets/icons/eye.svg
├── frontend/public/assets/icons/firma.svg
├── frontend/public/assets/icons/info.svg
├── frontend/public/assets/icons/Learn.svg
├── frontend/public/assets/icons/Library.svg
├── frontend/public/assets/icons/Lock.svg
├── frontend/public/assets/icons/Logo.svg
├── frontend/public/assets/icons/metrics.svg
├── frontend/public/assets/icons/metronome.svg
├── frontend/public/assets/icons/next.svg
├── frontend/public/assets/icons/pause.svg
├── frontend/public/assets/icons/piano.svg
├── frontend/public/assets/icons/play.svg
├── frontend/public/assets/icons/play2.svg
├── frontend/public/assets/icons/stop.svg
├── frontend/public/assets/piano_virtual_88_pressed.svg
├── frontend/public/audio/
├── frontend/public/audio/piano/
├── frontend/public/audio/piano/manifest.json
├── frontend/scripts/
├── frontend/scripts/fetch-piano-samples.mjs
├── frontend/src/
├── frontend/src/app/
├── frontend/src/app/globals.css
├── frontend/src/app/layout.tsx
├── frontend/src/app/library/
├── frontend/src/app/library/page.tsx
├── frontend/src/app/page.module.css
├── frontend/src/app/page.tsx
├── frontend/src/app/practice/
├── frontend/src/app/practice/[sessionId]/
├── frontend/src/app/practice/[sessionId]/page.tsx
├── frontend/src/components/
├── frontend/src/components/AppFooter/
├── frontend/src/components/AppFooter/AppFooter.module.css
├── frontend/src/components/AppFooter/AppFooter.tsx
├── frontend/src/components/AppHeader/
├── frontend/src/components/AppHeader/AppHeader.module.css
├── frontend/src/components/AppHeader/AppHeader.tsx
├── frontend/src/components/AppHeader/AppHeader.types.ts
├── frontend/src/components/AppHeader/BrandLogo/
├── frontend/src/components/AppHeader/BrandLogo/BrandLogo.module.css
├── frontend/src/components/AppHeader/BrandLogo/BrandLogo.tsx
├── frontend/src/components/AppHeader/BrandLogo/BrandLogo.types.ts
├── frontend/src/components/AppHeader/MainNav/
├── frontend/src/components/AppHeader/MainNav/MainNav.module.css
├── frontend/src/components/AppHeader/MainNav/MainNav.tsx
├── frontend/src/components/AppHeader/MainNav/MainNav.types.ts
├── frontend/src/components/AppHeader/MidiStatus/
├── frontend/src/components/AppHeader/MidiStatus/MidiStatus.module.css
├── frontend/src/components/AppHeader/MidiStatus/MidiStatus.tsx
├── frontend/src/components/AppHeader/MidiStatus/MidiStatus.types.ts
├── frontend/src/components/AppHeader/UserAvatar/
├── frontend/src/components/AppHeader/UserAvatar/UserAvatar.module.css
├── frontend/src/components/AppHeader/UserAvatar/UserAvatar.tsx
├── frontend/src/components/AppHeader/UserAvatar/UserAvatar.types.ts
├── frontend/src/components/component-tree.test.ts
├── frontend/src/components/LibrarySection/
├── frontend/src/components/LibrarySection/LibraryPage/
├── frontend/src/components/LibrarySection/LibraryPage/LibraryPage.module.css
├── frontend/src/components/LibrarySection/LibraryPage/LibraryPage.tsx
├── frontend/src/components/LibrarySection/LibraryPage/LibraryPage.types.ts
├── frontend/src/components/LibrarySection/LibraryToolbar/
├── frontend/src/components/LibrarySection/LibraryToolbar/LibraryToolbar.module.css
├── frontend/src/components/LibrarySection/LibraryToolbar/LibraryToolbar.tsx
├── frontend/src/components/LibrarySection/LibraryToolbar/LibraryToolbar.types.ts
├── frontend/src/components/LibrarySection/SongDetailPanel/
├── frontend/src/components/LibrarySection/SongDetailPanel/SongDetailPanel.module.css
├── frontend/src/components/LibrarySection/SongDetailPanel/SongDetailPanel.tsx
├── frontend/src/components/LibrarySection/SongDetailPanel/SongDetailPanel.types.ts
├── frontend/src/components/LibrarySection/SongTable/
├── frontend/src/components/LibrarySection/SongTable/SongRow/
├── frontend/src/components/LibrarySection/SongTable/SongRow/SongRow.module.css
├── frontend/src/components/LibrarySection/SongTable/SongRow/SongRow.tsx
├── frontend/src/components/LibrarySection/SongTable/SongRow/SongRow.types.ts
├── frontend/src/components/LibrarySection/SongTable/SongTable.module.css
├── frontend/src/components/LibrarySection/SongTable/SongTable.tsx
├── frontend/src/components/LibrarySection/SongTable/SongTable.types.ts
├── frontend/src/components/LibrarySection/TablePagination/
├── frontend/src/components/LibrarySection/TablePagination/TablePagination.module.css
├── frontend/src/components/LibrarySection/TablePagination/TablePagination.tsx
├── frontend/src/components/LibrarySection/TablePagination/TablePagination.types.ts
├── frontend/src/components/MentorPanel/
├── frontend/src/components/MentorPanel/MentorChat/
├── frontend/src/components/MentorPanel/MentorChat/MentorChat.module.css
├── frontend/src/components/MentorPanel/MentorChat/MentorChat.tsx
├── frontend/src/components/MentorPanel/MentorChat/MentorChat.types.ts
├── frontend/src/components/MentorPanel/MentorPanel.module.css
├── frontend/src/components/MentorPanel/MentorPanel.tsx
├── frontend/src/components/MentorPanel/MentorPanel.types.ts
├── frontend/src/components/MentorPanel/ModeSelector/
├── frontend/src/components/MentorPanel/ModeSelector/ModeSelector.module.css
├── frontend/src/components/MentorPanel/ModeSelector/ModeSelector.tsx
├── frontend/src/components/MentorPanel/ModeSelector/ModeSelector.types.ts
├── frontend/src/components/MentorPanel/PerformanceStats/
├── frontend/src/components/MentorPanel/PerformanceStats/GaugeChart/
├── frontend/src/components/MentorPanel/PerformanceStats/GaugeChart/GaugeChart.module.css
├── frontend/src/components/MentorPanel/PerformanceStats/GaugeChart/GaugeChart.tsx
├── frontend/src/components/MentorPanel/PerformanceStats/GaugeChart/GaugeChart.types.ts
├── frontend/src/components/MentorPanel/PerformanceStats/PerformanceStats.module.css
├── frontend/src/components/MentorPanel/PerformanceStats/PerformanceStats.tsx
├── frontend/src/components/MentorPanel/PerformanceStats/PerformanceStats.types.ts
├── frontend/src/components/MidiUploader.tsx
├── frontend/src/components/PianoStage/
├── frontend/src/components/PianoStage/Keyboard/
├── frontend/src/components/PianoStage/Keyboard/Keyboard.module.css
├── frontend/src/components/PianoStage/Keyboard/Keyboard.tsx
├── frontend/src/components/PianoStage/Keyboard/Keyboard.types.ts
├── frontend/src/components/PianoStage/Keyboard/SvgKeyboard/
├── frontend/src/components/PianoStage/Keyboard/SvgKeyboard/PianoVirtual88Pressed.tsx
├── frontend/src/components/PianoStage/Keyboard/SvgKeyboard/SvgKeyboard.module.css
├── frontend/src/components/PianoStage/Keyboard/SvgKeyboard/SvgKeyboard.tsx
├── frontend/src/components/PianoStage/Keyboard/SvgKeyboard/SvgKeyboard.types.ts
├── frontend/src/components/PianoStage/NoteFallGrid/
├── frontend/src/components/PianoStage/NoteFallGrid/NoteFallGrid.module.css
├── frontend/src/components/PianoStage/NoteFallGrid/NoteFallGrid.tsx
├── frontend/src/components/PianoStage/NoteFallGrid/NoteFallGrid.types.ts
├── frontend/src/components/PianoStage/PianoStage.module.css
├── frontend/src/components/PianoStage/PianoStage.tsx
├── frontend/src/components/PianoStage/PianoStage.types.ts
├── frontend/src/components/PlaybackArea/
├── frontend/src/components/PlaybackArea/PlaybackArea.module.css
├── frontend/src/components/PlaybackArea/PlaybackArea.tsx
├── frontend/src/components/PlaybackArea/PlaybackArea.types.ts
├── frontend/src/components/PlayerBar/
├── frontend/src/components/PlayerBar/PlaybackControls/
├── frontend/src/components/PlayerBar/PlaybackControls/PlaybackControls.module.css
├── frontend/src/components/PlayerBar/PlaybackControls/PlaybackControls.tsx
├── frontend/src/components/PlayerBar/PlaybackControls/PlaybackControls.types.ts
├── frontend/src/components/PlayerBar/PlayerBar.module.css
├── frontend/src/components/PlayerBar/PlayerBar.tsx
├── frontend/src/components/PlayerBar/PlayerBar.types.ts
├── frontend/src/components/PlayerBar/ProgressBar/
├── frontend/src/components/PlayerBar/ProgressBar/ProgressBar.module.css
├── frontend/src/components/PlayerBar/ProgressBar/ProgressBar.tsx
├── frontend/src/components/PlayerBar/ProgressBar/ProgressBar.types.ts
├── frontend/src/components/PlayerBar/SongInfo/
├── frontend/src/components/PlayerBar/SongInfo/SongInfo.module.css
├── frontend/src/components/PlayerBar/SongInfo/SongInfo.tsx
├── frontend/src/components/PlayerBar/SongInfo/SongInfo.types.ts
├── frontend/src/components/PlayerBar/TempoMeasure/
├── frontend/src/components/PlayerBar/TempoMeasure/TempoMeasure.module.css
├── frontend/src/components/PlayerBar/TempoMeasure/TempoMeasure.tsx
├── frontend/src/components/PlayerBar/TempoMeasure/TempoMeasure.types.ts
├── frontend/src/components/SessionStatus.tsx
├── frontend/src/lib/
├── frontend/src/lib/.gitkeep
├── frontend/src/lib/api-client.test.ts
├── frontend/src/lib/api-client.ts
├── frontend/src/lib/audio-doubles.ts
├── frontend/src/lib/falling-notes.test.ts
├── frontend/src/lib/falling-notes.ts
├── frontend/src/lib/key-geometry.test.ts
├── frontend/src/lib/key-geometry.ts
├── frontend/src/lib/key-states.test.ts
├── frontend/src/lib/key-states.ts
├── frontend/src/lib/library-preview.test.ts
├── frontend/src/lib/library-preview.ts
├── frontend/src/lib/library.test.ts
├── frontend/src/lib/library.ts
├── frontend/src/lib/measures.test.ts
├── frontend/src/lib/measures.ts
├── frontend/src/lib/pc-keyboard.test.ts
├── frontend/src/lib/pc-keyboard.ts
├── frontend/src/lib/piano-model.test.ts
├── frontend/src/lib/piano-model.ts
├── frontend/src/lib/piano-samples.test.ts
├── frontend/src/lib/piano-samples.ts
├── frontend/src/lib/piece-store.test.ts
├── frontend/src/lib/piece-store.ts
├── frontend/src/lib/pitch.test.ts
├── frontend/src/lib/pitch.ts
├── frontend/src/lib/playback-engine.test.ts
├── frontend/src/lib/playback-engine.ts
├── frontend/src/lib/playback-schedule.test.ts
├── frontend/src/lib/playback-schedule.ts
├── frontend/src/lib/synth.test.ts
├── frontend/src/lib/synth.ts
├── frontend/src/lib/useComputerKeyboard.ts
├── frontend/src/lib/usePlayback.ts
├── frontend/src/lib/useResponsiveRange.ts
├── frontend/src/lib/useVisibleRange.ts
├── frontend/src/lib/visible-range-store.test.ts
├── frontend/src/lib/visible-range-store.ts
├── frontend/src/lib/visible-range.test.ts
├── frontend/src/lib/visible-range.ts
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
├── issues/B-004/
├── issues/B-004/B-004.1.md
├── issues/B-004/B-004.2.md
├── issues/B-004/B-004.3.md
├── issues/B-004/B-004.md
├── issues/B-005/
├── issues/B-005/B-005.1.md
├── issues/B-005/B-005.2.md
├── issues/B-005/B-005.3.md
├── issues/B-005/B-005.4.md
├── issues/B-005/B-005.md
├── issues/B-006/
├── issues/B-006/B-006.1.md
├── issues/B-006/B-006.2.md
├── issues/B-006/B-006.3.md
├── issues/B-006/B-006.4.md
├── issues/B-006/B-006.md
├── issues/B-007/
├── issues/B-007/B-007.1.md
├── issues/B-007/B-007.2.md
├── issues/B-007/B-007.3.md
├── issues/B-007/B-007.4.md
├── issues/B-007/B-007.5.md
├── issues/B-007/B-007.md
├── issues/B-008/
├── issues/B-008/B-008.1.md
├── issues/B-008/B-008.2.md
├── issues/B-008/B-008.3.md
├── issues/B-008/B-008.md
├── issues/B-009/
├── issues/B-009/B-009.1.md
├── issues/B-009/B-009.2.md
├── issues/B-009/B-009.3.md
├── issues/B-009/B-009.md
├── issues/B-012/
├── issues/B-012/B-012.1.md
├── issues/B-012/B-012.2.md
├── issues/B-012/B-012.3.md
├── issues/B-012/B-012.4.md
├── issues/B-012/B-012.5.md
├── issues/B-012/B-012.6.md
├── issues/B-012/B-012.7.md
├── issues/B-012/B-012.md
├── issues/B-027/
├── issues/B-027/B-027.1.md
├── issues/B-027/B-027.2.md
├── issues/B-027/B-027.3.md
├── issues/B-027/B-027.4.md
├── issues/B-027/B-027.md
├── issues/B-028/
├── issues/B-028/B-028.md
├── issues/B-029/
├── issues/B-029/B-029.md
├── issues/U-001/
├── issues/U-001/U-001.md
├── LICENSE
├── nota.txt
├── PLAN.md
├── README.md
├── shared/
├── shared/schemas/
├── shared/schemas/action.schema.json
├── THIRD_PARTY_NOTICES.md
```

## Anexo B — Contexto por archivo (`architecture/files.csv`)

| Ruta | Descripción | Contexto para el agente |
|---|---|---|
| `README.md` | Producto PianoMentor AI: visión, alcance del MVP, principios y mapa de documentos. | Leer antes de cualquier cambio de arquitectura o comportamiento. |
| `PLAN.md` | Cronograma y aceptación del MVP en 5 semanas: backlog, entregables semanales y Definition of Done. | Fuente de verdad de qué hacer y en qué orden; no describe estructura técnica. |
| `ARCHITECTURE.md` | Arquitectura generada: base manual + Anexo A (filetree real) + Anexo B (tabla de este CSV). | NO editar a mano; editar architecture_base.md o files.csv y regenerar. |
| `AGENTS.md` | Instrucciones persistentes del entorno: terminal PowerShell 7.6, UTF-8 sin BOM y reglas del proyecto. | Leer antes de crear o sobrescribir archivos desde herramientas. |
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
| `backend/scripts/build_midi_fixtures.py` | Genera los fixtures MIDI deterministas de backend/tests/fixtures/midi/ (una pista, multi-track, cambio de tempo, sin tempo y corrupto). | Regenerar fixtures de B-005.1 con python backend/scripts/build_midi_fixtures.py; no editar los .mid a mano. |
| `backend/scripts/describe_corpus_tracks.py` | Tabla regenerable de pistas y manos del corpus: notas, rango, mediana y mano por pista, y distancia entre medianas, solape de rangos y coincidencia con la mano izquierda de referencia por pieza. | Evidencia de B-009.2 que se regenera con python backend/scripts/describe_corpus_tracks.py; la referencia de mano izquierda está puesta a mano leyendo la partitura y el script avisa de las piezas sin referencia. |
| `backend/src/piano_mentor/__init__.py` | Marca el paquete Python piano_mentor. | Raíz de importaciones del backend. |
| `backend/src/piano_mentor/main.py` | Entrada FastAPI: crea app, configura CORS y registra el router. | Arranque del backend y endpoint /health. |
| `backend/src/piano_mentor/config.py` | Configuración tipada desde variables de entorno (Settings). | Centraliza puertos, CORS, rutas MIDI y base de datos. |
| `backend/src/piano_mentor/api.py` | Rutas HTTP y WebSocket del MVP (/pieces, /sessions, /actions, /agent-step, /ws). POST /pieces deduplica por SHA-256 (devuelve la pieza existente si el contenido ya estaba) e invoca inspect_file (B-005.4) para rellenar metadatos musicales, con 400 + limpieza si el MIDI es ilegible. GET /pieces/{id}/notes sirve la partitura con ventana por segundos (from_s/to_s) o por compases (from_measure/to_measure), la rejilla de compases (measures) y, con ?with_hands=true / ?with_chords=true, la mano por nota, el resumen tracks y los chords (B-009.3). GET /pieces lista el catálogo con filtro source=corpus\|upload (corpus primero, con portada), sembrándolo si la base está vacía (B-027.4), y POST /pieces/preview valida y lee un MIDI en memoria sin escribir en el almacén ni en la tabla pieces (B-027.3), con los mismos dos parámetros opcionales. | Traduce HTTP/WS a servicios; delgado, sin lógica musical compleja. Construye la rejilla una sola vez para resolver la ventana y servirla al front (B-008.2/B-008.3). preview es la única ruta de carga que no persiste: permite escuchar un MIDI a mano sin ensuciar el catálogo. La siembra perezosa del corpus (ensure_catalog_loaded) hace que un despliegue limpio no sirva la Library vacía. Los campos de B-009.3 son opcionales y se sirven con response_model_exclude_unset, así que sin pedirlos la respuesta es idéntica a la anterior; las manos se deciden sobre la pieza completa y los acordes sobre las notas devueltas. |
| `backend/src/piano_mentor/schemas.py` | Modelos Pydantic de peticiones y respuestas de la API; PieceResponse incluye source (corpus/upload) y deduplicated para la reutilización por hash, y PieceNotesResponse incluye la rejilla de compases PieceMeasures (count, starts_s, signatures, end_s), los opcionales tracks (TrackSummary: pista, mano, notas, canales, rango y mediana) y chords (ChordSummary: inicio y alturas) y NoteResponse.hand opcional (B-009.3); PieceSummary resume una pieza del catálogo para la lista de la Library (título, compositor, opus, dificultad, licencia, portada, source, duración, tempo, notas, tracks) y PiecePreviewResponse devuelve la partitura efímera de un MIDI a mano (sin piece_id, porque no se persiste) con los mismos campos opcionales. | Contrato tipado entre frontend y backend; el tipo Hand se importa del motor para que la mano tenga una única definición. |
| `backend/src/piano_mentor/validators.py` | Validación de uploads MIDI: nombre, extensión, tamaño y contenido. | Rechaza archivos inválidos antes de guardarlos. |
| `backend/src/piano_mentor/storage.py` | Guardado local de piezas MIDI en filesystem, con delete() para limpiar huérfanos y content_hash() (SHA-256) como base de la deduplicación. | Persistencia MVP de bytes MIDI; delete() lo usa B-005.4 para no dejar archivos huérfanos y content_hash() decide si una subida es nueva. |
| `backend/src/piano_mentor/midi.py` | Motor MIDI determinista: lectura de metadatos con Mido (tracks, tempo inicial, notas, duración y canales), mapa de tempo inmutable `TempoMap` que convierte ticks a segundos, nota normalizada `NormalizedNote` (pitch, inicio, duración, velocity, canal y pista en segundos), rejilla de compases inmutable `MeasureGrid` (inicios en ticks/segundos, firma por compás, measure_at/bounds_s/resolve_range), agrupación de notas simultáneas en acordes (`Chord` inmutable con ancla temporal y notas ordenadas de grave a agudo, y `group_chords(notes, tolerance_seconds)`), análisis de pistas (`hand_by_track`, `describe_tracks`, `TrackInfo` con notas, canales, rango, mediana y mano) y MidiService.resolve_measure_range/play_section. | Núcleo musical; no decide pedagogía ni responde HTTP. Errores con código estable vía MidiParseError; TempoMap y NormalizedNote son el contrato de tiempo y de nota, MeasureGrid el de compás, Chord el de acorde y Hand el de mano, para reproducción (B-006), compases (B-008), polifonía (B-009) y evaluación (B-013). group_chords es puro y determinista: tolerancia de 1 ms por defecto, borde incluido, un acorde puede cruzar canales y pistas y cada nota conserva velocity, canal y pista. hand_by_track también es puro: decide por mediana de alturas por pista (izquierda la más grave), deja unknown con una sola pista, con pistas intermedias o con empate, y no cambia la salida mezclada por defecto (decisión merge de B-009.2). |
| `backend/src/piano_mentor/evaluation.py` | Evaluador determinista: notas correctas, omitidas, extras, precisión y timing. | Mide la interpretación sin LLM ni UI. |
| `backend/src/piano_mentor/practice.py` | Casos de uso de sesión de práctica: crear sesión, estado y eventos. | Coordina pieza + interpretación + estado. |
| `backend/src/piano_mentor/agent.py` | Agente determinista: lista blanca y reglas de decisión (wait, give_hint, slow_down, demonstrate, accompany, return_control). | Fallback obligatorio sin LLM; nunca envía MIDI directo. |
| `backend/src/piano_mentor/database.py` | Conexión SQLite + sqlite-vec (DATABASE_URL), migraciones SQL versionadas, inserción de metadatos de piezas (incluye tracks, duration_s, notes_count y tempo desde B-005.4) y búsqueda por content_hash con prioridad del corpus (find_piece_by_hash). | Persistencia de piezas (B-003.2/B-003.3); reutilizable por B-012 y base de la deduplicación de subidas. |
| `backend/src/piano_mentor/migrations/0001_init_pieces.sql` | Migración inicial: tabla pieces con metadatos de carga y de catálogo (sin vectores todavía). | Esquema versionado de SQLite; piezas sin embedding hasta B-005/B-013. |
| `backend/src/piano_mentor/migrations/0002_add_tempo.sql` | Migración 0002: añade la columna tempo (REAL) a la tabla pieces. | Persistir el tempo inicial (BPM) que el motor ya calcula desde B-005.1. |
| `backend/src/piano_mentor/migrations/0003_add_hash_and_provenance.sql` | Migración 0003: añade content_hash (SHA-256), source ('corpus'/'upload') y owner_id (reservado, NULL = anónimo), con índice sobre el hash y clasificación de las filas existentes por midi_path. | Detección de duplicados y procedencia; owner_id prepara la futura issue de usuarios. |
| `backend/src/piano_mentor/catalog.py` | Carga idempotente de data/midi/catalog.json en pieces (upsert por id) con verificación previa de los MIDI referenciados; calcula content_hash y marca source='corpus' para que subir un MIDI idéntico reutilice el catálogo. ensure_catalog_loaded siembra el corpus cuando la tabla no tiene ninguna pieza suya (B-027.4). | CLI python -m piano_mentor.catalog para forzar la carga; GET /pieces llama a ensure_catalog_loaded, así que un arranque limpio ya sirve la Library. Un catálogo ausente o inválido se avisa por el log y no rompe el listado. B-003.3 no toca el formato del catálogo. |
| `backend/tests/test_health.py` | Verifica que la API arranca y /health responde. | Humo del backend. |
| `backend/tests/test_midi.py` | MIDI válido, inválido, metadatos (tracks, tempo, notas, duración, canales), conversión ticks→segundos con TempoMap y nota normalizada (emparejamiento, acordes, orden estable y notas sin cerrar). | Confianza en el parsing, el mapa de tempo y el normalizador. |
| `backend/tests/test_chords.py` | Agrupación en acordes (B-009.1): notas que empiezan juntas, detalle de cada nota (velocity, canal y pista), orden de grave a agudo, bordes de la tolerancia, arpegio que no se agrupa, determinismo e invariancia del corpus. | Confianza en el contrato de acorde que consumirán la evaluación y la UI; lee el catálogo para localizar las piezas reales. |
| `backend/tests/test_hands.py` | Etiquetado de manos (B-009.2): pista grave como izquierda, pista única, pistas intermedias y empate en unknown, independencia del orden de las pistas y del canal, canales de cada pista, merge por defecto y solape de rangos en las 15 piezas del corpus. | Confianza en que la mano sale de la altura de la pista y no del canal ni del orden; el corpus se normaliza una vez y queda en caché para que los tests sigan rápidos. |
| `backend/tests/test_evaluation.py` | Notas correctas, omitidas, adicionales y timing. | Confianza en el evaluador. |
| `backend/tests/test_agent.py` | Reglas, validación de acciones y devolución del control. | Confianza en el agente determinista. |
| `backend/tests/test_validators.py` | Extensión, tamaño, nombre y contenido de uploads. | Confianza en el rechazo de archivos malos. |
| `backend/tests/test_storage.py` | Guardado y recuperación local de piezas. | Confianza en el filesystem del MVP. |
| `backend/tests/test_piece_upload.py` | Integración del endpoint POST /pieces. | Contrato de carga extremo a extremo. |
| `backend/tests/test_piece_musical_metadata.py` | Integración del cable motor MIDI -> carga: metadatos reales en respuesta y BD, y MIDI ilegible rechazado sin huérfanos. | Confianza en B-005.4: inspect_file conectado a POST /pieces. |
| `backend/tests/test_piece_dedup.py` | Deduplicación por SHA-256 en POST /pieces: subida repetida devuelve la misma pieza sin archivo ni fila extra, contenido distinto crea pieza nueva y subida idéntica al corpus reutiliza la entrada del catálogo con su título. | Confianza en la detección de duplicados y en la procedencia corpus/upload. |
| `backend/tests/test_piece_notes.py` | Endpoint GET /pieces/{id}/notes de B-006.1: partitura ordenada y determinista, ventana from_s/to_s, 404 estable ante id inexistente y 400 ante MIDI ilegible o ventana inválida. | Confianza en el contrato de la partitura reproducible. |
| `backend/tests/test_piece_list.py` | Listado GET /pieces: corpus primero, filtro por source, campos del catálogo (portada, dificultad, licencia) y forma de la respuesta que consume la Library. | Confianza en el contrato del selector de piezas (B-027.3); aísla el storage en un temporal. |
| `backend/tests/test_piece_preview.py` | Subida efímera POST /pieces/preview: devuelve la partitura ordenada sin dejar fila en pieces ni archivo en el almacén, y rechaza extensión, contenido vacío e ilegible. | Confianza en que escuchar un MIDI a mano no ensucia el catálogo (B-027.3). |
| `backend/tests/test_piece_polyphony.py` | Contrato de acordes y manos de B-009.3 en /notes y /preview: sin los parámetros la respuesta trae exactamente las claves de antes, con with_hands llegan la mano por nota y el resumen de pistas (la ventana no vuelve unknown una sola mano) y con with_chords los acordes de las notas devueltas. | Confianza en que lo que ya sonaba no cambia y en que la información nueva es aditiva y opcional. |
| `backend/tests/test_piece_contract.py` | Contrato de metadatos de pieza del MVP. | Evita rupturas del formato de pieza. |
| `backend/tests/test_catalog.py` | Catálogo o listado base de piezas. | Orden y acceso a piezas de demo. |
| `backend/tests/test_database.py` | Conexión SQLite, carga de sqlite-vec, esquema pieces e idempotencia de migraciones. | Confianza en la persistencia de metadatos. |
| `backend/tests/conftest.py` | Fixture global que aísla la base de datos de cada test en un directorio temporal. | Evita escribir data/*.db durante pytest. |
| `backend/tests/test_piece_persistence.py` | Persistencia de POST /pieces: carga válida guardada, inválida sin escrituras y error de BD → 500. | Confianza en la persistencia del endpoint (B-003.2). |
| `backend/tests/test_catalog_load.py` | Carga del catálogo: 15 piezas, idempotencia, licencia/fuente y fallo si falta algún MIDI. | Confianza en el corpus cargado en SQLite (B-003.3). |
| `backend/tests/test_measure_grid.py` | Rejilla de compases (B-008.1): 4/4 por defecto, cambios de firma y de tempo, measure_at/bounds_s/signature_at y validaciones con código estable. | Confianza en el cálculo de compases del motor. |
| `backend/tests/test_measure_range.py` | Rango de compases a ventana temporal (B-008.2/B-008.3): resolve_range y validaciones, endpoint /notes con from_measure/to_measure y la rejilla measures servida (con cambio de firma 3/4 -> 4/4). | Confianza en la reproducción por tramos y en la rejilla que consume el PlayerBar. |
| `frontend/Dockerfile` | Imagen reproducible del frontend Next.js. | Servir la UI en local y base del despliegue en Vercel. |
| `frontend/package.json` | Dependencias y scripts del frontend (Next.js, TypeScript). | Instalar y arrancar la web. |
| `frontend/next.config.ts` | Configuración de Next.js. | Ajustes de build y runtime web. |
| `frontend/tsconfig.json` | Configuración del compilador TypeScript, versionada desde B-027.3 con el alias @/* -> ./src/*. | Tipos estrictos en el frontend. Está en git a propósito: si se ignora, cada clon queda sin paths y los imports con @/ no resuelven. next-env.d.ts y *.tsbuildinfo siguen ignorados. |
| `frontend/AGENTS.md` | Aviso que next dev escribe y reescribe para agentes (bloque nextjs-agent-rules): leer los docs de la versión instalada antes de tocar código. | Mantenido por Next; borrarlo solo recrea el cambio sin commitear, así que se versiona tal cual. |
| `frontend/src/app/layout.tsx` | Layout global de la aplicación web. | Envoltorio común de páginas. |
| `frontend/src/app/page.tsx` | Página inicial: armazón AppHeader + PlaybackArea (reproductor y piano) + MentorPanel. | Sigue siendo Server Component: el transporte vive en PlaybackArea y no arrastra el resto al bundle de cliente (B-007.3). |
| `frontend/src/app/globals.css` | Estilos globales de la aplicación. | Base visual de la web. |
| `frontend/src/app/practice/[sessionId]/page.tsx` | Página de una sesión de práctica concreta. | Vista de tocar, evaluar y ver al agente. |
| `frontend/src/app/library/page.tsx` | Ruta /library (Server Component): AppHeader con active='library' + LibraryPage + AppFooter. | B-027.3; el catálogo y el transporte de preview viven en LibraryPage (cliente). |
| `frontend/src/components/MidiUploader.tsx` | Selector de un MIDI a mano: valida en cliente, lo manda a POST /pieces/preview (efímero) y publica la partitura en piece-store para que suene en el piano, sin guardarla. | B-027.3; vive en el MentorPanel (Learn) y en SongDetailPanel (Library). Si no estamos en /, navega al piano tras cargarla; la subida persistente (uploadPiece) se conserva sin uso. |
| `frontend/src/components/SessionStatus.tsx` | Estado actual: tempo, compás y quién controla el piano. | Hace visible practicing/waiting/demonstrating. |
| `frontend/src/components/PracticeSession.tsx` | Vista principal de práctica (se incorpora con B-012). | Composición de teclado + estado + controles. |
| `frontend/src/lib/api-client.ts` | Cliente HTTP tipado hacia FastAPI con tipos de los contratos Pydantic (PieceResponse con source y deduplicated; PieceNotesResponse con la rejilla PieceMeasures y los opcionales tracks/chords y PlayableNote.hand de B-009.3; PieceCatalogItem para la lista del catálogo) y errores ApiError con código estable. Expone previewPiece (POST /pieces/preview, efímero), getPieceList (GET /pieces?source=corpus\|upload), getPieceNotes (con opciones withHands/withChords) y uploadPiece (conservado sin uso). | Único punto de llamadas REST desde componentes; usado por B-004 y reutilizado por B-012. La subida persistente se conserva a propósito, aunque hoy la interfaz use previewPiece. Los campos de B-009.3 son opcionales en los tipos y no los pide ningún componente todavía: el uso visible (manos, acordes) es de B-012. |
| `frontend/src/lib/api-client.test.ts` | Tests del cliente HTTP con fetch simulado: éxito, error 400 del backend, caída del servicio, rejilla de compases en la respuesta de notas y los parámetros opcionales with_hands/with_chords de B-009.3 (con ellos y sin ellos). | Criterio de B-004.3; se ejecutan con `npm run test` (Vitest). |
| `frontend/src/lib/playback-schedule.ts` | Matemática pura de reproducción (B-006.2): schedule ordenado con factor de tempo, ventana de eventos, pitch a Hz y recortes. | Sin DOM ni AudioContext; testeable con números, la ejecuta el motor de transporte. |
| `frontend/src/lib/playback-engine.ts` | Motor de transporte sin framework (B-006.2): play/pausa/stop/seek y tempo con reloj y voz de audio inyectados. | Determinista con tiempo falso en tests; usePlayback lo viste con React+WebAudio. |
| `frontend/src/lib/usePlayback.ts` | Hook React del transporte (B-006.2): snapshot, notas, rejilla de compases (measures), acciones, audición y getPosition (posición viva sin pasar por estado de React). | Capa fina sobre PlaybackEngine; en B-007.5 crea el sampler de muestras con su voz de reserva y la cadena master → limitador. getPosition lo consume la cascada de B-007.3 y measures lo consume el compás actual de B-008.3. |
| `frontend/src/lib/synth.ts` | Voz aditiva de reserva (senos con inarmonicidad y envolvente percusiva) compartida por transporte y audición. | B-007.5; suena mientras no hay muestra decodificada y si una falla. Contrato PolySynth intacto; polifonía limitada a 24 voces robando la más vieja. |
| `frontend/src/lib/pc-keyboard.ts` | Mapa tecla del PC → pitch por e.code (dos filas + flechas de octava, velocity fija). | B-007.2; puro, independiente del layout del teclado. |
| `frontend/src/lib/pc-keyboard.test.ts` | Tests del mapa de teclado: filas, octavas, layout y límites del piano. | Criterio de B-007.2; se ejecutan con `npm run test` (Vitest). |
| `frontend/src/lib/useComputerKeyboard.ts` | Hook que captura keydown/keyup (ignora repeticiones y focos de escritura). | B-007.2; emite eventos que B-013 evaluará. |
| `frontend/src/lib/key-states.ts` | Ids de teclas sonando y esperada desde schedule y posición; exporta HORIZON_S (2 s) como horizonte compartido. | B-007.2; puro y testeable, sin DOM. La cascada usa el mismo horizonte para que la nota llegue justo cuando la tecla se enciende. |
| `frontend/src/lib/key-states.test.ts` | Tests de sonando/esperada con schedule falso. | Criterio de B-007.2; se ejecutan con `npm run test` (Vitest). |
| `frontend/src/lib/falling-notes.ts` | Notas de la cascada visibles en la ventana de caída y su progreso 0 a 1, derivado de la posición del transporte. | B-007.3; puro y sin DOM: sin reloj propio, así que pausar congela y el factor de tempo escala la caída. |
| `frontend/src/lib/falling-notes.test.ts` | Tests de la cascada con reloj falso: llega al teclado justo cuando suena, ventana exacta, pausa que no mueve y escala por tempo. | Criterio de B-007.3; se ejecutan con npm run test (Vitest). |
| `frontend/src/lib/key-geometry.ts` | Geometría horizontal del teclado: centro y ancho de cada tecla como fracción del contenedor, del asset uniforme (blanca cada 40 u). | B-007.3; usado por NoteFallGrid para alinear líneas y bloques con las teclas; SvgKeyboard deja 8 u de margen al recortar el viewBox. |
| `frontend/src/lib/key-geometry.test.ts` | Tests de la geometría contra el asset real: centros de las 88 teclas, anchos, inset y recuento de blancas. | Criterio de B-007.3; si cambia el SVG de diseño, el barrido falla y avisa. |
| `frontend/src/lib/playback-schedule.test.ts` | Tests de la matemática de reproducción: escala por factor, orden estable, ventana, pitch y recortes. | Criterio de B-006.2; se ejecutan con `npm run test` (Vitest). |
| `frontend/src/lib/playback-engine.test.ts` | Tests del motor de transporte con reloj falso y voz que graba: programación, pausa, seek, fin y tempo. | Criterio de B-006.2; se ejecutan con `npm run test` (Vitest). |
| `frontend/src/lib/measures.ts` | Compás actual a partir de la rejilla y la posición del transporte: measureIndexAt (búsqueda binaria sobre starts_s) y formateo de compás y firma. | B-008.3; puro y sin DOM. La posición va escalada por el factor, así que compara position_s × factor con los inicios originales, igual que buildSchedule y la cascada. |
| `frontend/src/lib/measures.test.ts` | Tests del compás actual con reloj falso: borde de compás, pausa que no avanza, factor de tempo, recorte en extremos y formato con indicador vacío. | Criterio de B-008.3; se ejecutan con `npm run test` (Vitest). |
| `frontend/src/lib/library.ts` | Adapta el catálogo de la API al modelo de la Library (Song con título, compositor, iniciales, portada, dificultad, BPM, duración formateada y en segundos) y resuelve la vista de forma pura: toSong(s), initialsFromTitle, formatDuration, paginate, matchesFilters (búsqueda, estado, dificultad, duración y tempo) y sortSongs (título, compositor, dificultad y duración). | B-027.3/B-027.4; lógica pura y testeable, los componentes solo pintan y la barra solo cambia LibraryFilters/SortKey. bestScore, status, timing y notes quedan a null hasta que existan evaluaciones (B-012/B-014). |
| `frontend/src/lib/library.test.ts` | Tests de la adaptación del catálogo: iniciales, duración formateada, dificultad traducida, portada, valores por defecto, paginación y recorte de página. | Criterio de B-027.3; se ejecutan con `npm run test` (Vitest). |
| `frontend/src/lib/library-preview.ts` | Lógica pura del play por fila de la Library: previewStep(loadedId, songId, status) decide start, pause o resume comparando la pieza cargada con la pulsada. | B-027.3; sin pieza, otra pieza o una terminada arrancan desde el principio; la misma pieza pausada se reanuda. |
| `frontend/src/lib/library-preview.test.ts` | Tests de la decisión del preview: sin pieza, otra pieza, pausar la que suena, reanudar la pausada y reiniciar la terminada. | Criterio de B-027.3; se ejecutan con `npm run test` (Vitest). |
| `frontend/src/lib/piece-store.ts` | Almacén en memoria de la pieza que debe sonar en el piano: PianoPiece = subida a mano (partitura completa) o pieza del catálogo (id + título, cuyas notas pide el piano al backend), con autoPlay opcional. Expone publishPianoPiece, getPianoPiece y subscribePianoPiece. | B-027.3; mismo patrón que visible-range-store (useSyncExternalStore). El subidor y la Library publican, PlaybackArea se suscribe. Al recargar se pierde y vuelve la demo, porque nada se persiste. |
| `frontend/src/lib/piece-store.test.ts` | Tests del almacén: arranque sin pieza, notificación al publicar subida o catálogo, vuelta a la demo con null, silencio si la pieza es la vigente y baja de suscriptores. | Criterio de B-027.3; se ejecutan con `npm run test` (Vitest). |
| `frontend/src/lib/websocket-client.ts` | Cliente WebSocket de sesión en tiempo real (se incorpora con B-012). | Actualizaciones de estado de práctica. |
| `data/midi/.gitkeep` | Mantiene la carpeta de MIDI de demo en git. | Piezas de prueba con licencia compatible. |
| `data/midi/catalog.json` | Catálogo versionado de las 15 piezas del corpus: título, compositor, opus, licencia, source_url, dificultad y métricas. | Metadatos cargados por B-003.3; su formato lo define B-027.2 y no lo toca el backend. |
| `data/uploads/.gitkeep` | Mantiene la carpeta de uploads locales en git. | MIDI subidos durante el desarrollo (privados). |
| `data/sessions/.gitkeep` | Mantiene la carpeta de sesiones locales en git. | Datos temporales o exportaciones de sesión. |
| `shared/schemas/action.schema.json` | Contrato JSON de acciones permitidas del agente. | Valida wait/give_hint/slow_down/demonstrate/accompany/return_control. |
| `docs/GETTING_STARTED.md` | Guía reproducible de instalación, arranque y validación local. | Primer arranque del proyecto. |
| `docs/TROUBLESHOOTING.md` | Bitácora viva de problemas, diagnóstico y soluciones. | Consultar ante fallos conocidos. |
| `issues/B-001/B-001.md` | Resumen y aceptación de la Issue B-001 (estructura monorepo). | alcance de la issue principal; detalle en B-001.N.md. |
| `issues/B-002/B-002.md` | Resumen y aceptación de la Issue B-002 (contrato y almacenamiento de piezas). | Contrato base de piezas MIDI. |
| `issues/B-003/B-003.md` | Resumen y aceptación de la Issue B-003 (carga MIDI con SQLite + sqlite-vec). | Persistencia MVP de piezas y vectores. |
| `issues/B-005/B-005.md` | Resumen y aceptación de la Issue B-005 (normalizar notas MIDI): parsing, TempoMap, normalizador y metadatos en la carga. | Contrato musical determinista; detalle en B-005.N.md. |
| `issues/B-006/B-006.md` | Resumen y aceptación de la Issue B-006 (reproducción básica): API de notas, reloj en el navegador, tempo y base de componentes del front. | Transporte play/pausa/stop sin estado en el servidor; detalle en B-006.N.md. |
| `issues/B-007/B-007.md` | Resumen y aceptación de la Issue B-007 (piano virtual básico): teclado SVG, resaltado sonando/esperada y cascada sincronizada. | Solo visualización, sin entrada de usuario; detalle en B-007.N.md. |
| `.agents/skills/piano-mentor-ai-development/SKILL.md` | Skill de desarrollo: separación determinista/API/UI/agente, contratos y checklist. | Cargar al modificar MIDI, evaluación, frontend o agente. |
| `.agents/skills/piano-mentor-github-projects/SKILL.md` | Skill de GitHub Projects: importar issues, sincronizar Priority/Target date y respaldar. | Cargar al operar backlog e issues B-xxx. |
| `.github_projects/README.md` | Guía del flujo de GitHub Projects: importar issues, sincronizar campos, exportar respaldo y convenciones del backlog. | Leer antes de operar el backlog; los scripts están en .github_projects/scripts/. |
| `.github_projects/project-backlog.csv` | Backlog operativo: ID, título, descripción, prioridad, semana, área, riesgo, tamaño, estado y dependencias de cada tarea. | Fuente que consumen import-github-issues.ps1 y sync-github-project.ps1; mantener coherente con PLAN.md. |
| `.github_projects/project-backup.json` | Respaldo exportado del Project de GitHub con campos y valores reales, incluido el Status por issue. | Generado por export-github-project.ps1; ejecutarlo antes de analizar cambios del Project. |
| `.github_projects/scripts/export-github-project.ps1` | Exporta el Project a project-backup.json (o a una instantánea fechada) con campos y elementos. | Paso de respaldo del flujo; nunca imprime tokens. |
| `.github_projects/scripts/import-github-issues.ps1` | Crea o reutiliza las Issues del backlog (busca por [B-xxx]), usa issues/B-xxx/B-xxx.md como cuerpo, las añade al Project y sincroniza campos. | Paso 1-2; -Preview valida el CSV sin tocar GitHub y omite tareas sin documento local. |
| `.github_projects/scripts/create-github-subissues.ps1` | Crea o reutiliza las Sub-issues de una Issue padre desde issues/B-xxx/B-xxx.N.md, las vincula con --parent y las añade al Project. | Paso 3; -Preview y -SkipProject evitan llamar a GitHub o al Project. |
| `.github_projects/scripts/sync-github-project.ps1` | Sincroniza solo Priority y Target date de los elementos del Project. | Paso 4; no toca Status, Start date ni sub-issues, y -Preview muestra los cambios sin aplicarlos. |
| `.agents/skills/piano-mentor-architecture/SKILL.md` | Skill de arquitectura: regenerar ARCHITECTURE.md desde base + CSV + filetree. | Cargar al documentar archivos o estructura; ejecuta el script. |
| `desing/main_page.ai` | Diseño en Illustrator de la main page del frontend (referencia visual, no asset compilado). | Fuente de diseño de la página inicial; implementar en Next.js según este diseño. |
| `desing/main_page_box.jpg` | Cajas de referencia de la main page (encabezado, controles, piano virtual, lateral del mentor y zona de subida) usadas para derivar el árbol de componentes. | Fuente estructural de B-006.4; el estilo final lo marca main_page_desing.jpg. |
| `desing/main_page_desing.jpg` | Render estilizado de referencia de la main page (cabecera, player, piano C1–C6 y panel del mentor). | Solo idea visual para B-006.4; simplicidad primero, el CSS full vendrá después. En código el rótulo se escribe 'Progress' (el diseño pone 'Progess'). |
| `frontend/public/assets/piano_virtual_88_pressed.svg` | Piano virtual de 88 teclas en SVG con ids por tecla y estados de tecla presionada. | Asset del teclado virtual; SVGR lo convierte en el componente inline. Vive en public/ para poder servirse también por HTTP. |
| `frontend/src/app/page.module.css` | Layout de dos columnas de la página inicial (zona principal + lateral). | B-006.4; la regla .main pasó a PlaybackArea.module.css con B-007.3. |
| `frontend/src/components/AppHeader/AppHeader.tsx` | Encabezado principal: compone logo, navegación, estado MIDI y avatar. | B-006.4; armazón estático. |
| `frontend/src/components/AppHeader/AppHeader.module.css` | Estilos del encabezado principal. | B-006.4; simplicidad primero. |
| `frontend/src/components/AppHeader/AppHeader.types.ts` | Props del encabezado (midiConnected, userInitial, active). | B-006.4; active (NavSection) permite resaltar Learn o Library según la ruta (B-027.3). |
| `frontend/src/components/AppHeader/BrandLogo/BrandLogo.tsx` | Logo de marca con barras de piano y nombre. | B-006.4; armazón estático. |
| `frontend/src/components/AppHeader/BrandLogo/BrandLogo.module.css` | Estilos del logo de marca. | B-006.4; simplicidad primero. |
| `frontend/src/components/AppHeader/BrandLogo/BrandLogo.types.ts` | Props del logo (brandName). | B-006.4. |
| `frontend/src/components/AppHeader/MainNav/MainNav.tsx` | Navegación principal: Learn y Library son enlaces reales (next/link) a / y /library; Progress y Settings siguen deshabilitadas. | B-006.4/B-027.3; resalta la sección activa que llega por props. En código 'Progress' (el diseño pone 'Progess'). |
| `frontend/src/components/AppHeader/MainNav/MainNav.module.css` | Estilos de la navegación principal. | B-006.4; simplicidad primero. |
| `frontend/src/components/AppHeader/MainNav/MainNav.types.ts` | Props de navegación (active) y tipo NavSection ('learn' \| 'library') que comparten AppHeader y MainNav. | B-006.4/B-027.3. |
| `frontend/src/components/AppHeader/MidiStatus/MidiStatus.tsx` | Indicador de estado del teclado MIDI. | B-006.4; la detección Web MIDI real es posterior. |
| `frontend/src/components/AppHeader/MidiStatus/MidiStatus.module.css` | Estilos del indicador MIDI. | B-006.4; simplicidad primero. |
| `frontend/src/components/AppHeader/MidiStatus/MidiStatus.types.ts` | Props del indicador (connected). | B-006.4. |
| `frontend/src/components/AppHeader/UserAvatar/UserAvatar.tsx` | Avatar de usuario con inicial. | B-006.4; sin autenticación todavía (B-029). |
| `frontend/src/components/AppHeader/UserAvatar/UserAvatar.module.css` | Estilos del avatar. | B-006.4; simplicidad primero. |
| `frontend/src/components/AppHeader/UserAvatar/UserAvatar.types.ts` | Props del avatar (initial). | B-006.4. |
| `frontend/src/components/AppFooter/AppFooter.tsx` | Pie de página: logo enlazado, aviso de copyright con el año actual y enlace al GitHub del autor. | Cierra las páginas; hoy lo montan la página inicial y /library. |
| `frontend/src/components/AppFooter/AppFooter.module.css` | Estilos del pie de página. | Simplicidad primero. |
| `frontend/src/components/PlaybackArea/PlaybackArea.tsx` | Columna principal: nace el transporte (usePlayback) y decide qué suena, por este orden: la pieza publicada en el almacén (subida a mano, o pieza del catálogo elegida en la Library, que pide sus notas al backend), o la demo p01. Reparte player a PlayerBar y PianoStage. | B-007.3/B-027.3; client component para no arrastrar AppHeader ni MentorPanel al bundle de cliente (page.tsx sigue siendo servidor). Si la pieza llega con autoPlay, arranca sola al cargarla. |
| `frontend/src/components/PlaybackArea/PlaybackArea.module.css` | Estilos de la columna principal (reproductor + piano). | B-007.3; la regla .main baja aquí desde page.module.css. |
| `frontend/src/components/PlaybackArea/PlaybackArea.types.ts` | Props de la columna (octaves, reenviadas a PianoStage). | B-007.3. |
| `frontend/src/components/PlayerBar/PlayerBar.tsx` | Franja del reproductor cableada al transporte: play/pausa (botón único que alterna ▶/⏸), parar, Atrás al inicio, Adelante +5 s, tempo real, compás actual real (derivado de la rejilla con measureIndexAt) y progreso redondeado. | B-007.3/B-008.3/B-027.3; B-006.4 la dejó solo HTML/CSS. El título llega por props (nombre del archivo subido o título del catálogo) y solo cae al marcador cuando suena la demo. |
| `frontend/src/components/PlayerBar/PlayerBar.module.css` | Estilos de la franja del reproductor. | B-006.4; simplicidad primero. |
| `frontend/src/components/PlayerBar/PlayerBar.types.ts` | Props de la franja (player, título, arreglo); el compás ya no es una prop, se deriva del transporte. | B-007.3/B-008.3; tempo, compás y progreso se derivan del transporte, no se pasan por props. |
| `frontend/src/components/PlayerBar/SongInfo/SongInfo.tsx` | Portada y título de la pieza en reproducción. | B-006.4; armazón estático. |
| `frontend/src/components/PlayerBar/SongInfo/SongInfo.module.css` | Estilos de la información de la pieza. | B-006.4; simplicidad primero. |
| `frontend/src/components/PlayerBar/SongInfo/SongInfo.types.ts` | Props de información (title, subtitle). | B-006.4. |
| `frontend/src/components/PlayerBar/PlaybackControls/PlaybackControls.tsx` | Botones de transporte: reenvían callbacks sin lógica propia; el play alterna entre ▶ y ⏸ según isPlaying. | B-006.4; cableados desde PlayerBar al transporte con B-007.3. |
| `frontend/src/components/PlayerBar/PlaybackControls/PlaybackControls.module.css` | Estilos de los botones de transporte. | B-006.4; simplicidad primero. |
| `frontend/src/components/PlayerBar/PlaybackControls/PlaybackControls.types.ts` | Callbacks de transporte (onRewind/onTogglePlay/onStop/onForward) e isPlaying. | B-006.4; ya enchufados al usePlayback de B-006.2. |
| `frontend/src/components/PlayerBar/TempoMeasure/TempoMeasure.tsx` | Tempo efectivo, compás actual/total y firma en reproducción, con indicador vacío (—) cuando falta el dato. | B-008.3; el tempo es real (BPM × factor) desde B-007.3 y el compás real desde B-008.3, sin valores inventados. |
| `frontend/src/components/PlayerBar/TempoMeasure/TempoMeasure.module.css` | Estilos de tempo y compás. | B-006.4; simplicidad primero. |
| `frontend/src/components/PlayerBar/TempoMeasure/TempoMeasure.types.ts` | Props de tempo, compás actual/total y firma (tempoBpm, measure, measureCount, signature). | B-008.3; sin datos se muestra indicador vacío, nunca un valor inventado. |
| `frontend/src/components/PlayerBar/ProgressBar/ProgressBar.tsx` | Barra de progreso con porcentaje y rol progressbar. | B-006.4; recibe el porcentaje ya redondeado que calcula PlayerBar. |
| `frontend/src/components/PlayerBar/ProgressBar/ProgressBar.module.css` | Estilos de la barra de progreso. | B-006.4; simplicidad primero. |
| `frontend/src/components/PlayerBar/ProgressBar/ProgressBar.types.ts` | Props de progreso (value 0–100). | B-006.4. |
| `frontend/src/components/PianoStage/PianoStage.tsx` | Vista del escenario: deriva el schedule del transporte y lo reparte a la cuadrícula y al teclado. | B-007.3; el transporte nace en PlaybackArea y llega por props. |
| `frontend/src/components/PianoStage/PianoStage.module.css` | Estilos del contenedor del piano. | B-006.4; simplicidad primero. |
| `frontend/src/components/PianoStage/PianoStage.types.ts` | Props del escenario (player, octaves). | B-007.3. |
| `frontend/src/components/PianoStage/NoteFallGrid/NoteFallGrid.tsx` | Cuadrícula con las notas cayendo: una columna por tecla blanca visible y bloques movidos por un rAF local, sin re-render por frame. | B-007.3; alinea líneas y bloques con key-geometry (desfase residual 0.15 px), se congela en pausa y se limpia en stop. |
| `frontend/src/components/PianoStage/NoteFallGrid/NoteFallGrid.module.css` | Estilos de la cuadrícula: líneas verticales por tecla, carriles horizontales fijos y capa de bloques que recorta lo que aún no ha entrado. | B-007.3; simplicidad primero. |
| `frontend/src/components/PianoStage/NoteFallGrid/NoteFallGrid.types.ts` | Props de la cuadrícula (octaves, schedule, status, horizon_s, getPosition). | B-007.3; el rango no llega por props sino del almacén compartido. |
| `frontend/src/components/PianoStage/Keyboard/Keyboard.tsx` | Teclado del escenario: resaltado sonando/esperada derivado del schedule y teclado del PC; recibe el transporte por props y pinta el SvgKeyboard real. | B-007.4 jubiló el PianoKeyboard temporal: sin vía de inyección, el teclado SVG es el único render. |
| `frontend/src/components/PianoStage/Keyboard/Keyboard.module.css` | Estilos del envoltorio del teclado. | B-006.4; simplicidad primero. |
| `frontend/src/components/PianoStage/Keyboard/Keyboard.types.ts` | Props del teclado (player, schedule). | B-007.4; se retiró children al eliminar el placeholder. |
| `frontend/src/components/MentorPanel/MentorPanel.tsx` | Columna del mentor: chat, modos, rendimiento y flujo existente reubicado. | B-006.4; reutiliza MidiUploader y SessionStatus sin modificarlos. |
| `frontend/src/components/MentorPanel/MentorPanel.module.css` | Estilos de la columna del mentor. | B-006.4; simplicidad primero. |
| `frontend/src/components/MentorPanel/MentorPanel.types.ts` | Props del panel (weakPoint). | B-006.4. |
| `frontend/src/components/MentorPanel/MentorChat/MentorChat.tsx` | Chat del mentor: avatar, burbuja de ejemplo e input de placeholder. | B-006.4; el chat real con el agente llega después. |
| `frontend/src/components/MentorPanel/MentorChat/MentorChat.module.css` | Estilos del chat del mentor. | B-006.4; simplicidad primero. |
| `frontend/src/components/MentorPanel/MentorChat/MentorChat.types.ts` | Props del chat (exampleMessage). | B-006.4. |
| `frontend/src/components/MentorPanel/ModeSelector/ModeSelector.tsx` | Selector de modo: Observar activo, Duo y Tomar Control. | B-006.4; armazón estático. |
| `frontend/src/components/MentorPanel/ModeSelector/ModeSelector.module.css` | Estilos del selector de modo. | B-006.4; simplicidad primero. |
| `frontend/src/components/MentorPanel/ModeSelector/ModeSelector.types.ts` | Modo del mentor (MentorMode) y prop mode. | B-006.4. |
| `frontend/src/components/MentorPanel/PerformanceStats/PerformanceStats.tsx` | Rendimiento del pasaje: dos medidores y punto débil. | B-006.4; valores reales en B-013. |
| `frontend/src/components/MentorPanel/PerformanceStats/PerformanceStats.module.css` | Estilos de las estadísticas. | B-006.4; simplicidad primero. |
| `frontend/src/components/MentorPanel/PerformanceStats/PerformanceStats.types.ts` | Props de estadísticas (timing, notes, weakPoint). | B-006.4. |
| `frontend/src/components/MentorPanel/PerformanceStats/GaugeChart/GaugeChart.tsx` | Medidor circular reutilizable en SVG puro. | B-006.4; armazón estático. |
| `frontend/src/components/MentorPanel/PerformanceStats/GaugeChart/GaugeChart.module.css` | Estilos del medidor circular. | B-006.4; simplicidad primero. |
| `frontend/src/components/MentorPanel/PerformanceStats/GaugeChart/GaugeChart.types.ts` | Props del medidor (value, label). | B-006.4. |
| `frontend/src/components/component-tree.test.ts` | Humo del árbol de componentes: los 20 existen y son funciones. | Criterio de B-006.4; no renderiza (sin DOM en los tests). Incluye PlaybackArea desde B-007.3. Los componentes de la Library (B-027.3) aún no entran en el humo. |
| `frontend/src/components/LibrarySection/LibraryPage/LibraryPage.tsx` | Página de la Library (cliente): pide el corpus con getPieceList('corpus'), filtra y ordena la tabla (LibraryFilters + SortKey) con la lógica pura de library.ts, pagina y guarda la pieza seleccionada. Además es dueña del transporte de preview, así que reproduce la fila pulsada sin salir de la lista. | B-027.3/B-027.4; cambiar cualquier filtro o el orden vuelve a la primera página. La decisión del play por fila vive en src/lib/library-preview.ts y las partituras del preview se cachean en memoria mientras dura la visita. |
| `frontend/src/components/LibrarySection/LibraryPage/LibraryPage.module.css` | Estilos de la página de la Library (rejilla de contenido y panel de detalle). | B-027.3; simplicidad primero. |
| `frontend/src/components/LibrarySection/LibraryPage/LibraryPage.types.ts` | Tipos de la Library reexportados de src/lib/library.ts (Song, Difficulty, SongStatus, SongFilter, LibraryFilters, SortKey, DifficultyFilter, DurationFilter, TempoFilter) y PreviewState (id cargado, si suena y qué se está cargando). | B-027.3/B-027.4; los componentes de la sección importan de aquí, no de src/lib. |
| `frontend/src/components/LibrarySection/LibraryToolbar/LibraryToolbar.tsx` | Barra de la Library: búsqueda por canción o compositor, filtro por estado (Todas / En progreso / Dominadas) y desplegables de dificultad, duración, tempo y orden; los desplegables se resaltan cuando tienen un filtro activo. | B-027.3/B-027.4; solo cambia LibraryFilters/SortKey, el filtrado y el orden viven en library.ts. El filtro por estado real solo se llenará con las evaluaciones (B-012/B-014). |
| `frontend/src/components/LibrarySection/LibraryToolbar/LibraryToolbar.module.css` | Estilos de la barra de búsqueda y filtros. | B-027.3; simplicidad primero. |
| `frontend/src/components/LibrarySection/LibraryToolbar/LibraryToolbar.types.ts` | Props de la barra (filters, sort y sus callbacks onFiltersChange/onSortChange) y las opciones de cada desplegable (STATUS_OPTIONS, DIFFICULTY_OPTIONS, DURATION_OPTIONS, TEMPO_OPTIONS, SORT_OPTIONS). | B-027.3/B-027.4. |
| `frontend/src/components/LibrarySection/SongTable/SongTable.tsx` | Tabla de piezas: cabecera de columnas y una fila por canción, con aviso cuando no hay coincidencias. | B-027.3; recibe el estado del preview y lo reparte a cada fila. |
| `frontend/src/components/LibrarySection/SongTable/SongTable.module.css` | Estilos de la tabla (scroll horizontal y estado vacío). | B-027.3; simplicidad primero. |
| `frontend/src/components/LibrarySection/SongTable/SongTable.types.ts` | Props de la tabla (songs, selectedId, onSelect, preview, onPlay). | B-027.3. |
| `frontend/src/components/LibrarySection/SongTable/SongRow/SongRow.tsx` | Fila de la tabla: índice, portada y título (que selecciona), compositor, dificultad, duración, tempo, mejor puntaje, estado y el botón de play/pausa que hace sonar la pieza en la lista. | B-027.3; el botón alterna play/pausa (aria-pressed), avisa por aria-label del título y se deshabilita mientras se pide esa partitura. Las métricas de rendimiento siguen vacías hasta B-012/B-014. |
| `frontend/src/components/LibrarySection/SongTable/SongRow/SongRow.module.css` | Estilos de la fila: selección, chips de dificultad, barra de puntaje, estado y botón de reproducción en dorado mientras suena. | B-027.3; simplicidad primero. |
| `frontend/src/components/LibrarySection/SongTable/SongRow/SongRow.types.ts` | Props de la fila (song, index, selected, preview, onSelect, onPlay) y etiquetas de dificultad y estado. | B-027.3. |
| `frontend/src/components/LibrarySection/SongDetailPanel/SongDetailPanel.tsx` | Panel de detalle: portada, metadatos, estadísticas, 'Continuar en Learn' y el subidor de MIDI plegable. | B-027.3; Continuar en Learn publica la pieza (kind catalog) y navega al piano, que la reproduce al cargarla. Timing y Notas siguen pendientes de las evaluaciones. |
| `frontend/src/components/LibrarySection/SongDetailPanel/SongDetailPanel.module.css` | Estilos del panel de detalle. | B-027.3; simplicidad primero. |
| `frontend/src/components/LibrarySection/SongDetailPanel/SongDetailPanel.types.ts` | Props del panel (song o null). | B-027.3. |
| `frontend/src/components/LibrarySection/TablePagination/TablePagination.tsx` | Paginación de la tabla: Anterior/Siguiente y botones numerados, con el recuento de piezas mostradas. | B-027.3; recibe la página y los totales ya calculados por paginate(). |
| `frontend/src/components/LibrarySection/TablePagination/TablePagination.module.css` | Estilos de la paginación. | B-027.3; simplicidad primero. |
| `frontend/src/components/LibrarySection/TablePagination/TablePagination.types.ts` | Props de la paginación (page, totalPages, shown, total, onPageChange). | B-027.3. |
| `frontend/src/components/PianoStage/Keyboard/SvgKeyboard/PianoVirtual88Pressed.tsx` | Teclado de 88 teclas generado con SVGR desde el asset (no editar a mano). | Regenerar con `npm run generate:keyboard`; el envoltorio lo usa por ref. |
| `frontend/src/components/PianoStage/Keyboard/SvgKeyboard/SvgKeyboard.tsx` | Teclado SVG con ventana C1–C6 y resaltado sonando/esperada/tocada (client component). | B-007.2 pinta fills por data-key-id restaurando originales. |
| `frontend/src/components/PianoStage/Keyboard/SvgKeyboard/SvgKeyboard.module.css` | Estilos del marco del teclado SVG. | B-007.1; simplicidad primero. |
| `frontend/src/components/PianoStage/Keyboard/SvgKeyboard/SvgKeyboard.types.ts` | Props del teclado (fromKey, toKey). | B-007.1. |
| `frontend/src/lib/pitch.ts` | Mapeo pitch MIDI ↔ id de tecla del asset (pitchToKeyId, keyIdToPitch, isKeyInRange, countWhiteKeys). | B-007.1/B-007.3; puro y testeable con barrido contra el asset. |
| `frontend/src/lib/pitch.test.ts` | Tests del mapeo pitch ↔ id: bordes, inversa, rango, cobertura total del asset y teclas blancas. | Criterio de B-007.1; se ejecutan con `npm run test` (Vitest). |
| `frontend/src/lib/visible-range.ts` | Rango de octavas visible (fromKey/toKey) según el ancho del contenedor, con escala de 6 rangos y techo en MAX_WHITE_KEY_PX. | B-007.2; puro y testeable; cuenta las teclas blancas con countWhiteKeys para no duplicar números. |
| `frontend/src/lib/visible-range.test.ts` | Tests de resolveVisibleRange: contracción estrecha, rango base, expansión y techo A0–C8. | Criterio de B-007.2; se ejecutan con `npm run test` (Vitest). |
| `frontend/src/lib/useResponsiveRange.ts` | Hook que mide el contenedor con ResizeObserver y publica el rango resuelto en el almacén compartido. | B-007.2/B-007.3; devuelve solo el ref, el rango lo leen el teclado y la cuadrícula. |
| `frontend/src/lib/visible-range-store.ts` | Almacén compartido del rango visible (publish/subscribe/get): el evento que dispara el teclado y escucha la cuadrícula. | B-007.3; singleton en memoria, no notifica si el rango no cambia. |
| `frontend/src/lib/visible-range-store.test.ts` | Tests del almacén: notificación al cambiar, silencio si no cambia y baja de suscriptores. | Criterio de B-007.3; se ejecutan con `npm run test` (Vitest). |
| `frontend/src/lib/useVisibleRange.ts` | Hook suscrito al rango visible con useSyncExternalStore y snapshot de servidor. | B-007.3; seguro con SSR de Next.js (en el servidor pinta el rango por defecto). |
| `frontend/public/assets/icons/Learn.svg` | Icono de la pestaña Learn de la navegación principal. | B-006.4; Next lo sirve desde public/ como /assets/icons/Learn.svg. |
| `frontend/public/assets/icons/Library.svg` | Icono de la pestaña Library de la navegación principal. | B-006.4; MainNav lo pide como Library.svg (mayúscula) en Linux/Docker. |
| `frontend/public/assets/icons/Lock.svg` | Icono de candado de las pestañas bloqueadas (Progress y Settings). | B-006.4; MainNav lo pide como Lock.svg (mayúscula) en Linux/Docker. |
| `frontend/public/assets/icons/Logo.svg` | Logo en SVG servido desde public/. | B-006.4; hoy no lo referencia ningún componente del front. |
| `frontend/public/assets/icons/` | Iconos de la interfaz: Learn, Library, Lock y Logo (en uso) más bot, eye, info, metrics, piano, play, cronometer, firma, metronome, next, pause, play2 y stop (reservados del diseño). | B-006.4/B-027.3; MainNav los pide por nombre como /assets/icons/<icon>.svg (mayúscula en Linux/Docker). |
| `frontend/public/assets/covers/` | Cuatro portadas de dominio público en JPG (bach, beethoven, chopin, mozart) para las piezas del catálogo. | B-027.3; sin texto incrustado y con la procedencia documentada en CREDITS.md. |
| `frontend/public/assets/covers/CREDITS.md` | Procedencia y licencia de cada portada del catálogo. | B-027.3; requisito de atribución de las imágenes de dominio público. |
| `THIRD_PARTY_NOTICES.md` | Atribución y licencias de recursos de terceros que viajan con el proyecto (muestras de piano Salamander, CC BY 3.0). | B-007.5; requisito de la licencia: debe acompañar a los MP3 aunque se muevan a un almacén externo. |
| `frontend/scripts/fetch-piano-samples.mjs` | Script idempotente (`npm run samples`) que descarga el banco Salamander (SHA-1 fijado), extrae 30 teclas x 2 capas y trascodifica a MP3 en dos calidades. | B-007.5; requiere ffmpeg en el PATH; --force regenera; el banco de 78 MB queda en frontend/.cache (ignorado por git). |
| `frontend/src/lib/piano-model.ts` | Modelo de piano puro: elección de la muestra más cercana, detune en céntimos, mezcla de capas por velocity y voz aditiva de reserva (parciales, pesos y decaimientos). | B-007.5; sin WebAudio ni DOM: toda la matemática del timbre vive aquí para poder testearla. |
| `frontend/src/lib/piano-model.test.ts` | Tests del modelo: cercanía y empates, tope de detune, cruce de capas con potencia constante, calidades por rango y voz aditiva. | Criterio de B-007.5; se ejecutan con `npm run test` (Vitest). |
| `frontend/src/lib/piano-samples.ts` | Cargador perezoso de muestras (manifiesto, descargas deduplicadas, poda LRU y precarga por capas) y sampler que reproduce MP3 con detune y crossfade, con voz de reserva. | B-007.5; implementa el contrato PolySynth; la base es configurable con NEXT_PUBLIC_AUDIO_BASE_URL. |
| `frontend/src/lib/piano-samples.test.ts` | Tests del sampler con dobles de WebAudio y fetch: manifiesto caído, semitonaje, mezcla de capas, reserva y poda de memoria. | Criterio de B-007.5; se ejecutan con `npm run test` (Vitest). |
| `frontend/src/lib/synth.test.ts` | Tests de la voz aditiva de reserva: parciales, envolvente, sostenido, silencio y robo de voces al saturar. | Criterio de B-007.5; con AudioContext doble, sin DOM. |
| `frontend/src/lib/audio-doubles.ts` | Dobles de WebAudio y de fetch para tests (contexto, ganancias, osciladores, fuentes de buffer y rutas falsas). | Solo lo usan los tests de synth.ts y piano-samples.ts; la app no lo importa, así que no entra en el bundle. |
| `frontend/public/audio/piano/` | 120 MP3 de piano (30 teclas en terceras menores x 2 capas de velocity x 2 calidades, 4,7 MB) generados por `npm run samples`. | B-007.5; HQ para la ventana visible C1–C6 y LQ para el resto; atribución en THIRD_PARTY_NOTICES.md. |
| `frontend/public/audio/piano/manifest.json` | Manifiesto de las muestras: pitch, capa, calidad, fichero, duración, bytes y SHA-256, más licencia y procedencia del banco. | B-007.5; lo pide piano-samples.ts a /audio/piano/manifest.json; regenerarlo con el script, no a mano. |

_Para añadir un archivo nuevo: agrega su fila en `architecture/files.csv` y ejecuta `python architecture/generate_architecture.py`._
