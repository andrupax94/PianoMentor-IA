<!-- description: Cronograma y aceptación del MVP en 5 semanas: backlog, entregables semanales y Definition of Done. -->
<!-- context: Fuente de verdad de qué hacer y en qué orden; no describe estructura técnica. -->

# Plan de trabajo — PianoMentor AI

> Este documento es la fuente de verdad para el **cronograma, entregables, prioridades y criterios de aceptación** del MVP.

Para el contexto del producto, consultar el [README](README.md). Para la estructura técnica, consultar [ARCHITECTURE.md](ARCHITECTURE.md). Para términos especializados, consultar [GLOSSARY.md](GLOSSARY.md).

## 1. Resultado esperado

Al finalizar las **cinco semanas** debe existir una aplicación web funcional capaz de:

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

El objetivo de validación es procesar correctamente al menos el **80 % de un corpus de 17 piezas MIDI de piano** de dominio público o con licencia compatible. Este objetivo debe revisarse si el corpus real o la complejidad de los archivos amenaza la entrega de la demo. El catálogo añade una pieza propia de práctica (`p16`, CC0) para las pruebas de sesión y evaluación, ajena a ese criterio.

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

El backlog operativo completo está en [.github_projects/project-backlog.csv](.github_projects/project-backlog.csv) y se puede importar como Issues mediante [.github_projects/scripts/import-github-issues.ps1](.github_projects/scripts/import-github-issues.ps1).

### Resumen priorizado

| ID | Prioridad | Tarea | Semana |
|---|---|---|---|
| B-001 | P0 | Crear y validar la estructura monorepo | 1 |
| B-002 | P0 | Preparar contrato y almacenamiento base de piezas MIDI | 1 |
| B-003 | P0 | Cargar y validar archivos MIDI con SQLite + sqlite-vec | 1 |
| B-004 | P0 | Crear el flujo web inicial | 1 |
| B-005 | P0 | Normalizar notas MIDI | 1 |
| B-006 | P0 | Implementar reproducción básica | 1 |
| B-007 | P0 | Crear piano virtual básico | 1 |
| B-008 | P0 | Rejilla de compases: cálculo, compás actual y rangos | 2 |
| B-009 | P0 | Polifonía, acordes y estrategia de tracks | 2 |
| B-011 | P0 | Capturar teclado del ordenador | 2 |
| B-012 | P0 | Agente vertical: sesión, evaluación, estados, acciones, demo, Groq, acompañamiento | 2–4 |
| B-020 | P0 | Integración final y pruebas end-to-end | 5 |
| B-021 | P1 | Desplegar backend en Hugging Face Spaces | 5 |
| B-022 | P1 | Desplegar frontend en Vercel | 5 |
| B-023 | P1 | Ejecutar prueba pública end-to-end | 5 |
| B-024 | P1 | Crear vídeo demo | 5 |
| B-025 | P1 | Preparar publicación de LinkedIn | 5 |
| B-026 | P1 | Documentar estado final del MVP | 5 |
| B-027 | P1 | Crear corpus de piezas MIDI de licencia compatible | 2 |
| B-028 | P1 | Detectar duplicados por hash y marcar procedencia | 1 |
| B-029 | P2 | Control de MIDIs por usuario y subidas anónimas | 5 |
| B-030 | P2 | Pulir el motor de sonido del piano (sampler, voz de reserva y transporte) | 5 |
| U-001 | P2 | Configurar el depurador en VS Code y Docker | — |

Las prioridades significan: **P0**, imprescindible para el flujo principal; **P1**, necesario para la demo completa o el primer despliegue; **P2**, posterior y aplazable.

El backlog puede crecer o reordenarse. Cuando una tarea se complete, debe reflejarse en GitHub Projects y, si afecta a la aceptación del MVP, también en la sección correspondiente de este documento.

