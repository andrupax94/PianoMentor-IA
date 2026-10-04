# 📘 Glosario de PianoMentor AI

> Guía de referencia para comprender los conceptos, lenguajes, frameworks, formatos y herramientas utilizados en PianoMentor AI.

Este documento está pensado para acompañar el desarrollo del proyecto desde el **MVP musical** hasta la integración del agente pedagógico con IA y el frontend web.

---

## 🧭 Cómo utilizar este glosario

No es necesario aprender todos los términos antes de comenzar. La prioridad recomendada es:

1. Comprender MIDI, notas, tempo, timing y evaluación.
2. Aprender Python, FastAPI, Docker y los fundamentos del backend.
3. Comprender React, Next.js, TypeScript y la interacción del frontend.
4. Estudiar máquinas de estados, LangGraph, LLM y acciones estructuradas.
5. Profundizar en pruebas, observabilidad, licencias y despliegue.

Los términos marcados como **MVP** son especialmente importantes para las primeras seis semanas.

---

# 1. 🎯 Conceptos del producto

## PianoMentor AI

Aplicación web de mentoría musical que convierte una pieza MIDI y la interpretación del estudiante en una sesión de práctica adaptativa. El sistema analiza errores, calcula métricas y propone intervenciones como esperar, dar una pista, demostrar o acompañar.

## MVP

Significa **Minimum Viable Product**, o producto mínimo viable. Es la versión más pequeña del producto que permite demostrar su propuesta principal.

En PianoMentor AI, el MVP debe priorizar:

- carga y procesamiento de MIDI;
- reproducción de piezas;
- piano virtual;
- captura de la interpretación;
- evaluación de notas y timing;
- intervención pedagógica de la IA;
- devolución visible del control al estudiante.

## Objetivo SMART

Objetivo que es **Specific, Measurable, Achievable, Relevant and Time-bound**: específico, medible, alcanzable, relevante y temporalizado.

El objetivo del proyecto fija seis semanas, un corpus de 15 piezas MIDI y un mínimo de procesamiento correcto del 80 %.

## Corpus de validación

Conjunto controlado de piezas MIDI que se utiliza para medir el funcionamiento del sistema. Cada pieza debe tener identificador, procedencia, licencia y resultado de procesamiento.

El corpus no representa todas las canciones existentes. Sirve para evaluar de forma reproducible el MVP.

## Dominio público

Obra cuyos derechos de autor han expirado o que nunca estuvieron protegidos por copyright. La composición puede ser de dominio público, pero una transcripción MIDI concreta puede tener derechos propios.

## Licencia compatible

Permiso legal que autoriza utilizar, modificar o redistribuir un archivo MIDI en las condiciones indicadas por su licencia. Conviene registrar la fuente y la licencia de cada archivo.

## Agente pedagógico

Componente que observa el estado de la práctica, interpreta las métricas y decide una intervención educativa. No es un chatbot genérico: trabaja con una pieza, una interpretación y un estado de aprendizaje.

## Control del piano

Estado que indica si el piano está controlado por el estudiante, por la IA o de forma compartida. Debe ser visible, limitado y reversible.

---

# 2. 🎼 Música y MIDI

## MIDI

**Musical Instrument Digital Interface**. Es un protocolo y formato de eventos musicales. MIDI no contiene una grabación de audio; describe qué nota se toca, cuándo empieza, cuánto dura y con qué intensidad.

Un archivo MIDI puede contener eventos como:

- nota pulsada (`note_on`);
- nota liberada (`note_off`);
- velocidad (`velocity`);
- tempo;
- cambios de instrumento;
- información de compás;
- cambios de control.

**Importancia para el proyecto:** MIDI permite comparar de forma precisa las notas esperadas con las notas interpretadas por el estudiante.

## Archivo `.mid` o `.midi`

Archivo que contiene eventos MIDI y normalmente puede incluir varios tracks, canales, tempos y configuraciones musicales.

