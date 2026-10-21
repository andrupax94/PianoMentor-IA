# Guion de demo del chat del agente

> **B-012.8 (bloque D).** Este documento es el guion de la demo del agente: qué se escribe en el chat, qué hace el backend en cada turno, qué hace el navegador y qué mirar si algo falla.
> Las transcripciones están tomadas de ejecuciones reales contra el backend local: una con **Groq** (proveedor real, con el `.env` del proyecto) y otra con el **`MockProvider`** (sin red ni clave).

## Qué demuestra el guion

El agente conversa en español y **hace cosas reales**, sin inventarse nada:

- **Encadena antes de actuar**: para reproducir o abrir práctica, primero busca en el catálogo y solo actúa con un `piece_id` que existe (`buscar_pieza` → `reproducir_pieza` / `abrir_practica`).
- **Ejecuta en el navegador**: el backend nunca toca el MIDI; devuelve una `client_action` de lista blanca y el navegador la aplica (carga la pieza, pausa, crea la sesión…).
- **Dice la verdad cuando no puede**: fuera de su lista de funciones o sin coincidencias, lo explica y ofrece alternativas. Nunca devuelve una acción inventada.
- **Siempre contesta**: aunque el proveedor falle o devuelva un turno vacío, la cadena de respaldo (Groq → Gemini → Mock) y la salvaguarda final impiden que la burbuja quede en blanco.

## Preparación (2 minutos)

### 1. Arrancar el backend

Desde la **raíz del repositorio** (así lee el `.env` de la raíz y reutiliza `./data`):

```powershell
$env:PYTHONPATH = "$PWD\backend\src"
E:\Python312\python.exe -m uvicorn piano_mentor.main:app --port 8000
```

El proveedor lo decide `LLM_PROVIDER` del `.env`:

| Situación | Cadena que se monta | Qué se ve en cada turno |
| --- | --- | --- |
| `.env` con `LLM_PROVIDER=groq` y claves de Groq y Gemini (el caso del proyecto) | Groq → Gemini → Mock | Respuestas redactadas por el modelo real (3–8 s) |
| Sin `.env`, sin claves o con `LLM_PROVIDER=mock` | Solo Mock | Respuestas deterministas e instantáneas (0 s) |

### 2. Arrancar el frontend

```powershell
Set-Location frontend
npm run dev
```

Abrir **<http://localhost:3000>** y esperar a la portada (piano a la izquierda, panel del mentor a la derecha). El chat vive en la portada, tanto en `/` como en `/{id}` cuando hay una sesión de práctica abierta (la práctica es esa misma portada); dentro de `/library` no está y ahí aparece como panel flotante.

### 3. Comprobación previa del backend

```powershell
$body = '{"message": "¿Qué puedes hacer?"}'
Invoke-RestMethod -Uri http://localhost:8000/api/v1/agent/chat -Method Post `
  -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($body))