Tras la revisión de B-005 se añadieron dos tareas no previstas en el plan inicial: **B-028** (detección de duplicados por hash y procedencia de las piezas, implementada en la semana 1) y **B-029** (control de MIDIs por usuario y subidas anónimas, reservada para el final del MVP, fuera del alcance de las semanas 1 a 4).

La serie **U-** está **fuera del plan inicial**: son tareas de herramientas de desarrollo (no de producto) que nacieron a último momento para desbloquear lo que hizo falta mientras se implementaba el resto. No se reparten por semanas (columna `—`), no cuentan para la aceptación del MVP y se atienden cuando hacen falta. La primera es **U-001** (depurador en VS Code y Docker), surgida al cablear B-007.

### Fechas objetivo iniciales

Tomando el **6 de octubre de 2026** como inicio de referencia, el Project usa estas fechas objetivo. El `Start date` se deja vacío para que se complete manualmente cuando comience cada tarea.

| Semana | Fecha objetivo |
|---|---|
| Semana 1 | 2026-10-12 |
| Semana 2 | 2026-10-19 |
| Semana 3 | 2026-10-26 |
| Semana 4 | 2026-11-02 |
| Semana 5 | 2026-11-09 |

Estas fechas son una línea base operativa, no una obligación inamovible. Si se modifica el calendario, actualizar GitHub Projects y conservar el cambio en el respaldo local.

## 3. Reglas de ejecución

- Priorizar MIDI, evaluación y flujo vertical antes de ampliar funcionalidades.
- Implementar primero reglas deterministas; el LLM no debe ser un requisito para que funcione el flujo.
- Mantener separadas interfaz, API, dominio musical, infraestructura y agente según [ARCHITECTURE.md](ARCHITECTURE.md).
- Acompañar cualquier cambio en parsing, compases, polifonía, timing, evaluación, validación o estados con tests.
- Mantener Docker reproducible desde el inicio.
- Reservar parte de la semana 5 para integración, despliegue, vídeo y LinkedIn; no dejar estos entregables para el último día.
- Recortar primero acompañamiento avanzado, memoria, Web MIDI físico y feedback largo del LLM si aparece retraso.

Tras la revisión de **B-005** se añadieron **B-028** (duplicados por hash) y **B-029** (control por usuario).  
En **octubre 2026** se reestructuró el **bloque agente (B-012 a B-019)** en una **vertical única B-012** con 7 sub-issues (.1 Sesión+WS, .2 Evaluación, .3 Estados+reglas, .4 Validación, .5 Demo+control, .6 Groq, .7 Acompañamiento), fusionando las antiguas issues separadas; semana 2–4 ajustadas en consecuencia.  
El **corpus B-027** quedó integrado en el frontend en la misma fecha: la página **Library** (`/library`) lista el corpus, permite escucharlo sin salir de la lista y manda la pieza al piano con **Continuar en Learn** (B-027.3). Los **filtros y las métricas de la Library** se apartan a **B-027.4**, junto con tres pendientes menores (documentos stale de B-003, sembrado del catálogo al arrancar el backend y pulido del motor de sonido), para no mezclarlos con lo que depende de las evaluaciones (B-012/B-014). B-027 sigue abierto hasta que el corpus se use en la demo final (B-024).  
En la misma revisión, **B-027.4** avanzó en tres tandas: el **sembrado del catálogo** (`GET /api/v1/pieces` carga el corpus del repositorio cuando la tabla `pieces` no tiene ninguna pieza suya, `ensure_catalog_loaded`, así que un arranque limpio ya sirve la Library sin el comando manual), los **filtros y el orden de la Library** (dificultad, duración y tempo por tramos, más orden por título, compositor, dificultad, duración y tempo, con la lógica pura en `frontend/src/lib/library.ts` y tests) y el **orden desde las cabeceras de la tabla** (pulsar una columna la ordena descendente y repetir alterna el sentido, con flecha y `aria-sort`; las columnas de puntaje y estado no ordenan). Queda pendiente solo la issue de pulido del sonido; los documentos stale de B-003 ya se sincronizaron con lo implementado (anotando que la tabla `piece_vectors` sigue aplazada a B-005/B-013), y el filtro por estado y las métricas siguen **bloqueados por B-012.2/B-012.3**.  
El pulido del sonido que quedó fuera al cerrar **B-007.5** se abrió como **B-030** (P2, Semana 5): tope de voces del sampler, latencia del primer golpe, cruce de capas por velocity, inarmonicidad por registro y una ventana de programación más holgada en el transporte. No reabre B-006.2 ni B-007.5.  
**B-009** se desglosa en tres sub-issues (**.1** acordes, **.2** estrategia de pistas y manos, **.3** contrato y uso en la interfaz) al medir el corpus: las 15 piezas traen dos pistas con notas, los canales no siguen una convención y la señal fiable para las manos es la altura (la pista más grave es la izquierda en 15/15). El motor agrupa las notas simultáneas en acordes (B-009.1), etiqueta la mano de cada pista quedándose con **merge** como comportamiento por defecto (B-009.2, con la selección de mano y el acompañamiento aplazados a B-012 y B-019) y el contrato los sirve de forma **opcional** (`?with_hands=true` / `?with_chords=true`, sin cambiar la respuesta de antes) en `/notes` y en el preview (B-009.3); la interfaz todavía no pide esos campos y pintar las manos queda para B-012.