No debe tratarse como un archivo de audio. Para reproducirlo se necesita un sintetizador, un instrumento virtual o un motor de audio.

## Track MIDI

Secuencia de eventos dentro de un archivo MIDI. Una pieza puede tener tracks separados para mano izquierda, mano derecha, melodía, acompañamiento u otros instrumentos.

## Canal MIDI

Cada evento MIDI puede pertenecer a uno de los canales disponibles. Los canales ayudan a distinguir instrumentos o partes, aunque no siempre representan directamente la mano izquierda o derecha.

## Nota MIDI

Evento musical identificado principalmente por un número de tono, un instante de inicio, una duración y una velocidad.

Ejemplo conceptual:

```json
{
  "pitch": 60,
  "start": 2.48,
  "duration": 0.52,
  "velocity": 82
}
```

## Pitch

Número MIDI que representa la altura de una nota. Por ejemplo, el pitch 60 suele corresponder a C4 en la convención habitual.

## Nombre de nota

Representación legible del pitch, como `C4`, `Do4` o `Mi5`. El sistema puede guardar tanto el número MIDI como el nombre.

## `note_on`

Evento que indica que una nota comienza. En algunos archivos, un `note_on` con velocidad cero equivale funcionalmente a un `note_off`.

## `note_off`

Evento que indica que una nota termina.

## Velocity

Intensidad asociada a una nota MIDI. No es exactamente el volumen final, pero normalmente se utiliza para representar la fuerza con la que se pulsa una tecla.

## Tick

Unidad temporal interna de muchos archivos MIDI. Los ticks no son segundos; deben convertirse utilizando la resolución del archivo y el tempo.

## PPQ / Pulses Per Quarter Note

Resolución temporal que indica cuántos ticks representa una negra. También puede aparecer como `ticks_per_beat`.

## Tempo / BPM

Velocidad musical expresada normalmente en **beats per minute**. Un BPM de 60 equivale aproximadamente a un beat por segundo.

## Compás / Measure

Unidad estructural de una pieza musical. Para practicar, el sistema debe poder seleccionar rangos como los compases 12 a 16.

## Time signature / Signatura de compás

Indica cuántos tiempos contiene un compás y qué figura representa un tiempo, por ejemplo 4/4 o 3/4.

## Polifonía

Presencia de varias notas simultáneas. El piano es un instrumento polifónico, por lo que el evaluador debe poder gestionar acordes y notas superpuestas.

## Monofonía

Música en la que normalmente suena una sola nota a la vez. Es más sencilla de evaluar que una interpretación polifónica.

## Normalización MIDI

Proceso de convertir archivos MIDI con estructuras diferentes a una representación interna común: notas, tiempos, duraciones, tracks, tempo, compases y metadatos.

## Separación de manos

Proceso de inferir qué notas corresponden a la mano izquierda y cuáles a la derecha. Puede basarse en tracks, canales, rango de pitches o reglas heurísticas.

No siempre es fiable y por eso debe tratarse como una capacidad progresiva.

## Cuantización

Ajuste de eventos a una rejilla temporal. Puede ayudar a limpiar un MIDI, pero si se aplica de forma agresiva puede eliminar matices de timing.

## Reproducción MIDI

Conversión de los eventos MIDI en sonido o en animaciones visuales. En PianoMentor AI, el motor determinista debe controlar el orden y el tiempo de los eventos.

## Motor musical determinista

Código que realiza parsing, reproducción, comparación de notas y cálculos de timing de forma predecible. No debe depender de una respuesta probabilística del LLM.

---

# 3. 🎧 MIDI frente a audio

## Audio digital

Representación de una señal sonora mediante muestras. Un archivo de audio contiene el sonido grabado o sintetizado, no necesariamente la información exacta de qué tecla se pulsó.

## `.mp3`

Formato de audio comprimido con pérdida. Es apropiado para escuchar una interpretación, pero no es el formato principal del MVP porque no proporciona directamente las notas MIDI ni sus timestamps exactos.

