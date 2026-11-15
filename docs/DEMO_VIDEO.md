# Guion y producción del vídeo demo (B-024.1)

**Issue:** [B-024.1](https://github.com/andrupax94/PianoMentor-IA/issues/127) · padre [B-024](https://github.com/andrupax94/PianoMentor-IA/issues/26)
**Estado:** guion v1 (2026-11-15) · pendiente de ensayo cronometrado
**Formato:** 4:00–4:22 · 1920×1080 · 30 fps · español con subtítulos ES quemados + SRT EN

> Regla que manda sobre todas: **si no se ve en pantalla, no se dice**. Cada afirmación
> tiene su fila en la tabla `claim → evidencia`.

## 1. Ficha

| Campo | Valor |
|---|---|
| Audiencia | Mixta LinkedIn: producto primero, técnica después |
| Voz | Off, salvo intro y cierre a cámara |
| Tono | Formal y humano; primera persona; cero marketing |
| Duración objetivo | 4:10 (techo 4:22) |
| Captura | OBS 1080p30, MKV + remux, audio en pistas separadas |
| Edición | Clipchamp (o Shotcut offline) |
| Subtítulos | ES quemados, SRT EN aparte |

## 2. Narración

Leída a ~135 palabras por minuto. `[CARA]`, `[PANTALLA]` y `[OFF]` indican el plano.

### 0:00–0:05 · Frío, sin voz

*Piano sonando, cascada cayendo, gates.*
**Texto en pantalla:** `La IA no improvisa.`

### 0:05–0:30 · [CARA] Intro

> Esta es una app para practicar piano con un mentor de IA. Lo fácil es que suene. Lo difícil es que sepa qué has tocado mal, decida qué hacer y no dependa de que un modelo de lenguaje conteste a tiempo. La IA no improvisa: decide con reglas en milisegundos, habla con un LLM y sigue funcionando sin él.

### 0:30–0:45 · [PANTALLA: D1]

> Por dentro son cinco piezas: un motor MIDI determinista, una API en FastAPI, un WebSocket que lleva el estado en tiempo real, un frontend en Next.js y un LLM que solo entra donde no hay prisa.

### 0:45–1:20 · [PANTALLA: biblioteca y reproducción]

> Empiezo por la biblioteca: dieciocho piezas con licencia compatible, con portada, compositor y metadatos. Elijo el Minueto de Bach y lo mando al piano. La cascada marca lo que viene, el teclado se ilumina mientras suena la música, no antes, y el transporte comparte un único reloj con la sesión. Ese detalle costó: antes había dos relojes y el compás salía vacío. Ahora la posición es la misma para todo.

### 1:20–2:10 · [PANTALLA: práctica]

> Aquí está el núcleo. Elijo una mano o las dos, y activo el modo espera. El transporte no avanza hasta que toco la nota que toca. Si fallo dos veces el mismo compás, baja el tempo. A la tercera, me da una pista. Y si me quedo en silencio, no me arrebata el piano: me ofrece una demostración. Acepto, la IA toca ese compás, y al terminar el control vuelve a mí, en el compás exacto donde lo dejé. Las intervenciones las decide el servidor con reglas, en milisegundos. El LLM no está en ese bucle.

### 2:10–2:50 · [PANTALLA: chat]

> El chat es la otra cara. Le pido en lenguaje natural que ponga el minueto de Bach. No tiene permitido inventar: solo puede llamar a doce funciones que ya existen. Busca la pieza, lee el resultado y la reproduce. Si le pido algo que no puedo hacer, lo dice. Y si Groq falla, pasa a Gemini; si ninguno responde, hay un modo determinista que mantiene la demo en pie.

### 2:50–3:20 · [PANTALLA: informe]

> Al terminar, el informe no lo escribe el modelo: lo calcula el motor. Compases, teclas equivocadas, notas que llegaron tarde, intervenciones. El LLM solo lo traduce a lenguaje de profesor. Esto también tuvo un bug incómodo: el resumen llamaba «notas» a las paradas de espera, y la interpretación salía sobre una métrica mal etiquetada. Lo arreglé separando unidades y cerrando la sesión antes de informar.

### 3:20–3:55 · [PANTALLA: D2, D3 y D4 · OFF]

> Tres cosas me costaron más de lo que parece. Una: dos relojes. La sesión medía el tiempo desde la primera tecla y el transporte desde play. Los unifiqué en uno solo. Dos: la latencia. Un LLM no puede decidir en tiempo real, así que las decisiones pedagógicas son reglas y el modelo solo habla. Tres: la confianza en los datos. Antes de creer un informe, instrumenté el canal para saber cuántas señales se emitían y cuántas se guardaban.

### 3:55–4:15 · [CARA] Cierre

> Lo que falta lo digo claro: entrada por micrófono, MIDI por hardware y persistencia real de las subidas. Lo que hay está probado, con más de mil tests entre backend y frontend, y funciona sin clave de IA. El código y la demo están abajo.

### 4:15–4:22 · Tarjeta final, sin voz

`PianoMentor AI · pianomentoria.com · github.com/andrupax94/PianoMentor-IA`

### Cortes si se pasa de tiempo

- «…con portada, compositor y metadatos» → queda «dieciocho piezas con licencia compatible».
- La frase de los dos relojes en la biblioteca → ya se cuenta en D2.

## 3. Shot list

| # | Tiempo | Escena | Entorno | Acciones | En pantalla |
|---|---|---|---|---|---|
| 1 | 0:00–0:05 | Frío | Prod | Pieza p01 sonando, cascada y gates | Rótulo `La IA no improvisa.` |
| 2 | 0:05–0:30 | Intro | Cámara | Plano medio, fondo navy | — |
| 3 | 0:30–0:45 | Arquitectura | D1 | Animación de nodos | D1 |
| 4 | 0:45–1:00 | Biblioteca | Prod | Scroll, hover, seleccionar Minueto | — |
| 5 | 1:00–1:20 | Piano | Prod | Play, tempo, compás, teclas que se iluminan | Rótulo «un solo reloj» |
| 6 | 1:20–1:45 | Práctica | Prod | Abrir sesión, modo dos manos, modo espera | — |
| 7 | 1:45–2:10 | Intervención | Prod | Fallo ×2, pista, oferta, demo, control | Rótulos `slow_down`, `pista`, `oferta` |
| 8 | 2:10–2:30 | Chat: orden | Prod | «Pon el minueto de Bach» | — |
| 9 | 2:30–2:50 | Chat: límite | Prod | Pedir algo fuera de la lista | Rótulo «12 funciones» |
| 10 | 2:50–3:10 | Informe | Prod | Chip de informe, interpretación | — |
| 11 | 3:10–3:20 | Dev | Local | Robot y panel Depurar | Rótulo `entorno de desarrollo` |
| 12 | 3:20–3:55 | Tres tarjetas | D2–D4 | Animaciones | D2, D3, D4 |
| 13 | 3:55–4:15 | Cierre | Cámara | Plano medio | — |
| 14 | 4:15–4:22 | Tarjeta final | Gráfico | Fade | Enlaces |

## 4. Diagramas

Esta sección es el brief para el agente que produzca los diagramas. **No se inventa
ningún nodo, texto ni cifra**: todo lo que aparece está aquí.

### 4.1 Reglas visuales comunes

| Campo | Valor |
|---|---|
| Lienzo | 1920×1080 (16:9), margen seguro 120 px, rejilla 8 px |
| Entrega | SVG editable + PNG 2× con fondo `#0c1829` + PNG con alfa |
| Fondo | `--bg #0c1829`, superficies `#12203a` / `#172338` |
| Texto | `#e8eefb`; secundario `#aeb9d0`; apagado `#7f8ca6` |
| Oro | `#f5a623` / `#f5c04a` (solo énfasis y resultado) |
| Azul acero | `#83a9d2` (conexiones neutras) |
| Violeta IA | `#b388ff` (solo el LLM y la mano de la IA) |
| Tipografía | Gabriola solo en el título del diagrama; Manrope en todo lo demás |
| Tamaños | Título 64 px · nodo 32 px · etiqueta 22 px · nota 18 px |
| Trazo | 2 px; nodos con radio 16 px; sin sombras duras |
| Movimiento | Fade + 8 px de desplazamiento, 250 ms, stagger 120 ms; sin rebotes |
| Prohibido | Tema claro, identidad «Acoustic Intelligence» de Stitch, 3D, iconos genéricos, texto en inglés, cifras inventadas |

### 4.2 Resumen

| ID | Momento | Propósito | En pantalla |
|---|---|---|---|
| D1 | 0:30–0:45 | Arquitectura en cinco piezas | 15 s |
| D2 | 3:20–3:33 | Dos relojes → un reloj | 13 s |
| D3 | 3:33–3:45 | Decisión sin LLM | 12 s |
| D4 | 3:45–3:55 | Confianza en los datos | 10 s |
| D5 | opcional | Modo espera y gates | — |

### 4.3 D1 — Arquitectura

**Título:** `Cinco piezas, un solo reloj`

**Nodos, de izquierda a derecha:**

1. `Motor MIDI` — subtítulo `determinista` — nota `parseo · tempo · rejilla · evaluación`
2. `FastAPI` — nota `sesión · reglas · persistencia`
3. `WebSocket` — barra vertical estrecha — nota `estado en tiempo real`
4. `Next.js` — nota `piano · cascada · transporte`
5. `LLM` — subtítulo `Groq → Gemini → Mock` — **debajo**, con trazo discontinuo y violeta

**Conexiones y etiquetas:**

- Motor MIDI → FastAPI: `notas, compases`
- Next.js ↔ WebSocket ↔ FastAPI: `posición 4 Hz` (ida) y `decisiones` (vuelta)
- FastAPI → LLM (discontinua): `solo chat e interpretación`
- FastAPI → chip inferior `SQLite · R2`: `señales, decisiones`

**Llamada en oro, abajo a la derecha:** `El LLM no toca el reloj ni el audio.`

**No incluir:** logos de tecnología, versiones, cifras de latencia, flechas de audio.

### 4.4 D2 — Dos relojes → un reloj

**Título:** `Dos relojes se convierten en uno`

**Composición, en tres tiempos:**

1. Arriba, línea apagada: `session-clock · ancla en la primera tecla`
2. Abajo, línea apagada: `transporte · ancla en play()`
3. Las dos líneas se separan; en la separación, un marcador `compás: —`

Después, ambas colapsan en una sola línea oro:

- `TransportProvider · useTransport`
- Fórmula en Manrope: `t_s = position_s × tempoFactor`
- Pie: `Mismo reloj para el piano y para la sesión.`

**Evidencia, esquina inferior:** `B-032.2` (18 px, apagado).

### 4.5 D3 — Decisión sin LLM

**Título:** `La IA decide sin LLM`

**Bucle principal, en el sentido de las agujas:**

`Nota del alumno` → `WebSocket` → `practice_rules` → `agent_action` → `el navegador ejecuta` → vuelve al alumno.

**Tres ramas que salen de `practice_rules`:**

| Condición | Acción |
|---|---|
| `2 fallos en el compás` | `slow_down` |
| `3 fallos en el compás` | `give_hint` |
| `silencio en el gate` | `offer_demo` |

**Carril aparte, abajo, discontinuo y violeta:** `LLM · chat e interpretación`,
con una llave grande y el rótulo `fuera del bucle`.

**Llamada en oro:** `Decisiones en milisegundos. El modelo solo habla.`

**Evidencia:** `B-032.6 · B-032.7 · ADR 0008`.

### 4.6 D4 — Confianza en los datos

**Título:** `Antes de creer el informe`

**Embudo, de izquierda a derecha:**

`señal emitida` → `validada` → `persistida` → `informe`

- Contadores como fichas, **sin cifras inventadas**: `received` · `persisted` · `lost`
- Un punto se sale del embudo, etiquetado `lost`
- Puerta antes del informe: `sesión finished`; si sigue viva → `409 session_not_finished`

**Pie:** `El informe solo cuenta lo que se guardó.`

**Evidencia:** `B-033.8`.

### 4.7 D5 — Modo espera (opcional)

Solo si sobra tiempo en la edición. Línea de transporte que avanza, gate que se
congela, tecla esperada, y dos salidas: `acierto` (sigue) y `fallo` (cuenta). Margen
de cuenta atrás visible. Evidencia: `B-032.5`.

### 4.8 Brief para el agente de diagramas

> Necesito cuatro diagramas SVG para un vídeo técnico de PianoMentor AI. Lee
> `docs/DEMO_VIDEO.md`, sección 4, y respeta exactamente los nodos, textos, colores
> y estructura. Entrega SVG editable 1920×1080, PNG 2× con fondo `#0c1829` y PNG con
> alfa. No inventes nodos, cifras ni textos. No uses tema claro ni la identidad
> «Acoustic Intelligence» de Stitch. Escribe los textos en español tal como aparecen.
> Si usas Mermaid para borrador, la entrega final debe ser SVG.

## 5. Claim → evidencia

| Claim del vídeo | Evidencia |
|---|---|
| 18 piezas con licencia compatible | `data/midi/catalog.json` (18 entradas) |
| Cascada, teclado y modos | `PlaybackArea`, `Keyboard`, B-007.3/B-032.9 |
| Un solo reloj para piano y sesión | `TransportProvider`, `useTransport`, B-032.2 |
| El modo espera no avanza sin la tecla | `playback-engine.ts`, B-032.5 |
| 2 fallos → bajar tempo; 3 → pista | `practice_rules.py`, B-032.6 |
| La demo se ofrece y el control vuelve | ADR 0008, `agent.py`, `agent-offer.ts`, B-032.7 |
| Doce funciones en lista blanca | `tools.py` (`REGISTRY`), `test_agent.py` |
| Groq → Gemini → Mock | `llm.py` (`MockProvider`) |
| Informe determinista + interpretación | `practice_report.py`, `session-interpretation.ts`, B-033.3/B-033.4 |
| Sesión terminal e informe final | B-033.8 (`finished`, `?final=true`) |
| Contadores recibidas / persistidas | `practice_channel.py`, B-033.8 |
| «Paradas de espera» ≠ notas totales | `session-interpretation.ts` (revisión B-033.8) |
| Funciona sin clave de IA | `MockProvider` |
| Más de mil tests | **Verificar la cifra el día de la grabación** |

## 6. Preflight

- [ ] Backend caliente y práctica de 30 s comprobada.
- [ ] `NEXT_PUBLIC_ENABLE_MIDI_UPLOAD=false` confirmado en Vercel (B-023).
- [ ] Cuenta limpia, sin correos ni datos personales visibles.
- [ ] Perfil sin marcadores, extensiones ni notificaciones.
- [ ] Zoom 100 %, ventana 1920×1080.
- [ ] OBS en MKV, 1080p30, audio de escritorio y micro en pistas separadas.
- [ ] Pieza estable y sesión de ensayo cerrada.
- [ ] UI congelada (`AppFooter`, `Feedback` sin cambios en curso).
- [ ] Cifra de tests y número de piezas verificados.

## 7. Plan B por toma

| Fallo | Plan B |
|---|---|
| El LLM tarda o da 429 | Repetir toma; si persiste, grabar con Mock y decirlo en off |
| Backend dormido | Warm-up de 60 s y comprobar `/health` antes de grabar |
| La pieza no carga | F5, comprobar sesión, usar la pieza propia p16 |
| El robot no arranca | Grabar la práctica a mano y conservar el informe del robot para el inserto |
| OBS no captura el piano | Revisar audio de escritorio; monitorear antes de la toma |
| Introducción y cierre con luz distinta | Grabarlos el mismo día, misma ropa y encuadre |

## 8. Subtítulos

1. Transcribir con los subtítulos automáticos de Clipchamp o con Whisper local.
2. Corregir a mano: `WebSocket`, `MIDI`, `FastAPI`, `Next.js`, `Groq`, `Gemini`,
   `LLM`, `gate`, `compás`, `Minueto`, `pianomentoria.com`.
3. Quemar el ES y exportar el SRT.
4. Traducir a EN con DeepL y revisar la traducción.
5. Comprobar que el subtítulo no tapa la interfaz que se explica.

## 9. Checklist de entrega

- [ ] Ensayo cronometrado ≤ 4:22.
- [ ] Los diez bloques del guion están en el corte.
- [ ] Cada claim visible tiene fila en la tabla.
- [ ] Los insertos de desarrollo van rotulados.
- [ ] Subtítulos ES legibles en móvil; SRT EN revisado.
- [ ] Portada y export reproducidos en un móvil real.
- [ ] Sin secretos, correos ni rutas privadas.

## 10. Enlaces

- Issue padre: [B-024](https://github.com/andrupax94/PianoMentor-IA/issues/26)
- Grabación: [B-024.2](https://github.com/andrupax94/PianoMentor-IA/issues/128)
- Edición y export: [B-024.3](https://github.com/andrupax94/PianoMentor-IA/issues/129)
- Guion hermano del chat: [`docs/DEMO_AGENT.md`](DEMO_AGENT.md)