En **octubre 2026** arranca la **vertical del agente (B-012)** con su primera sub-issue, **B-012.1** (sesión + WebSocket real): la sesión ya vive en SQLite (migración `0005`, tablas `sessions` y `session_events`), `POST /api/v1/sessions` valida la pieza y responde 201, `GET /sessions/{id}/state` sirve el estado vivo y el WS `/api/v1/ws/sessions/{id}` manda el estado al conectar, persiste cada `note_on`/`note_off` y lo difunde a todas las conexiones de la sesión (registro en memoria del proceso, un solo worker documentado en `ARCHITECTURE.md`). Los mensajes van envueltos en un campo `type` (`state`/`error`, con `agent_action` reservado para B-012.5): un payload inválido se avisa con `invalid_event_payload` sin cerrar la sesión y una sesión inexistente cierra con 4404. `connect()` activa **WAL** y un `busy_timeout` de 3 s para que el WebSocket escriba mientras los endpoints leen. El frontend gana `websocket-client.ts` (reconexión con backoff exponencial), `PracticeSession.tsx` y un botón **"Practicar esta pieza"** en el panel de detalle de la Library que abre la sesión y navega a `/practice/{id}`; **"Continuar en Learn" no cambia de significado**, sigue mandando la pieza al piano. La evaluación (B-012.2), las reglas (.3), la validación (.4) y la demo (.5) siguen pendientes.

La misma serie se amplía con **B-012.8** (chat del agente) para que el agente tenga **cara visible** sin esperar a la evaluación: escribe el estudiante, el modelo elige entre una **lista blanca de funciones** que solo hacen cosas ya implementadas (buscar pieza, reproducir, pausar, reanudar, parar, abrir práctica, consultar estado), el backend valida y el **navegador ejecuta** lo que toca al piano. Si la orden no está en la lista, el agente responde que no puede y recuerda qué sí puede, que es la prueba de que no alucina capacidades. Añade **memoria a corto plazo** (ventana rodante de mensajes en SQLite, migración `0006`) y un **panel híbrido**: en la página del piano el chat se queda donde siempre ha estado, dentro del card del mentor, y en el resto de páginas aparece como panel flotante. Usa **LangGraph** solo para el bucle agente↔herramientas (la orquestación de alto nivel que anunciaba la arquitectura; no toca MIDI, ni el reloj, ni la reproducción) y una **cadena de proveedores** Groq → OpenCode → `MockProvider`: el modelo previsto es `openai/gpt-oss-20b` en Groq, y el respaldo garantizado es determinista y sin red, para que la demo no dependa de una clave.