## `.wav`

Formato de audio normalmente sin compresión o con compresión mínima. Tiene más fidelidad que MP3, pero sigue siendo audio: para extraer notas habría que realizar transcripción automática, una funcionalidad fuera del MVP inicial.

## `.ogg` / `.webm`

Formatos de audio comprimido utilizados habitualmente en aplicaciones web. Pueden ser útiles para recursos sonoros, pero no sustituyen al MIDI para la evaluación de notas.

## Transcripción de audio a MIDI

Proceso de inferir notas, tiempos y duraciones a partir de una grabación. Es técnicamente complejo y está fuera del alcance inicial del MVP.

## Sintetizador

Software o hardware que convierte eventos MIDI en sonido. El frontend puede utilizar un sintetizador web o un instrumento virtual para reproducir las notas.

## Audio API / Web Audio API

API del navegador para generar, procesar y reproducir audio. Puede utilizarse para el piano virtual y la reproducción, pero no debe sustituir la lógica de evaluación MIDI.

---

# 4. 🐍 Lenguajes y backend

## Python

Lenguaje principal del backend. Se utilizará para el dominio musical, la evaluación, la API, el agente y las pruebas.

## FastAPI

Framework web de Python para crear APIs rápidas y tipadas. Genera documentación OpenAPI y funciona bien con modelos Pydantic y operaciones asíncronas.

## Pydantic

Biblioteca utilizada para definir y validar modelos de datos en Python. Es apropiada para piezas MIDI, sesiones, evaluaciones y acciones del agente.

## Type hints

Anotaciones de tipos de Python como `str`, `int`, `float` o `list[str]`. Ayudan a documentar contratos y detectar errores.

## DTO / Data Transfer Object

Objeto utilizado para transportar datos entre capas, por ejemplo entre la API y el dominio. Un DTO no debería contener lógica musical compleja.

## API

**Application Programming Interface**. Contrato que permite que dos componentes se comuniquen. En el proyecto, el frontend se comunica con el backend mediante HTTP y, cuando sea necesario, WebSocket.

## Endpoint

Ruta concreta de una API, como `POST /pieces` o `GET /sessions/{session_id}/state`.

## HTTP

Protocolo utilizado para las peticiones web. Se empleará para cargar MIDI, crear sesiones, consultar estados y ejecutar acciones.

## REST

Estilo de diseño de APIs basado en recursos y operaciones HTTP. Las piezas y sesiones pueden exponerse como recursos REST.

## WebSocket

Conexión persistente y bidireccional entre cliente y servidor. Puede utilizarse para enviar en tiempo real el estado de la sesión, las notas y las acciones del agente.

## OpenAPI

Especificación que describe una API. FastAPI puede generar automáticamente una documentación interactiva a partir de los modelos y endpoints.

## JSON

Formato de texto para intercambio de datos estructurados. Se utilizará para respuestas de la API, estados de sesión y acciones del agente.

## JSON Schema

Esquema que define qué campos, tipos, valores y límites puede tener un JSON. Se utilizará para validar las acciones propuestas por la IA.

## Async / asincronía

Modelo de ejecución que permite atender operaciones sin bloquear todo el proceso. Es útil para APIs y WebSockets, pero la reproducción musical sensible al tiempo debe diseñarse con cuidado.

## Latencia

Tiempo transcurrido entre una entrada y su respuesta. En música, una latencia alta entre la pulsación y la respuesta visual o sonora perjudica la experiencia.

## CORS

Mecanismo de seguridad del navegador que controla qué orígenes pueden llamar a una API. Será necesario configurarlo si frontend y backend se ejecutan en puertos o dominios distintos.

## SQLite

Base de datos relacional ligera almacenada en un archivo. Es adecuada para la persistencia local del MVP.

## PostgreSQL

Base de datos relacional más completa para entornos compartidos o producción. Puede sustituir a SQLite en una fase posterior.

## Filesystem

