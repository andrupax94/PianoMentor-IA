<!-- description: Contexto de diagnóstico para los timings erróneos del pianista robot en el escenario «Perfecta» (B-033.1, 2026-11-07). Documento de trabajo para discutir el caso con ChatGPT (que puede recibir el clip de audio). -->
<!-- context: Tras los ajustes de anticipación del 2026-11-07 (commit d1b7469), el robot «comete muchos errores de timing» según el usuario. La antelación humana ya soluciona; el sospechoso principal es el presupuesto de latencia del sondeo del robot. Nadie ha tocado el backend (chat paralelo del LLM). -->

# Diagnóstico: timings del robot en «Perfecta»

## 1. Qué hace el robot (ruta completa de cada nota)

El runner (`lib/practice-scenarios.ts`) es puro y sondea a **100 ms**:
lee el snapshot del transporte, planifica el gesto del gate (por escenario,
semilla para `mezcla`) y, cuando toca, **emite pulsaciones reales** por el
puerto de notas con fuente `debug`:

```
runner poll (cada 100 ms)
  └─ submitNoteOn({ pitch, velocity })            [note-input]
       ├─ TransportProvider → player.auditionOn(pitch, v) → sampler.noteOn   (suena YA)
       └─ PracticeBridge → socket.sendNoteOn({ pitch, velocity, t_s })       (backend)
              t_s = posición del transporte EN el momento del envío (musicalTime())
```

`practice-debug` publica las señales en el registro dev; el backend agrega
los eventos de práctica (y vé el `t_s` de cada nota) para sus pistas y la
evaluación final.

## 2. Dos formas de conducirse (y cómo se lanza)

Cada «lanzar escenario» del menú Depurar **autoconfigura Dos manos + Modo
espera apagado** (petición del usuario de ayer). Con la espera apagada los
gates no existen como congelados: el runner conduce en **modo flujo** —
el snapshot expone `upcomingGate` (primer gate sin tocar a la posición en
curso) y el runner:

1. **Adopta** el gate cuando su sondeo lo ve por primera vez
   (`gate.id !== lastGateId`), fijando `gateStartMs = clockMs()` — el reloj
   de pared del navegador (`performance.now()`), no el tiempo partitura.
2. **Pulsa** cuando `clockMs() - gateStartMs >= plan.pressAtMs`
   (en `perfecta`, `pressAtMs = 0` → pulsa en el MISMO sondeo en que lo adopta).
3. **Suelta** a `pressAtMs + holdMs`, con `holdMs = duración escrita de la
   nota − 120 ms` (hueco de seguridad; recorte [60, 8000] ms). La suelta es
   del reloj en ambos modos; si se adopta con las manos ocupadas, el gate
   siguiente adopta tras soltar.

## 3. El síntoma

> «el robot en "perfecto" comete muchos errores de timing entre otros»

Interpretación: los golpes del robot no aterrizan en el instante score del
gate (o el backend los cuenta tarde). En «Perfecta» no hay errores pedagógicos
intencionales (siempre pulsa bien la nota correcta, pressAtMs = 0, hold
natural) — todo desvío es mecánico, no de plan.

## 4. Hipótesis (presupuesto de latencia, por orden de sospecha)

| # | Hipótesis | Magnitud estimada | Efecto |
|---|---|---|---|
| H1 | **Sondeo de 100 ms**: el gate pasa a "venidero" en un tick; el sondeo lo ve hasta 100 ms después; la pulsación sale en ese mismo sondeo | 0–100 ms tarde POR NOTA, persistente | cada nota aterriza tarde de forma constante; a 185 BPM una semicorchea dura ~81 ms — un sondeo entero se come la nota |
| H2 | **`position_s` en retardo al tick**: el snapshot se saca del último `tick()` del motor (~10 Hz/25 ms según el oyente) | ≤ 25 ms extra | añade a H1 |
| H3 | **Granularidad muro→partitura**: `clockMs()` es tiempo de pared; el instante score del gate se mide en posición. Sin conversión por `tempoFactor`, un factor ≠ 1 desplaza `pressAtMs/late` | proporcional | desplaza los offsets (en Perfecta factor ≈ 1) |
| H4 | **Adopción con las manos libres**: la nota siguiente se adopta tras soltar la anterior (`heldPitches !== null` bloquea); con duraciones largas el encadenamiento supera el hueco de 120 ms | acumulativo | notas que se desmoronan en cadenas de blanca/negra |
| H5 | **`pressAtMs` de los escenarios «de fallo» se mide desde la ADOPCIÓN**, no desde el instante score: `timeoutMs + LATE_EXTRA_MS` (siempre_tarde/late de `mezcla`), `WRONG_DELAY_MS` (equivocada) — el backend los percibe como tarde/inexactos respecto al plan | solo escenarios con fallo | no afecta a Perfecta |
| H6 | **Backend**: el evaluador del backend compara `t_s` de la nota con su idea del gate; el envío del WS + red + agregación añade jitter que el front no ve | desconocido (código fuera de este diagnóstico) | el «error» declarado puede no ser audible |