La misma tanda deja dos fixtures MIDI **versionados y regenerables** con `backend/scripts/build_midi_fixtures.py`: la **escala de tres notas** que fijan los números de la carga de piezas (`test_scale.mid`, antes un archivo local ignorado por git del que dependían siete tests) y la **frase de práctica** propia (`practice_phrase.mid`, 4 compases, 22 notas), que el catálogo ofrece como pieza `p16` para probar la sesión desde el navegador.

## 4. Plan por semanas

### Semana 1 — Base técnica, MIDI inicial, reproducción y piano virtual

**Objetivo:** conseguir una primera versión funcional donde el usuario pueda cargar un MIDI, visualizar sus notas y reproducir una sección desde la web.

**Tareas**

- Revisar la estructura MVP.
- Configurar backend FastAPI y frontend Next.js.
- Configurar dependencias, Docker Compose y `.env.example`.
- Crear `/health` y una estructura inicial de tests.
- Investigar la estructura básica de MIDI.
- Leer `.mid` con Mido y validar extensión y contenido.
- Extraer tracks, tempo inicial, número de notas, duración aproximada y canales.
- Convertir ticks a tiempo.
- Normalizar notas, duración y velocity a una estructura interna.
- Crear fixtures MIDI pequeños.
- Implementar reproducción básica de pieza o sección.
- Añadir play, pausa, detención, repetición y tempo inicial.
- Crear el piano virtual básico y mostrar las notas esperadas.
- Crear la pantalla de carga y mostrar metadatos y errores.

**Entregable**

```text
web
  → subir MIDI
  → backend valida y normaliza
  → frontend muestra metadatos
  → usuario selecciona una sección básica
  → sección reproducible en el piano virtual
```

**Criterio de cierre**

- [ ] Backend y frontend arrancan con Docker.
- [ ] Un MIDI válido puede cargarse y uno inválido se rechaza.
- [ ] Las notas se normalizan.
- [ ] Se puede reproducir una sección básica.
- [ ] Play, pausa y detención funcionan.
- [ ] El piano virtual muestra las notas.
- [ ] Existen tests iniciales de carga y normalización.

### Semana 2 — MIDI avanzado, práctica y captura del usuario

**Objetivo:** resolver los casos musicales que no conviene introducir durante la primera implementación y permitir que el usuario empiece a tocar la pieza.

**MIDI avanzado**

- Calcular compases de forma inicial.
- Polifonía, acordes y estrategia de tracks (agrupar simultáneas + decidir merge/filtrado/selección).
- Revisar cambios de tempo y mejorar el cálculo de duración.
- Definir qué notas son relevantes para una sección.
- Crear fixtures con varios tracks, silencios y eventos simultáneos.
- Probar diferentes resoluciones de ticks.

**Reproducción y práctica**

- Reproducir rangos reales de compases.
- Sincronizar la posición actual con la interfaz.
- Mostrar el compás actual.
- Mejorar repetición, pausa y detención.
- Definir el mapeo del teclado del ordenador a notas.
- Capturar `keydown` y `keyup`, evitando repeticiones accidentales.
- Mostrar la nota recibida y resaltar la tecla pulsada.
- **Agente vertical (inicio): sesión + WS real, evaluación determinista, máquina de estados, validación de acciones, demo + devolución control, chat del agente (B-012.8), (opcional) Groq + acompañamiento.**

**Entregable**

```text
pieza MIDI
  → compases calculados
  → polifonía y varios tracks gestionados inicialmente
  → sección seleccionable
  → usuario toca con el teclado
  → eventos visibles en la interfaz
```

**Criterio de cierre**

- [ ] Los compases se calculan de forma inicial.
- [ ] Polifonía, acordes y estrategia de tracks definidos y probados.
- [ ] El usuario puede tocar con el teclado del ordenador.
- [ ] Las notas pulsadas aparecen en la interfaz.
- [ ] Sesión + WS real funcionando (crear, estado, eventos).
- [ ] Chat del agente operando sobre lo implementado: lista blanca de funciones, memoria a corto plazo y panel en la interfaz (B-012.8).
- [ ] Evaluación determinista produciendo scoring.
- [ ] La reproducción funciona con las estructuras MIDI de prueba.

