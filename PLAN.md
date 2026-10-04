# 🗓️ Plan de trabajo — PianoMentor AI

> Plan operativo del MVP de PianoMentor AI. El objetivo general y la arquitectura del proyecto se mantienen en [`README.md`](README.md).

## 🎯 Resultado esperado

Al finalizar las seis semanas debe existir una aplicación web funcional capaz de cargar una pieza MIDI, reproducir una sección, recibir la interpretación del estudiante, evaluar notas y timing, detectar una debilidad y ejecutar una intervención pedagógica de IA validada, con devolución del control al estudiante.

El objetivo de validación es procesar correctamente al menos el **80 % de un corpus de 15 piezas MIDI de piano** de dominio público o con licencia compatible.

## 📌 Principios de ejecución

- Priorizar el núcleo MIDI y la evaluación antes de ampliar funcionalidades.
- Mantener separadas la interfaz, la API, el dominio musical y el agente pedagógico.
- El código determinista controla MIDI, reproducción, timing y evaluación.
- El LLM propone acciones estructuradas; nunca envía eventos MIDI directamente.
- Toda intervención debe ser visible, limitada, pausable, detenible y reversible.
- Docker debe permitir reproducir el entorno desde el inicio.
- Cada cambio en parsing, timing, evaluación, validación o estados debe acompañarse de pruebas.

## 📅 Plan semanal

### Semana 1 — Arquitectura, entorno y carga de MIDI

**Objetivos**

- Crear la estructura modular del proyecto.
- Configurar Python, FastAPI, SQLite y almacenamiento local.
- Preparar `Dockerfile`, `docker-compose.yml` y `.env.example`.
- Implementar la carga y validación inicial de archivos `.mid` y `.midi`.
- Definir los modelos de piezas, notas, sesiones y eventos.

**Entregables**

- Estructura inicial del repositorio.
- Backend ejecutable.
- Endpoint `POST /pieces`.
- Primeros tests de carga y validación de MIDI.
- Arranque reproducible mediante Docker.

### Semana 2 — Normalización, reproducción y piano virtual

**Objetivos**

- Extraer tracks, notas, tempo y duración.
- Normalizar los eventos MIDI.
- Implementar la reproducción de piezas y secciones.
- Añadir control de tempo, pausa, detención y repetición.
- Crear la primera versión del piano virtual.
- Diseñar una interfaz web inicial sencilla, clara y funcional.

**Entregables**

- Motor MIDI funcional.
- Reproducción de una pieza de prueba.
- Selección de rangos de compases.
- Piano virtual básico.
- Visualización de notas esperadas.
- Tests de normalización y reproducción.

### Semana 3 — Captura y evaluación del estudiante

**Objetivos**

- Capturar eventos del teclado del ordenador.
- Asociar notas recibidas con notas esperadas.
- Calcular notas correctas, omitidas y adicionales.
- Implementar la métrica de timing.
- Mostrar resultados y errores en el frontend.
- Crear fixtures de interpretaciones correctas e incorrectas.

**Entregables**

- Entrada desde teclado del ordenador.
- Evaluador musical determinista.
- Métricas de precisión y timing.
- Visualización de errores.
- Tests de evaluación musical.

### Semana 4 — Agente pedagógico y estados

**Objetivos**

- Implementar la máquina de estados.
- Crear el estado estructurado del estudiante.
- Implementar `wait`, `give_hint`, `slow_down`, `demonstrate` y `return_control`.
- Añadir reglas deterministas de decisión.
- Crear el contrato de acciones y su validador.
- Mostrar el estado del agente en la interfaz.

**Entregables**

- Máquina de estados funcional.
- Estado de sesión persistente.
- Acciones estructuradas.
- Validador de acciones.
- Indicadores visibles de estado y control.
- Tests de transiciones y validación.

### Semana 5 — Demostración, acompañamiento e integración de IA

**Objetivos**

- Implementar la demostración de una mano.
- Implementar la devolución automática del control.
- Añadir acompañamiento básico.
- Integrar LangGraph si el flujo determinista ya es estable.
- Conectar el proveedor LLM mediante una interfaz desacoplada.
- Generar feedback pedagógico estructurado.
- Registrar decisiones de alto nivel.

**Entregables**

- Flujo completo de demostración.
- Acompañamiento básico.
- Integración inicial de LangGraph.
- Integración del LLM con salida estructurada.
- Validación de todas las acciones generadas.
- Pruebas de devolución del control y recuperación ante errores.

### Semana 6 — Integración final, pruebas y demostración

**Objetivos**

- Integrar frontend, backend, motor MIDI y agente.
- Probar el corpus de 15 piezas MIDI.
- Medir el porcentaje de procesamiento correcto.
- Corregir errores de parsing, reproducción y evaluación.
- Verificar el arranque mediante Docker.
- Completar la documentación.
- Preparar una sesión demostrable de principio a fin.

**Entregables**

- MVP funcional.
- Frontend operativo.
- Backend documentado.
- Corpus de validación registrado.
- Informe de resultados.
- Tests automatizados.
- Documentación de instalación.
- Demostración completa:

```text
cargar MIDI
  → seleccionar sección
  → reproducir
  → tocar con el teclado
  → evaluar interpretación
  → detectar debilidad
  → recibir demostración de la IA
  → recuperar el control
  → repetir la sección
```

## ✅ Puerta de aceptación del MVP

Antes de cerrar la semana 6, comprobar que:

- [ ] El usuario puede cargar una pieza MIDI.
- [ ] El sistema procesa correctamente al menos el 80 % del corpus de validación.
- [ ] El frontend permite iniciar una sesión de práctica.
- [ ] El piano virtual muestra las notas esperadas.
- [ ] El usuario puede tocar mediante el teclado del ordenador.
- [ ] Se detectan notas correctas, incorrectas y omitidas.
- [ ] Se calcula una métrica de timing.
- [ ] El agente identifica errores o secciones débiles.
- [ ] La IA puede dar una pista, demostrar una sección o acompañar.
- [ ] La interfaz muestra quién tiene el control del piano.
- [ ] La demostración tiene duración limitada.
- [ ] El control vuelve automáticamente al estudiante.
- [ ] Las acciones del agente son validadas.
- [ ] El flujo funciona mediante Docker.
- [ ] El proyecto incluye pruebas y documentación de instalación.

## ⚠️ Gestión del alcance

Si una funcionalidad opcional amenaza el núcleo del MVP, se pospone. Entre las funcionalidades candidatas a posponer están:

- Web MIDI API para teclados físicos.
- Memoria entre sesiones.
- Plan de práctica persistente.
- Diferenciación automática de manos.
- Ajuste automático de tempo.
- Gráficos avanzados de progreso.

La prioridad de la demo es:

```text
MIDI → reproducción → práctica → evaluación → intervención de IA → devolución del control
```

