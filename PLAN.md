# Plan de trabajo — PianoMentor AI

> Este documento es la fuente de verdad para el **cronograma, entregables, prioridades y criterios de aceptación** del MVP.

Para el contexto del producto, consultar el [README](README.md). Para la estructura técnica, consultar [ARCHITECTURE.md](ARCHITECTURE.md). Para términos especializados, consultar [GLOSARIO.md](GLOSARIO.md).

## 1. Resultado esperado

Al finalizar las seis semanas debe existir una aplicación web funcional capaz de:

```text
cargar MIDI
  → seleccionar una sección
  → reproducirla
  → recibir la interpretación del estudiante
  → evaluar notas y timing
  → detectar una debilidad
  → ejecutar una intervención validada
  → devolver el control al estudiante
```

El objetivo de validación es procesar correctamente al menos el **80 % de un corpus de 15 piezas MIDI de piano** de dominio público o con licencia compatible.

El alcance exacto del MVP y lo que queda fuera está definido en [README.md](README.md).

## 2. Backlog inicial

El **backlog** es la lista ordenada de tareas, mejoras y decisiones pendientes del producto. No es lo mismo que la checklist de aceptación: el backlog contiene trabajo que todavía puede cambiar de prioridad, mientras que la checklist responde si el MVP terminado cumple o no sus condiciones mínimas.

La relación entre ambos es:

```text
Backlog inicial
  → tareas priorizadas
  → entregables por semana
  → implementación y pruebas
  → checklist de aceptación del MVP
```

Este es el backlog inicial, ordenado por prioridad:

| ID | Prioridad | Tarea | Resultado esperado | Fase |
|---|---|---|---|---|
| B-001 | P0 | Crear y validar la estructura monorepo | Backend, frontend, datos, contratos y Docker preparados | Semana 1 |
| B-002 | P0 | Levantar FastAPI con `/health` | Backend ejecutable localmente y en contenedor | Semana 1 |
| B-003 | P0 | Cargar y validar archivos MIDI | `POST /api/v1/pieces` acepta MIDI válido y rechaza entradas inválidas | Semana 1 |
| B-004 | P0 | Normalizar notas, tempo, tracks y compases | Modelo interno estable para el motor musical | Semana 2 |
| B-005 | P0 | Crear reproducción y control de secciones | Play, pausa, detención, tempo y repetición | Semana 2 |
| B-006 | P0 | Crear piano virtual web | Notas esperadas visibles en Next.js | Semana 2 |
| B-007 | P0 | Capturar teclado del ordenador | Eventos del estudiante llegan a la sesión | Semana 3 |
| B-008 | P0 | Implementar evaluación determinista | Precisión, omisiones, extras y timing | Semana 3 |
| B-009 | P1 | Implementar máquina de estados | Estados pedagógicos explícitos y testeables | Semana 4 |
| B-010 | P1 | Validar acciones del agente | Lista blanca, límites, timeout y resultado estructurado | Semana 4 |
| B-011 | P1 | Implementar demostración y devolución de control | Intervención limitada, pausible y reversible | Semana 5 |
| B-012 | P1 | Añadir acompañamiento básico | La IA reproduce una parte mientras el usuario toca otra | Semana 5 |
| B-013 | P1 | Integrar LangGraph y proveedor LLM | Decisiones de alto nivel con fallback determinista | Semana 5 |
| B-014 | P1 | Desplegar frontend en Vercel | URL pública de la aplicación web | Semana 6 |
| B-015 | P1 | Desplegar backend en Hugging Face Spaces | API pública y WebSocket de demostración | Semana 6 |
| B-016 | P1 | Ejecutar prueba end-to-end pública | Flujo completo desde Vercel hasta el backend | Semana 6 |
| B-017 | P2 | Añadir Web MIDI, memoria y progreso | Funcionalidades posteriores al núcleo MVP | Después del MVP |

Las prioridades significan: **P0**, imprescindible para el flujo principal; **P1**, necesario para la demo completa o el primer despliegue; **P2**, posterior y aplazable.

El backlog puede crecer o reordenarse. Cuando una tarea se complete, debe reflejarse en el historial de Git y, si afecta a la aceptación del MVP, también en la sección correspondiente de este documento.

## 3. Reglas de ejecución