### Semana 3 — Continuación agente vertical y feedback UI

**Objetivo:** avanzar en la vertical del agente (estados, validación, demo) y preparar la UI de resultados.

**Tareas**

- Completar máquina de estados + reglas deterministas (B-012.3).
- Validación de acciones con límites (B-012.4).
- Demo + devolución control automática (B-012.5).
- UI de resultados: puntuación, errores, compás actual, secciones débiles (B-014 → sub-issue de B-012).

**Entregable**

```text
agente vertical
  → estados + reglas deterministas
  → acciones validadas
  → demo visible + control vuelve al estudiante
  → UI muestra puntuación, errores, debilidades
```

**Criterio de cierre**

- [ ] Máquina de estados transita y selecciona acción válida.
- [ ] Acciones rechazadas si violan límites.
- [ ] Demo visible, duración limitada, control vuelve al estudiante.
- [ ] UI muestra puntuación, errores, compás actual, debilidades.
- [ ] La evaluación funciona sin LLM.

### Semana 4 — Agente: Groq, acompañamiento e integración

**Objetivo:** cerrar la vertical del agente con LLM opcional y acompañamiento.

**Tareas**

- Groq + salida estructurada con fallback determinista (B-012.6).
- Acompañamiento básico si tiempo (B-012.7).
- Confirmar que el LLM puede deshabilitarse (MockProvider).
- Tests de validación, transiciones y evaluación completa.

**Criterio de cierre**

- [ ] Groq propone acciones estructuradas; fallback a MockProvider si falla.
- [ ] Acompañamiento básico funcional (o documentado como post-MVP).
- [ ] Flujo agente completo funciona sin LLM.
- [ ] Tests de validación, transiciones y evaluación pasan.

### Semana 5 — Integración, despliegue, vídeo y LinkedIn

**Objetivo:** cerrar una demo completa, publicarla y preparar su presentación.

**Integración y calidad**

- Integrar frontend, backend, MIDI, evaluación y agente.
- Corregir errores críticos y revisar estados de carga y error.
- Preparar una pieza de demo estable.
- Confirmar que el LLM puede deshabilitarse.
- Ejecutar tests unitarios, de integración y end-to-end.
- Probar carga MIDI, reproducción, teclado, evaluación, demostración, pausa, detención y devolución del control.
- Revisar Docker Compose, variables de entorno y secretos.

**Despliegue**

- Desplegar el backend FastAPI en Hugging Face Spaces mediante Docker.
- Configurar secretos, almacenamiento temporal y `/health`.
- Verificar endpoints y WebSocket si la plataforma lo permite.
- Desplegar Next.js en Vercel.
- Configurar `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL` y CORS.
- Ejecutar una prueba end-to-end pública desde Vercel hasta el backend.

**Vídeo demo**

Preparar un vídeo de aproximadamente **2 a 4 minutos** que muestre:

1. El problema y la propuesta.
2. La carga de una pieza MIDI.
3. Sus metadatos y la reproducción de una sección.
4. La práctica con el teclado.
5. Errores y evaluación de notas y timing.
6. Detección de una debilidad.
7. Intervención de la IA.
8. Devolución del control.
9. Tecnologías y próximos pasos.

**Publicación en LinkedIn**

- Preparar imagen o portada.
- Adjuntar el vídeo demo.
- Redactar el texto y la lista de tecnologías.
- Explicar problemas técnicos y funcionalidades implementadas.
- Indicar próximos pasos.
- Añadir el enlace al repositorio o demo pública.
- Revisar que no aparezcan secretos, rutas privadas ni datos sensibles.

**Criterio de cierre**

- [ ] La demo funciona de principio a fin.
- [ ] El frontend tiene una URL pública.
- [ ] El frontend se comunica con el backend desplegado.
- [ ] El vídeo está exportado.
- [ ] La publicación de LinkedIn está preparada o publicada.
- [ ] La documentación refleja el estado real del proyecto.