```

Debe responder `200` con `"provider": "groq"` (o `"mock"`) y una lista de capacidades. Si responde, el backend está listo. (El cuerpo se envía con `UTF8.GetBytes` para que los acentos viajen correctos; un `curl.exe -d` desde la consola puede llegar con los acentos convertidos en signos de interrogación.)

## El guion, turno a turno

Se escribe en el cuadro «Habla con PianoMentor…» de la portada y se pulsa **Enter**. Cada turno real tarda 3–8 s; mientras tanto la burbuja enseña «Pensando…» y después escribe la respuesta con efecto de tecleo.

| # | Escribes | Qué hace el backend | Qué hace el navegador | Qué debes ver |
| --- | --- | --- | --- | --- |
| 1 | `¿Qué puedes hacer?` | Responde solo con texto; `client_action: null` | Nada | Lista de capacidades en la burbuja |
| 2 | `pon el minueto de Bach` | `buscar_pieza("minueto bach")` → 4 candidatos Bach → `reproducir_pieza(p01, auto_play)` | Carga la pieza `p01` en el almacén, navega a `/` y reproduce sola | Burbuja «Cargando 'p01' en el piano y reproduciéndolo.»; el reproductor pasa de *Symphony No. 5* a **Minuet in G major** y el botón ▶ se convierte en ⏸ **Pausar** |
| 3 | `pausa` | `pausar` | Pone el transporte en pausa | «Pausando la reproducción.» y el botón vuelve a **Reproducir** |
| 4 | `sigue` | `reanudar` | Reanuda el transporte | «Reanudando la reproducción.» y el botón vuelve a **Pausar** |
| 5 | `detén` | `parar` | Detiene la reproducción | «Deteniendo la reproducción.» |
| 6 | `lista las piezas` | `listar_piezas` (función de servidor; nada de navegador) | Nada | «Aquí tienes el catálogo de piezas disponibles (id, título, compositor).» |
| 7 | `abre práctica del minueto de Bach` | `buscar_pieza` → `abrir_practica(p01)` | Crea la sesión con `POST /practice/sessions` y navega a `/{id}`, que es la portada con la sesión activa | «Abriendo la sesión de práctica para 'p01'.» y la URL pasa a **`/{uuid}`**: la misma portada, con la sesión viva en el mini cuadro de estado del panel del mentor («conectada») |
| 8 | `abre práctica` | Sin pieza nombrada no propone acción: `client_action: null` | Nada | «Para abrir una sesión de práctica necesitas indicar la pieza…» (pide el título, no inventa un `piece_id`) |
| 9 | `enséñame a tocar el violín` | Fuera de la lista de funciones | Nada | «Lo siento, pero no puedo ayudar con eso. Puedo ofrecerte: …» |
| 10 | `reproduce el bolero de Ravel` | `buscar_pieza("bolero ravel")` → 0 candidatos; `client_action: null` | Nada | «Lo siento, pero no he encontrado una pieza titulada *Bolero* de Ravel en nuestro catálogo…» |

**Memoria**: el chat conserva el `chat_id` en `localStorage`, así que los turnos 3–5 funcionan *dentro* de la conversación iniciada en el 2 («ahora pausa» entiende a qué reproducción te refieres). Tras recargar la página la conversación sigue; el historial guardado es una ventana rodante.

**Un detalle del turno 7**: al navegar a `/{id}` la portada no se remonta (comparte layout con `/`), así que el chat conserva la respuesta, el piano sigue donde estaba y lo único nuevo es la sesión en el mini cuadro de estado. La ruta antigua `/practice/{id}` redirige a `/{id}`, por si queda algún marcador viejo.

## Transcripción real (evidencia)

Respuestas literales del endpoint `POST /api/v1/agent/chat` con el proveedor **Groq** (capturadas el 2026-10-21 contra el backend local; `rejected` lo añade el esquema de respuesta, siempre `false` en los turnos sanos).

### Turno 2 — buscar y reproducir

```jsonc
// escribes: "pon el minueto de Bach"
{
  "reply": "Cargando 'p01' en el piano y reproduciéndolo.",
  "provider": "groq",
  "used_fallback": false,
  "client_action": { "name": "reproducir_pieza", "arguments": { "auto_play": true, "piece_id": "p01" }, "rejected": false },
  "used_tools": [
    { "name": "buscar_pieza", "arguments": { "texto": "minueto bach" }, "rejected": false },
    { "name": "reproducir_pieza", "arguments": { "auto_play": true, "piece_id": "p01" }, "rejected": false }
  ]
}
```

Fíjate en `used_tools`: **dos** pasos. El modelo reduce la orden a palabras clave («minueto bach») y solo propone `reproducir_pieza` cuando ya ve los candidatos. `p01` es *Minuet in G major* de Johann Sebastian Bach, la pieza que encaja con dos palabras de la orden.

### Turno 7 — buscar y abrir práctica

```jsonc
// escribes: "abre práctica del minueto de Bach"
{
  "reply": "Abriendo la sesión de práctica para 'p01'.",
  "client_action": { "name": "abrir_practica", "arguments": { "piece_id": "p01" }, "rejected": false },
  "used_tools": [
    { "name": "buscar_pieza", "arguments": { "texto": "minueto bach" }, "rejected": false },
    { "name": "abrir_practica", "arguments": { "piece_id": "p01" }, "rejected": false }
  ]
}
```

### Turnos 9 y 10 — negaciones honestas

```jsonc
// escribes: "enséñame a tocar el violín"   →  client_action: null, used_tools: []
// reply: "Lo siento, pero no puedo ayudar con eso. Puedo ofrecerte:
//          - Lista y búsqueda de piezas de piano. ..."