Sistema de archivos local. Durante el MVP se utilizará para guardar temporalmente los archivos MIDI.

## S3 / almacenamiento de objetos

Modelo de almacenamiento para archivos en servicios como Amazon S3 o Cloudflare R2. Puede sustituir al filesystem local cuando el proyecto escale.

---

# 5. 🌐 Frontend web

## Frontend

Parte de la aplicación que ve y utiliza el estudiante en el navegador.

## Backend

Parte del sistema que procesa datos, aplica reglas, mantiene sesiones y expone la API.

## React

Biblioteca de JavaScript para construir interfaces mediante componentes reutilizables.

## Next.js

Framework basado en React que añade enrutamiento, estructura de aplicación, renderizado y herramientas de desarrollo. Es la opción prevista para el frontend web.

## TypeScript

Superset de JavaScript que añade tipado estático. Ayuda a detectar errores en eventos MIDI, respuestas de API y estados de interfaz.

## Componente

Unidad reutilizable de interfaz. Ejemplos: teclado virtual, panel de métricas, selector de compases o indicador de control.

## Estado del frontend

Datos que determinan lo que se muestra en pantalla, como la pieza activa, el compás, las notas pulsadas y el modo del agente.

## Canvas

Elemento del navegador para dibujar gráficos dinámicos. Puede utilizarse para falling notes y visualizaciones musicales.

## SVG

Formato vectorial que permite construir gráficos mediante elementos XML. Puede ser útil para un teclado virtual y elementos interactivos.

## Falling notes

Visualización de notas que descienden hacia el teclado siguiendo el tiempo de reproducción. Es una representación visual, no el motor musical en sí.

## Tone.js

Biblioteca JavaScript orientada a música y audio web. Puede ayudar con transporte, sincronización y síntesis, siempre manteniendo la evaluación dentro de una arquitectura controlada.

## Web MIDI API

API del navegador para comunicarse con dispositivos MIDI físicos. Requiere permisos del usuario y normalmente un contexto seguro HTTPS.

## Teclado de ordenador

Entrada inicial prevista para probar el piano virtual sin depender de hardware MIDI.

# 6. 🤖 IA, agentes y LangGraph

## Inteligencia artificial

Conjunto de técnicas que permiten a un sistema realizar tareas que normalmente requieren interpretación, decisión o generación humana. En este proyecto se utiliza para adaptar la enseñanza y generar feedback.

## LLM

**Large Language Model**. Modelo de lenguaje capaz de interpretar contexto y generar texto o datos estructurados. El LLM no debe controlar directamente MIDI.

## Proveedor LLM

Servicio que ofrece acceso a un modelo de lenguaje. El proveedor inicial previsto es Groq mediante una API compatible con OpenAI.

## API compatible con OpenAI

Interfaz que utiliza formatos y métodos similares a los de la API de OpenAI. Facilita sustituir un proveedor por otro mediante una abstracción común.

## Groq

Proveedor de inferencia de modelos de lenguaje. En el MVP se utiliza como proveedor inicial detrás de una interfaz desacoplada.

## `openai/gpt-oss-20b`

Modelo configurado inicialmente para las decisiones y explicaciones de alto nivel del agente.

## Prompt

Instrucción y contexto enviados al LLM. En PianoMentor AI, el prompt debe incluir el estado relevante de la sesión y pedir una respuesta estructurada y limitada.

## Salida estructurada

Respuesta del LLM que cumple un esquema definido, por ejemplo una acción con tipo, mano, compases, tempo y motivo.

## Tool calling

Mecanismo mediante el cual un modelo solicita una herramienta con argumentos estructurados. La solicitud debe validarse antes de ejecutar cualquier operación.

## LangGraph

Framework para construir flujos de agentes mediante nodos, estados y transiciones. Es adecuado para orquestar observación, evaluación, decisión e intervención, pero no para enviar cada evento MIDI en tiempo real.

## Grafo de estados