## 5. Trazas nuevas para esta ronda

Con la URL **`?traceAudio`** (dev), filtrando la consola por `[audio]`, el
runner ya imprime por cada gate:

```
[audio] robot plan gate=gate-1.5000 time_s=1.500 pos=1.487 pressAtMs=0 holdMs=380
[audio] robot pulso gate=gate-1.5000 elapsedMs=13 pressAtMs=0 pos=1.601 pitch=[67]
[audio] robot suelta gate=gate-1.5000 totalMs=397 holdMs=380
```

Lectura clave: **la diferencia `pos − time_s` en la línea «robot pulso»** —
esa es la latencia mecanica de la nota. Sumándose `elapsedMs` contra
`pressAtMs` y las líneas consecutivas se reconstruye el presupuesto completo
(H1+H2+H4). Las trazas del gate-controller (`gate ...: outcome=...`) y del
sampler (`noteOn`, `stopVoice`) siguen activas si el corte volviera a asomar.

## 6. Guion de reproducción (para grabar)

1. Abrir sesión en dev con `http://localhost:3000/<id>?traceAudio`, DevTools
   con la consola filtrada por `[audio]`, y grabando el audio (Audacity,
   entrada WASAPI loopback).
2. Panel de estado → Depurar → lanzar **Perfecta**.
   (El lanzamiento deja la pieza a dos manos con la espera apagada; el robot
   recorre la pieza de principio a fin en modo flujo.)
3. Dejar correr ~20–30 s de pieza (varios compases). Guardar clip + log.
4. Opcional: repetir 10 s con el switch «Modo espera» reactivado a mano, para
   comparar la variante del robot con congelados (allí presses deben ser
   hit inmediatos; los wait_ms del log del gate-controller dicen el margen).

Marcas útiles en el clip: el eco del tempo de la pieza percibido
(¿el robot «acelera»?, ¿titubea en notas largas?, ¿se desmorona tras un
compás de notas sostenidas? — eso acusaría H4).

## 7. Fix candidato (para validar con ChatGPT antes de tocar)

Convertir el press de «sondeo reactivo» a **programación predictiva**:
al adoptar el gate, calcular el instante de pared del cierre

```
pressAtWall = clockMs() + (gate.time_s − position_s) / tempoFactor × 1000
```

y pulsar por `setTimeout(pressAtWall − clockMs())` (y anular el temporizador
si el transporte se para/pausa/salta). Con eso la nota cae en el instante
score con error de temporizador (< 5 ms), el hold igual por el mismo método,
y el sondeo se queda para la supervisión. Alternativa barata: sondeo a 10–15 ms
en flujo (más CPU, latencia ≤ 15 ms) — ChatGPT opinará sobre CPU/consistencia.

Para H5/H6 se propone un lenguaje común: el registro dev muestra el plan
(`pressAtMs`), la ejecución (`elapsed`) y el `t_s` enviado; si ChatGPT
confirma que la latencia mecánica cuadra (~≤ 25 ms), lo residual es del
backend y su ventana de tolerancia (fuera de este diagnóstico).

## 8. Preguntas para ChatGPT

1. Del clip: ¿los golpes del robot suenan **uniformemente tarde** (constante)
   o con **jitter variable** nota a nota? ¿Se acumula con notas sostenidas
   (cadena de adopciones, H4)?
2. Con el log (`robot pulso` → `pos − time_s`) y las 3 líneas por gate,
   ¿el presupuesto apunta a H1+H2? ¿Qué % de la desviación explican?
3. ¿Recomiendas el fix predictivo con `setTimeout` al muro (y qué
   cancelaciones son indispensables: stop/pause/skip/cambio de pieza) o
   tu prioridad sería bajar el sondeo? ¿CPU/robustez en dev?
4. ¿El desvío bien podría salir del mapeo muro↔partitura en el propio motor
   (tempoFactor, factor del snapshot) de forma que veamos una deriva creciente
   dentro de la pieza? ¿Cómo se distingue en el log (drift vs jitter)?
5. Para el caso "todos los demás escenarios": ¿deberían los `pressAtMs` de
   los escenarios de fallo medirse desde el **instante score** del gate
   (`remaining_s`), no desde la adopción?

## 9. Qué leer (código)

Todo en `frontend/src/lib` salvo el puente:

- `practice-scenarios.ts` — el runner completo (sondeo de 100 ms, plan por
  escenario, adopción, pulsación y suelta; trazas «robot plan/pulso/suelta»).
- `playback-engine.ts` — `snapshot()` (con `upcomingGate` a la posición viva),
  `tick()` y la granularidad del horizonte de programación.
- `note-input.ts` — el puerto de notas (fuente `debug` para el robot).
- `gate-controller.ts` — el lado de espera (evaluación, marcado por
  instante, anticipación), por si se cruzan los datasets.

`backend/…` está en manos del chat paralelo del LLM: este diagnóstico no lo
toca; si hiciera falta, lo consultamos con ese chat.`