// escribes: "reproduce el bolero de Ravel"  →  client_action: null
// used_tools: [ { "name": "buscar_pieza", "arguments": { "texto": "bolero ravel" } } ]
// reply: "Lo siento, pero no he encontrado una pieza titulada *Bolero* de Ravel en nuestro catálogo. ..."
```

La diferencia importa: en el primero el agente **niega por falta de función** (no sabe de violines); en el segundo **niega por falta de resultado** (buscó de verdad y el catálogo no tiene esa obra). Ninguno de los dos devuelve `client_action`.

## Modo sin red (MockProvider)

Con `LLM_PROVIDER=mock` (o sin `.env`) el mismo guion funciona, con respuestas deterministas e instantáneas. Es el modo de CI y el que garantiza que la demo no depende de internet:

| Escribes | `client_action` del Mock | Respuesta (literal) |
| --- | --- | --- |
| `¿Qué puedes hacer?` | — | `Puedo buscar piezas del catálogo, reproducirlas en el piano, pausar, reanudar, parar y abrir una sesión de práctica. Dime qué necesitas.` |
| `reproduce Für Elise` | `reproducir_pieza(p18, auto_play)` | `Reproduciendo «Für Elise».` |
| `pon el minueto de Bach` | `reproducir_pieza(p01, auto_play)` | `Reproduciendo «Minuet in G major».` |
| `abre práctica del minueto de Bach` | `abrir_practica(p01)` | `Abro la práctica de «Minuet in G major».` |
| `abre práctica` | — | `¿Sobre qué pieza? Di el título, por ejemplo «abre práctica del minueto de Bach».` |
| `lista las piezas` | — | `18 piezas en el catálogo: «Prelude in E minor», «Prelude in A major», «Waltz in D-flat major Minute», «Fantaisie-Impromptu», «Invention No. 1 in C major» y otras 13 más. Di «reproduce <título>» para escuchar alguna.` |
| `enséñame a tocar el violín` | — | `Eso todavía no sé hacerlo. Puedo buscar piezas, reproducir, pausar, reanudar, parar y abrir una sesión de práctica.` |
| `reproduce el bolero de Ravel` | — | `No he encontrado ninguna pieza con «bolero ravel». Prueba con otra palabra (título o compositor) o di «lista las piezas» para ver el catálogo.` |

El Mock es un agente de dos pasos como el modelo real: propone `buscar_pieza`, **lee el resultado** y cierra con la acción correspondiente (o con la negación). Por eso el mismo guion sirve para las dos demostraciones.

## Si algo falla

| Síntoma | Causa | Qué pasa / qué hacer |
| --- | --- | --- |
| El turno tarda y la burbuja dice «Pensando…» | El proveedor real tarda 3–8 s | Normal. No pulses Enter dos veces; espera la respuesta |
| «No he podido contactar con el profesor. Inténtalo de nuevo.» | El backend no responde (caído o mal arrancado) | Revisa el paso 1 de Preparación; mira el log del uvicorn |
| «No he podido preparar una respuesta para esa consulta.» | Todos los proveedores fallaron o devolvieron el turno vacío | Repite la frase. El chat **nunca** deja la burbuja en blanco |
| La respuesta llega pero sin acción (nada cambia en el piano) | El pedido no estaba en la lista o no había coincidencias | Lee la burbuja: el agente explica el motivo y sugiere alternativas |
| Responde «mock» en vez de «groq» en la evidencia | No hay clave de Groq o `LLM_PROVIDER=mock` | Esperado y legítimo: es el modo sin red. Para el modo real, revisa el `.env` de la raíz |
| Groq flaquea (responde tarde o vacío) | Fallo puntual del proveedor | La cadena **Groq → Gemini → Mock** lo cubre: si Gemini contesta, la respuesta lleva `provider: "gemini"` y `used_fallback: true`. Si no, la salvaguarda final redacta la frase honesta del turno vacío |

## Checklist de verificación manual

Antes de dar la demo en público, repasa estos puntos (5 minutos, en este orden):

- [ ] `¿Qué puedes hacer?` → lista de capacidades y `client_action: null` (Network → respuesta JSON).
- [ ] `pon el minueto de Bach` → el reproductor muestra **Minuet in G major** y suena (botón en **Pausar**).
- [ ] `pausa` → el botón vuelve a **Reproducir**.
- [ ] `abre práctica del minueto de Bach` → la URL pasa a `/{uuid}` y el mini cuadro de estado muestra la sesión «conectada».
- [ ] `abre práctica` → pregunta por la pieza, sin acción.
- [ ] `enséñame a tocar el violín` → negación honesta con la lista de lo que sí sabe hacer.
- [ ] `reproduce el bolero de Ravel` → «no he encontrado…», sin acción.

## Cómo se prueba esto en CI

El mismo comportamiento está cubierto sin red en `backend/tests/test_agent_chat.py`: los tests del Mock (extracción de palabras clave, encadenar buscar → reproducir/abrir, negación honesta, práctica sin pieza, resumen del catálogo), los del buscador (orden por coincidencias, acentos, cero resultados), los del endpoint (cadena completa con `client_action`, sin acción cuando no hay candidatos) y los de la cadena de respaldo (respuesta vacía → siguiente proveedor; burbuja nunca en blanco). Se ejecutan con `cd backend; python -m pytest -q`.