Estructura en la que cada nodo representa una etapa del proceso y cada transición define el siguiente paso.

## Máquina de estados

Modelo explícito con estados permitidos y transiciones controladas. Se recomienda implementarla antes de añadir complejidad de LangGraph.

## Estado de sesión

Información estructurada de una práctica: pieza, compás, intentos, métricas, puntos débiles, tempo, modo del agente y última acción.

## Fallback

Comportamiento alternativo cuando un componente falla o no está disponible. El fallback del proyecto debe utilizar reglas deterministas si el LLM no responde.

## Acción del agente

Dato estructurado que expresa una intervención, por ejemplo `demonstrate` o `give_hint`. No debe ser código ejecutable.

## Lista blanca / Allowlist

Conjunto de acciones permitidas. Si una acción no pertenece a la lista blanca, debe rechazarse.

## Intervención reversible

Acción con principio y final claros que puede detenerse y devuelve el control al estudiante.

## Human-in-the-loop

Diseño en el que una persona conserva supervisión y control sobre acciones relevantes. En este proyecto, el estudiante debe saber cuándo la IA toca y cuándo recupera el piano.

## Observabilidad

Capacidad de saber qué está ocurriendo dentro del sistema. Incluye logs, métricas y trazas, sin registrar datos sensibles innecesarios.

## LangSmith

Herramienta de trazabilidad y evaluación para flujos con LLM. Debe registrar decisiones de alto nivel, no cada evento `note_on` o `note_off`.

---

# 7. 🧪 Evaluación y calidad

## Precisión de notas

Porcentaje o puntuación de notas ejecutadas correctamente respecto a las notas esperadas.

## Nota omitida

Nota esperada que el estudiante no tocó dentro de la tolerancia definida.

## Nota adicional

Nota que el estudiante tocó pero que no estaba prevista en ese momento.

## Timing

Relación temporal entre el instante esperado de una nota y el instante real en que fue tocada.

## Tolerancia temporal

Margen aceptable de adelanto o retraso. Debe estar documentado y puede variar según el tempo o el nivel de dificultad.

## Error adelantado

Nota tocada antes del instante esperado.

## Error retrasado

Nota tocada después del instante esperado.

## Score / Puntuación

Valor numérico que resume una métrica, como precisión de notas o timing. Debe ser interpretable y consistente.

## Fixture

Dato de prueba preparado manualmente. Por ejemplo, una pieza MIDI pequeña y una secuencia de notas correctas, omitidas o retrasadas.

## Test unitario

Prueba que verifica una unidad pequeña de código, como una función que convierte ticks a segundos.

## Test de integración

Prueba que verifica la interacción entre varios componentes, como API, dominio y almacenamiento.

## Test end-to-end

Prueba que simula el flujo completo desde la carga del MIDI hasta la intervención de la IA.

## Pytest

Framework de pruebas para Python. Se utilizará para validar parsing, evaluación, estados, acciones y endpoints.

## Regresión

Error que reaparece o se introduce después de modificar el código. Las pruebas automatizadas ayudan a prevenir regresiones.

## Definition of Done

Condiciones que deben cumplirse para considerar terminada una funcionalidad. Debe incluir implementación, pruebas, documentación y verificación.

---

# 8. 🐳 Docker, configuración y despliegue

## Docker

Plataforma para empaquetar una aplicación junto con su entorno y dependencias. Ayuda a que el proyecto sea reproducible en distintos ordenadores.

## Imagen Docker

Plantilla inmutable con el sistema, runtime, dependencias y archivos necesarios para ejecutar una aplicación.

## Contenedor

Instancia en ejecución de una imagen Docker.

## Dockerfile

Archivo de instrucciones para construir una imagen Docker. Debe aprovechar la caché copiando primero los archivos de dependencias.

## Docker Compose

Herramienta para definir y ejecutar varios servicios relacionados. En el MVP puede coordinar backend, base de datos y servicios auxiliares.

## Healthcheck

