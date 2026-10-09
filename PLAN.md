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

El objetivo de validación es procesar correctamente al menos el **80 % de un corpus de 15 piezas MIDI de piano** de dominio público o con licencia compatible. Este objetivo debe revisarse si el corpus real o la complejidad de los archivos amenaza la entrega de la demo.

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
| B-008 | P0 | Calcular compases inicialmente | 2 |
| B-009 | P0 | Preparar soporte básico para polifonía | 2 |
| B-010 | P0 | Definir tratamiento de múltiples tracks | 2 |
| B-011 | P0 | Capturar teclado del ordenador | 2 |
| B-012 | P0 | Crear sesión de práctica y WebSocket | 2 |
| B-013 | P0 | Implementar evaluación determinista | 3 |
| B-014 | P0 | Mostrar resultados y secciones débiles | 3 |
| B-015 | P1 | Implementar máquina de estados pedagógica | 4 |
| B-016 | P1 | Validar acciones del agente | 4 |
| B-017 | P1 | Implementar demostración y devolución del control | 4 |
| B-018 | P1 | Integrar Groq y salida estructurada | 4 |
| B-019 | P1 | Añadir acompañamiento básico | 4 |
| B-020 | P0 | Integración final y pruebas end-to-end | 5 |
| B-021 | P1 | Desplegar backend en Hugging Face Spaces | 5 |
| B-022 | P1 | Desplegar frontend en Vercel | 5 |
| B-023 | P1 | Ejecutar prueba pública end-to-end | 5 |
| B-024 | P1 | Crear vídeo demo | 5 |
| B-025 | P1 | Preparar publicación de LinkedIn | 5 |
| B-026 | P1 | Documentar estado final del MVP | 5 |

Las prioridades significan: **P0**, imprescindible para el flujo principal; **P1**, necesario para la demo completa o el primer despliegue; **P2**, posterior y aplazable.

El backlog puede crecer o reordenarse. Cuando una tarea se complete, debe reflejarse en GitHub Projects y, si afecta a la aceptación del MVP, también en la sección correspondiente de este documento.

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
- Preparar soporte básico para polifonía y acordes.
- Definir qué se hace cuando el MIDI contiene varios tracks.
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
- Crear una sesión asociada a una pieza y una sección.
- Guardar temporalmente eventos recibidos.
- Preparar WebSocket si la latencia visual lo requiere.

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
- [ ] Se visualizan notas polifónicas básicas.
- [ ] Está definido el tratamiento de varios tracks.
- [ ] El usuario puede tocar con el teclado del ordenador.
- [ ] Las notas pulsadas aparecen en la interfaz.
- [ ] La sesión mantiene su estado básico.
- [ ] La reproducción funciona con las estructuras MIDI de prueba.

### Semana 3 — Evaluación determinista y feedback

**Objetivo:** comparar la interpretación del usuario con las notas esperadas y producir resultados medibles.

**Tareas**

- Comparar nota esperada y nota recibida.
- Detectar nota correcta, incorrecta, omitida y adicional.
- Definir tolerancia temporal.
- Calcular precisión de notas, timing y puntuación total.
- Evaluar notas simultáneas básicas.
- Detectar errores repetidos e identificar secciones débiles.
- Mostrar puntuación, errores, nota esperada, nota recibida y compás actual.
- Mostrar resumen del intento actual.
- Crear tests de interpretación exacta, adelantada, retrasada, incorrecta, omitida, adicional y de acordes básicos.
- Probar distintos tempos, compases y tracks.

**Entregable**

```text
crear sesión
  → tocar con teclado
  → comparar eventos
  → calcular puntuación
  → mostrar errores y timing
  → identificar sección débil
```

**Criterio de cierre**

- [ ] Se detectan notas correctas e incorrectas.
- [ ] Se detectan notas omitidas y adicionales.
- [ ] Existe una puntuación de timing.
- [ ] Se identifican debilidades básicas.
- [ ] La evaluación funciona sin LLM.
- [ ] Hay tests suficientes para confiar en el evaluador.

### Semana 4 — Agente pedagógico, demostración y LLM

**Objetivo:** completar el flujo pedagógico con acciones visibles, limitadas, validadas y reversibles.

**Tareas**

Implementar inicialmente la máquina de estados:

```text
START
  ↓
OBSERVING
  ↓
EVALUATING
  ↓
DECIDE_ACTION
  ├── WAITING_FOR_STUDENT
  ├── GIVING_HINT
  ├── DEMONSTRATING
  └── ACCOMPANYING
```

- Crear reglas deterministas para errores repetidos, timing bajo, buen desempeño y espera.
- Implementar `wait`, `give_hint`, `slow_down`, `demonstrate` y `return_control`.
- Implementar `accompany` si el tiempo lo permite.
- Validar lista blanca, compases, mano, tempo, repeticiones, duración, pieza y sesión.
- Seleccionar una sección débil y reproducirla a tempo reducido.
- Mostrar que la IA está actuando y permitir pausa y detención.
- Devolver automáticamente el control al estudiante.
- Crear una interfaz de proveedor LLM desacoplada.
- Mantener `MockProvider` o proveedor determinista.
- Conectar Groq y solicitar salida estructurada.
- Mantener el flujo funcional si Groq falla.
- Impedir que el LLM controle directamente MIDI.

**Criterio de cierre**

- [ ] El agente puede seleccionar una acción.
- [ ] El sistema funciona sin LLM.
- [ ] El LLM puede proponer una acción estructurada.
- [ ] Las acciones inválidas se rechazan.
- [ ] La demostración es visible y tiene duración limitada.
- [ ] El control vuelve al estudiante.
- [ ] Existen tests de validación y transiciones.

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
8. LangGraph completo.

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
6. Máquina de estados determinista
7. Acciones validadas y devolución del control
8. Integración LLM con fallback
9. Despliegue público
10. Vídeo demo y publicación en LinkedIn
11. Acompañamiento avanzado, Web MIDI, memoria y progreso
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