- Priorizar el núcleo MIDI y la evaluación antes de ampliar funcionalidades.
- Implementar primero reglas deterministas; el LLM no debe ser un requisito para que funcione el flujo.
- Mantener separadas interfaz, API, dominio musical, infraestructura y agente según [ARCHITECTURE.md](ARCHITECTURE.md).
- Acompañar cualquier cambio en parsing, timing, evaluación, validación o estados con tests.
- Mantener Docker reproducible desde el inicio.
- Posponer Web MIDI, memoria, planes persistentes y gráficos avanzados si amenazan el núcleo.

## 4. Plan por semanas

### Semana 1 — Arquitectura, entorno y carga de MIDI

**Objetivos**

- Crear la estructura inicial del monorepo.
- Configurar Python, FastAPI, SQLite y almacenamiento local.
- Preparar `Dockerfile`, `docker-compose.yml` y `.env.example`.
- Implementar la carga y validación inicial de `.mid` y `.midi`.
- Definir los modelos iniciales de piezas, notas, sesiones y eventos.

**Entregables**

- Backend ejecutable.
- Frontend Next.js inicial.
- Endpoint `POST /api/v1/pieces`.
- Primeros tests de carga y validación MIDI.
- Arranque reproducible mediante Docker.

### Semana 2 — Normalización, reproducción y piano virtual

**Objetivos**

- Extraer tracks, notas, tempo, compases y duración.
- Normalizar eventos MIDI.
- Implementar reproducción de piezas y secciones.
- Añadir tempo, pausa, detención y repetición.
- Crear el piano virtual inicial.
- Mostrar las notas esperadas en la interfaz web.

**Entregables**

- Motor MIDI funcional.
- Reproducción de una pieza de prueba.
- Selección de rangos de compases.
- Piano virtual básico.
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

- Implementar la máquina de estados explícita.
- Crear el estado estructurado del estudiante.
- Implementar `wait`, `give_hint`, `slow_down`, `demonstrate` y `return_control`.
- Añadir reglas deterministas de decisión.
- Crear el contrato de acciones y su validador.
- Mostrar estado del agente y control del piano en la interfaz.

**Entregables**

- Máquina de estados funcional.
- Estado de sesión persistente.
- Acciones estructuradas.
- Validador de acciones.
- Indicadores visibles de estado y control.
- Tests de transiciones y validación.

### Semana 5 — Demostración, acompañamiento e integración de IA

**Objetivos**

- Implementar la demostración de una mano o sección.
- Implementar la devolución automática del control.
- Añadir acompañamiento básico.
- Integrar LangGraph solo si el flujo determinista es estable.
- Conectar el proveedor LLM mediante una interfaz desacoplada.
- Generar feedback pedagógico estructurado.
- Registrar decisiones de alto nivel.

**Entregables**

- Flujo completo de demostración.
- Acompañamiento básico.
- Integración inicial de LangGraph.
- Integración del LLM con salida estructurada.
- Validación de todas las acciones generadas.
- Tests de devolución del control y recuperación ante errores.

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
- Demostración completa del flujo definido al inicio de este documento.

## 5. Puerta de aceptación del MVP

Antes de cerrar el MVP, comprobar:

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
- [ ] El flujo funciona con el LLM deshabilitado mediante reglas deterministas.

## 6. Orden de prioridad

Si existe conflicto entre funcionalidades, aplicar este orden:

```text
1. MIDI válido y normalizado
2. Reproducción y control de secciones
3. Piano virtual y entrada del teclado
4. Evaluación de notas y timing
5. Máquina de estados determinista
6. Acciones validadas y devolución del control
7. API y WebSocket estables
8. LangGraph y LLM
9. Web MIDI, memoria y progreso
```

## 7. Definition of Done por cambio

Un cambio se considera terminado cuando:

- [ ] Pertenece a un módulo identificado en [ARCHITECTURE.md](ARCHITECTURE.md).
- [ ] No mezcla UI con reproducción o evaluación.
- [ ] Mantiene las acciones del agente estructuradas y validadas.
- [ ] Incluye o actualiza tests cuando afecta lógica relevante.
- [ ] Mantiene visible y reversible el control del piano.
- [ ] Funciona con el LLM deshabilitado cuando corresponda.
- [ ] Se verificó el arranque local o Docker afectado.
- [ ] Se actualizó la documentación especializada, no todos los documentos indiscriminadamente.

## 8. Documentos relacionados

- [README.md](README.md): producto, alcance y decisiones generales.
- [ARCHITECTURE.md](ARCHITECTURE.md): estructura y contratos técnicos.
- [GLOSARIO.md](GLOSARIO.md): definiciones de términos.