Comprobación automática para saber si un servicio está disponible, por ejemplo una petición a `/health`.

## Dependencia

Biblioteca externa que necesita el proyecto. En Python suelen declararse en `requirements.txt` o `pyproject.toml`.

## `pyproject.toml`

Archivo moderno para configurar un proyecto Python, sus dependencias, herramientas y metadatos.

## `requirements.txt`

Archivo que enumera dependencias Python instalables mediante pip.

## `.env`

Archivo local de variables de entorno, como claves API. No debe subirse al repositorio.

## `.env.example`

Plantilla sin secretos que documenta qué variables necesita el proyecto.

## Variable de entorno

Valor proporcionado por el entorno de ejecución, por ejemplo `GROQ_API_KEY` o `DATABASE_URL`.

## Secreto

Credencial sensible como una API key, token o contraseña. Nunca debe incluirse en el README, commits, imágenes Docker o logs.

## Desarrollo local

Ejecución del sistema en el ordenador del desarrollador para implementar y probar funcionalidades.

## Producción

Entorno en el que la aplicación se ofrece a usuarios reales. Requiere mayor control de seguridad, disponibilidad y almacenamiento.

## CI/CD

**Continuous Integration / Continuous Delivery**. Automatización de pruebas, construcción y publicación del software. GitHub Actions puede utilizarse en fases posteriores.

---

# 9. 🌿 Git y GitHub

## Git

Sistema de control de versiones que registra cambios en los archivos del proyecto.

## GitHub

Servicio de alojamiento de repositorios Git y colaboración.

## Repositorio

Carpeta controlada por Git que contiene el código, documentación e historial del proyecto.

## Commit

Registro permanente de un conjunto de cambios. Debe tener un mensaje descriptivo.

## Rama / Branch

Línea de desarrollo independiente. La rama principal del proyecto es `main`.

## Remote / Remoto

Referencia a un repositorio externo, normalmente llamado `origin`.

## Push

Envío de commits locales al repositorio remoto.

## Pull

Descarga de cambios del repositorio remoto.

## Pull Request

Propuesta de cambios para revisar y fusionar una rama en otra.

## `.gitignore`

Archivo que indica qué archivos no deben incluirse en Git, como `.env`, bases de datos locales o archivos temporales.

## Commit de documentación

Commit que modifica README, guías, planes o comentarios sin cambiar la lógica de ejecución.

---

# 10. 🧱 Arquitectura del proyecto

## Dominio

Núcleo de reglas del negocio. En este proyecto incluye notas, piezas, timing, evaluaciones, sesiones y acciones pedagógicas.

## Capa de aplicación

Coordina casos de uso, por ejemplo cargar una pieza, evaluar un intento o ejecutar una acción validada.

## Infraestructura

Detalles externos como Mido, SQLite, filesystem, proveedores LLM o LangSmith.

## Adaptador

Componente que traduce una interfaz del dominio a una tecnología externa. Por ejemplo, un adaptador para Groq o para SQLite.

## Caso de uso

Operación que el usuario o el sistema puede realizar, como `LoadPiece`, `EvaluateAttempt` o `DemonstrateSection`.

## Inversión de dependencias

Principio que permite que el dominio dependa de interfaces y no de proveedores concretos. Facilita sustituir Groq, SQLite o el motor MIDI.

## Acoplamiento

Grado en que un módulo depende de otro. Un acoplamiento bajo facilita pruebas y evolución.

## Cohesión

Grado en que las responsabilidades de un módulo están relacionadas. Cada módulo debe tener un propósito claro.

## Contrato

Definición explícita de los datos, límites y comportamientos esperados entre componentes.

## Separación de responsabilidades

Regla que evita mezclar interfaz, reproducción MIDI, evaluación y razonamiento del LLM en el mismo código.

---

# 11. 🛡️ Seguridad, privacidad y legalidad

## Validación de entrada

Comprobación de que un archivo, evento o acción tiene el formato y los límites esperados antes de procesarlo.