## 5. Funcionalidades que se recortan primero si aparece retraso

1. Acompañamiento completo.
2. Diferenciación automática de manos.
3. Falling notes avanzado.
4. Persistencia histórica.
5. Memoria entre sesiones.
6. Web MIDI físico.
7. Feedback largo generado por LLM.
8. LangGraph completo (B-012.8 usa un grafo mínimo, solo para orquestar el chat).

El núcleo que debe sobrevivir es:

```text
cargar MIDI
  → calcular y reproducir una sección
  → tocar con teclado
  → evaluar notas y timing
  → detectar debilidad
  → ejecutar una demostración sencilla
  → devolver el control
```

## 6. Puerta de aceptación del MVP

Antes de cerrar el MVP, comprobar:

- [ ] El usuario puede cargar una pieza MIDI.
- [ ] El sistema procesa correctamente el corpus de validación acordado.
- [ ] El frontend permite iniciar una sesión de práctica.
- [ ] El piano virtual muestra las notas esperadas.
- [ ] El usuario puede tocar mediante el teclado del ordenador.
- [ ] Se detectan notas correctas, incorrectas, omitidas y adicionales.
- [ ] Se calcula una métrica de timing.
- [ ] El agente identifica errores o secciones débiles.
- [ ] La IA puede dar una pista o demostrar una sección; el acompañamiento queda condicionado al tiempo.
- [ ] La interfaz muestra quién tiene el control del piano.
- [ ] La demostración tiene duración limitada.
- [ ] El control vuelve automáticamente al estudiante.
- [ ] Las acciones del agente son validadas.
- [ ] El flujo funciona mediante Docker.
- [ ] El backend está desplegado en Hugging Face o existe una justificación documentada si se pospone.
- [ ] El frontend está desplegado en Vercel o existe una justificación documentada si se pospone.
- [ ] El vídeo demo está exportado.
- [ ] La publicación de LinkedIn está preparada o publicada.
- [ ] El flujo funciona con el LLM deshabilitado mediante reglas deterministas.
- [ ] El proyecto incluye pruebas y documentación de instalación.

## 7. Orden de prioridad

Si existe conflicto entre funcionalidades, aplicar este orden:

```text
1. MIDI válido y normalizado
2. Reproducción y control de secciones
3. Compases, polifonía y tracks mínimos
4. Piano virtual y entrada del teclado
5. Evaluación de notas y timing
6. Agente vertical (estados, acciones, demo, LLM fallback, acompañamiento)
7. Despliegue público
8. Vídeo demo y publicación en LinkedIn
9. Web MIDI físico, memoria y progreso
```

## 8. Definition of Done por cambio

Un cambio se considera terminado cuando:

- [ ] Pertenece a un módulo identificado en [ARCHITECTURE.md](ARCHITECTURE.md).
- [ ] No mezcla UI con reproducción o evaluación.
- [ ] Mantiene las acciones del agente estructuradas y validadas.
- [ ] Incluye o actualiza tests cuando afecta lógica relevante.
- [ ] Mantiene visible y reversible el control del piano.
- [ ] Funciona con el LLM deshabilitado cuando corresponda.
- [ ] Se verificó el arranque local o Docker afectado.
- [ ] Se actualizaron Issues y estado en GitHub Projects cuando corresponda.
- [ ] Se actualizó la documentación especializada, no todos los documentos indiscriminadamente.

## 9. Documentos relacionados

- [README.md](README.md): producto, alcance y decisiones generales.
- [ARCHITECTURE.md](ARCHITECTURE.md): estructura y contratos técnicos.
- [GLOSSARY.md](GLOSSARY.md): definiciones de términos.
- [.github_projects/project-backlog.csv](.github_projects/project-backlog.csv): backlog importable en GitHub Projects.
- [.github_projects/README.md](.github_projects/README.md): uso del importador de Issues.
