# PianoMentor AI

> **Profesor de piano virtual con IA** que observa la interpretación del estudiante, evalúa su desempeño y propone intervenciones pedagógicas concretas sobre una pieza MIDI.

![Estado](https://img.shields.io/badge/estado-MVP%20en%20desarrollo-orange)
![Backend](https://img.shields.io/badge/backend-Python%20%7C%20FastAPI-009688)
![IA](https://img.shields.io/badge/IA-LLM%20%2B%20LangGraph-6f42c1)

## 1. Propósito de este documento

Este README es la fuente de verdad para el **contexto del producto**, sus objetivos, alcance y decisiones de alto nivel.

La documentación especializada está separada para evitar duplicaciones:

- [Plan de trabajo](PLAN.md): fases, entregables y criterios de aceptación.
- [Arquitectura](ARCHITECTURE.md): estructura de carpetas, capas, contratos y evolución técnica.
- [Glosario](GLOSARIO.md): definiciones musicales, técnicas y del proyecto.

Antes de modificar el proyecto, leer este README y el documento especializado relacionado con el cambio.

## 2. Visión del producto

PianoMentor AI convierte una pieza MIDI en una sesión de práctica adaptativa. El estudiante podrá:

- cargar un archivo MIDI;
- visualizar la pieza en un piano virtual;
- reproducir una sección a tempo reducido;
- practicar con el teclado del ordenador;
- recibir puntuaciones de notas y timing;
- identificar secciones débiles;
- pedir una pista, demostración o acompañamiento;
- recuperar el control después de una intervención de la IA.

### Propuesta central

> La IA no solo explica cómo practicar: observa la interpretación, detecta dificultades y propone una intervención limitada, visible y reversible.

### Gimmick principal

La IA puede tomar temporalmente el control del piano virtual para demostrar un fragmento concreto y devolverlo automáticamente al estudiante.

```text
El estudiante falla varias veces una transición.
        ↓
El sistema detecta el patrón de error.
        ↓
La IA propone una demostración limitada.
        ↓
El motor determinista valida y reproduce la acción.
        ↓
El control vuelve automáticamente al estudiante.
```

## 3. Objetivo del proyecto

Desarrollar en seis semanas una aplicación web de mentoría para piano capaz de cargar, analizar y reproducir piezas MIDI, evaluar la interpretación mediante precisión y timing, y ejecutar intervenciones pedagógicas validadas.

El objetivo de validación del MVP es procesar correctamente al menos el **80 % de un corpus de 15 piezas MIDI de piano** de dominio público o con licencia compatible.

## 4. Alcance del MVP

### Incluido

- Carga de archivos `.mid` y `.midi`.
- Parsing y normalización de tracks, notas, tempo y compases.
- Reproducción de piezas y secciones.
- Piano virtual en el navegador.
- Control de tempo, pausa, detención y repetición.
- Entrada mediante el teclado del ordenador.
- Comparación entre notas esperadas y notas recibidas.
- Métricas de precisión, notas omitidas, notas adicionales y timing.
- Máquina de estados pedagógica inicial.
- Acciones iniciales del agente: `wait`, `give_hint`, `slow_down`, `demonstrate`, `accompany` y `return_control`.
- Acciones estructuradas y validadas antes de ejecutarse.
- Demostración limitada con devolución automática del control.
- Ejecución reproducible mediante Docker Compose.

### Opcional después de validar el núcleo

- Web MIDI API para teclados físicos.
- Plan de práctica persistente.
- Memoria entre sesiones.
- Diferenciación automática de manos.
- Feedback generado por LLM.
- Ajuste automático de tempo.
- Gráficos avanzados de progreso.

### Fuera del MVP

- Transcripción de audio a MIDI.
- Reconocimiento perfecto mediante micrófono.
- Catálogo universal de partituras.
- Scraping indiscriminado de webs.
- Red social o rankings.
- Aplicación móvil nativa.
- Entrenamiento de un modelo musical propio.
- Soporte inicial de todos los instrumentos.

El orden detallado de implementación está en [PLAN.md](PLAN.md).

## 5. Principios de producto

1. **No es un chatbot genérico:** el agente trabaja con una pieza, una interpretación y un estado pedagógico.
2. **El código determinista controla la música:** MIDI, reproducción, reloj, timing y evaluación no dependen del LLM.
3. **La IA propone, el sistema valida:** ninguna acción generada por un LLM se ejecuta directamente.
4. **El estudiante conserva el control final:** toda intervención tiene límites, puede detenerse y devuelve el control automáticamente.
5. **El sistema funciona sin LLM:** las reglas deterministas son el fallback obligatorio.
6. **La interfaz debe hacer visible el estado:** el usuario debe saber si está practicando, esperando, recibiendo una pista o viendo una demostración.
7. **La interfaz inicial es web:** la consola retro queda descartada como interfaz principal.
8. **El alcance se mantiene pequeño:** las funcionalidades opcionales se posponen si amenazan el núcleo MIDI → práctica → evaluación → intervención.

Los límites entre frontend, API, dominio e infraestructura están definidos en [ARCHITECTURE.md](ARCHITECTURE.md).

## 6. Estado actual de configuración

Decisiones de infraestructura para el MVP:

- **Backend:** Python, FastAPI y Pydantic.
- **Frontend:** Next.js y TypeScript.
- **Persistencia:** SQLite local.
- **Archivos MIDI:** filesystem local durante el MVP.
- **Proveedor LLM inicial:** Groq mediante una API compatible con OpenAI.
- **Modelo inicial validado:** `openai/gpt-oss-20b`.
- **Observabilidad:** LangSmith opcional, limitado a tracing de alto nivel.
- **Contenedores:** Docker y Docker Compose.
- **Comunicación:** HTTP para operaciones normales y WebSocket para el estado de práctica en tiempo real.

Las credenciales se mantienen exclusivamente en `.env`, excluido por `.gitignore`. Nunca incluir claves, tokens o secretos en documentación, commits, logs o diagnósticos.

La estructura concreta de archivos y la estrategia de evolución están documentadas en [ARCHITECTURE.md](ARCHITECTURE.md).

## 7. Privacidad, seguridad y fuentes musicales

- Tratar los MIDI cargados como datos privados.
- No subir audio si el MVP solo necesita MIDI.
- No ejecutar contenido de archivos externos.
- No permitir que el LLM genere comandos del sistema.
- No dar al LLM acceso directo al puerto MIDI.
- Validar las acciones mediante una lista blanca, límites y timeout.
- Registrar decisiones de alto nivel sin guardar datos innecesarios.
- No enviar claves ni contenido sensible del `.env` a LangSmith.
- Usar para demos composiciones de dominio público, MIDI creados por el proyecto o fuentes con licencia compatible.
- Registrar la procedencia y licencia de cada pieza cuando sea posible.

## 8. Documentación relacionada

| Documento | Fuente de verdad para |
|---|---|
| [PLAN.md](PLAN.md) | Cronograma, entregables, puerta de aceptación y prioridades. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Estructura de carpetas, responsabilidades, capas, API y evolución técnica. |
| [GLOSARIO.md](GLOSARIO.md) | Definiciones de conceptos y tecnologías. |

> Si una decisión cambia la arquitectura, actualizar [ARCHITECTURE.md](ARCHITECTURE.md). Si cambia el alcance o el objetivo del producto, actualizar este README. Si cambia el orden de trabajo, actualizar [PLAN.md](PLAN.md).