## Sanitización

Tratamiento de una entrada para eliminar o neutralizar contenido peligroso o inesperado.

## Timeout

Límite máximo de tiempo que una operación puede ejecutarse. Es obligatorio para evitar acciones indefinidas del agente.

## Privacidad

Protección de los MIDI y datos de práctica del estudiante. Durante el MVP, los archivos deben tratarse como privados.

## Mínimo privilegio

Principio según el cual cada componente solo debe tener los permisos que necesita.

## Prompt injection

Intento de manipular las instrucciones del agente mediante contenido introducido en una entrada. Las acciones estructuradas y la validación determinista reducen este riesgo.

## Datos sensibles

Información que no debe enviarse a proveedores externos sin necesidad, como claves, datos personales o contenido privado del usuario.

## Procedencia

Registro de dónde procede un archivo o dato. Es importante para documentar las fuentes de MIDI y sus licencias.

---

# 12. 🗺️ Términos por fase del proyecto

## Fase 1 — Núcleo musical

Términos prioritarios: MIDI, track, canal, nota, pitch, velocity, tick, PPQ, tempo, compás, normalización, reproducción y motor determinista.

**Resultado esperado:** una pieza MIDI se carga, se interpreta internamente y se reproduce.

## Fase 2 — Evaluación

Términos prioritarios: evento esperado, evento recibido, timing, tolerancia, nota omitida, nota adicional, precisión, score y fixture.

**Resultado esperado:** el sistema puede comparar una interpretación con la pieza esperada.

## Fase 3 — Agente básico

Términos prioritarios: estado, transición, máquina de estados, acción, lista blanca, validación, timeout, fallback y devolución del control.

**Resultado esperado:** el sistema decide intervenciones básicas sin depender todavía de un LLM para funcionar.

## Fase 4 — API y frontend

Términos prioritarios: FastAPI, endpoint, REST, WebSocket, JSON, OpenAPI, React, Next.js, TypeScript, componente y estado del frontend.

**Resultado esperado:** el usuario puede completar una sesión desde el navegador.

## Fase 5 — LangGraph y LLM

Términos prioritarios: LLM, prompt, salida estructurada, JSON Schema, LangGraph, proveedor, tool calling, observabilidad y LangSmith.

**Resultado esperado:** la IA interpreta el estado de la sesión y propone una acción pedagógica validada.

## Fase 6 — Calidad y entrega

Términos prioritarios: Docker, Docker Compose, healthcheck, pytest, test de integración, test end-to-end, CI/CD, Git, GitHub, licencia y documentación.

**Resultado esperado:** el proyecto puede ejecutarse, probarse y explicarse de forma reproducible.

---

# 13. ✅ Ideas clave para recordar

1. **MIDI no es audio:** MIDI describe eventos musicales; MP3 y WAV contienen sonido.
2. **El código determinista controla el tiempo:** el LLM no debe enviar `note_on` ni controlar el reloj.
3. **La IA propone, el sistema valida:** ninguna acción del agente se ejecuta directamente.
4. **El estudiante conserva el control final:** toda demostración debe terminar y devolver el control.
5. **La evaluación debe ser medible:** precisión, notas omitidas, notas adicionales y timing deben tener reglas claras.
6. **El MVP necesita un corpus definido:** no se debe prometer compatibilidad universal con todas las canciones MIDI.
7. **Docker mejora la reproducibilidad:** el mismo entorno debe poder levantarse en otros equipos.
8. **Las pruebas son parte del producto:** especialmente para parsing, timing, validación y estados.
9. **La interfaz debe mostrar el estado:** el usuario debe saber si observa, practica, recibe una pista o está viendo una demostración.
10. **La arquitectura debe permitir sustituciones:** Groq, SQLite, filesystem y el frontend pueden evolucionar sin reescribir el dominio musical.

---

## 📚 Documentos relacionados

- [README del proyecto](README.md)
- [Plan de trabajo de seis semanas](PLAN.md)

