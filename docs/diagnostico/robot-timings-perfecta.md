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

## 9. Resultado del log (2026-11-07) y fix aplicado

ChatGPT se quedó a medias (sin créditos) y el log resolvió solo. Lectura de
las trazas `robot plan/pulso/ANTICIPADO`:

```
robot plan   gate-0.5000 time_s=0.500 pos=0.400  ← adoptado 100 ms ANTES
robot pulso  gate-0.5000 elapsedMs=0 pos=0.400   ← pulsa EN el mismo sondeo
gate gate-0.5000: ANTICIPADO (faltaban 0.090 s)  ← el gate se lo traga temprano
```

**El signo era contrario al de H1: no llegaba tarde, llegaba TEMPRANO** —
100–400 ms por nota, cuantizado al ciclo sondeo/adopción. El pulso salía en
el **mismo sondeo en que se adoptaba el gate** (`pressAtMs = 0` → pulso
inmediato), y la adopción ocurría justo al soltar la nota anterior, con la
posición donde la cascada la dejara — nunca en el instante score del gate.
Por eso el gate-controller lo consumía como «ANTICIPADO» (el fichaje es
correcto-pedagógicamente pero el timing, mermado).

**Fix (misma sesión): programación predictiva del golpe.** Al adoptar el
gate, el runner **agenda el pulso con `setTimeout` al muro del gate**
(`muro = (gate.time_s − position_s) / tempoFactor × 1000 + pressAtMs`) y la
suelta se mide desde el muro **real del golpe** (fijado al disparar), no
desde la adopción. Redes de seguridad: si el gate murió bajo el plan el
pulso no sale; si el temporizador no llegara (pestaña regulada), el sondeo
dispara el golpe pasado su muro; `stop/clear` cancelan el agendado. En espera
todo queda como antes (delay = `pressAtMs` sobre el gate congelado). Tests:
nuevo «flujo predictivo» (adopción 300 ms antes → pulso en el muro, sin golpe
en la adopción) y calibración de sueltas contra el muro en «siempre_tarde» y
«siempre_equivocada». Con esto *Perfecta* coloca cada nota en su instante
(±ms del temporizador) y las trazas muestran la nueva línea
`robot agenda … delayMs=` — si volviera a torcerse, ese log ya cuenta la
historia completa: adopción → agenda → pulso → suelta.

## 10. Qué leer (código)

Todo en `frontend/src/lib` salvo el puente:

- `practice-scenarios.ts` — el runner completo (sondeo de 100 ms, plan por
  escenario, adopción, pulsación y suelta; trazas «robot plan/agenda/pulso/
  suelta» en línea única, sin pila — solo el `silence()` del sampler conserva
  la suya plegable). Tercer refuerzo del mismo día: la carrera del disparo.
- `playback-engine.ts` — `snapshot()` (con `upcomingGate` a la posición viva),
  `tick()` y la granularidad del horizonte de programación.
- `note-input.ts` — el puerto de notas (fuente `debug` para el robot).
- `gate-controller.ts` — el lado de espera (evaluación, marcado por
  instante, anticipación), por si se cruzan los datasets.

`backend/…` está en manos del chat paralelo del LLM: este diagnóstico no lo
toca; si hiciera falta, lo consultamos con ese chat.

## 11. La última carrera: gates planificados sin pulso (2026-11-07)

Con el margen de adopción resuelto llegó el último síntoma del log: gates
con `robot plan`+`robot agenda` pero **sin `robot pulso`/`noteOn`** (0.5,
1.5, 2.0, 3.5, 5.0, 6.875…). La clave estaba en el propio motor:
`CHORD_TOLERANCE_S = 5 ms` — `nextGate` descarta un gate cuando
`time_s < pos − 5 ms`. El golpe agendado por `setTimeout` vencía EXACTAMENTE
en el instante del gate; en el disparo la posición podía acabar unos ms
PASADA su hora, el gate ya no asomaba en `upcomingGate` y el `firePress`
abortaba en silencio (sin traza). Moneda al aire en 5 ms: los disparos que
aterrizaron un pelo antes consumían el gate ANTICIPADO (0.000 s); los que
cayeron un pelo después perdían la nota. Además el `clearPress` de la
adopción siguiente aplastaba golpes vencidos-o-a-un-pelín del muro que el
sondeo pillara vencidos (gate-0.5000: vencía a 11989, la adopción del 0.875
llegó a 11998: ni traza).

**Fix en el runner:**

1. **Pulso tardío tolerado** (`PRESS_LATE_TOLERANCE_S = 0.25`): si al
   disparar la posición está pegada al instante del gate (hasta 250 ms
   pasado) el golpe sale DE TODOS MODOS, con traza
   `robot pulso (pasaban X s)` — ligero tarde pero sonando. En espera la
   identidad del gate sigue siendo estricta.
2. **El apócope del golpe vencido pasa ANTES de la adopción** y el
   `clearPress` de la adopción dispara primero cualquier golpe pendiente
   pegado a la posición (`diffS >= −tolerancia`); lo remoto se declara en el
   log (`robot golpe abandonado`).
3. **Ningún aborto en silencio**: `robot pulso cancelado` (con gate actual y
   pos), `robot pulso (puerta cerrada…)` y `robot sin plan` dicen siempre el
   porqué.

Matices honestos: un golpe consumido fuera de la ventana de ±5 ms no genera
evento de práctica para ese gate (el gate ya no está en `upcomingGate`);
el audio y la demo quedan enteros, la evaluación pierde esa línea. Si el
backend evaluara esos gates, el ajuste iría en `nextGate`/equivalente —
fuera de este alcance.

Tests nuevos: «la adopción … no aplasta un golpe pendiente pegado a la
puerta» y «el disparo aterrizado unos ms pasado el gate pulsa igual…».

## 12. El reloj del AudioContext se detiene (2026-11-07, segunda ronda del log)

Con la carrera resuelta (todo gate tiene su pulso; desvíos de `pasaban`
0.001–0.014 s), el log del usuario dejó el ÚLTIMO síntoma: la posición del
transporte se CONGELA ~0.4–0.5 s en ventanas aleatorias («errores
diferentes en cada reproducción»), y sigue congelada en `plan` → `agenda`
→ `pulso` → `suelta` (gates 4.5000 con `pos=4.010` cuatro veces seguidas,
y 18.8750 con `pos=18.510`).

La posición corre con el reloj del AudioContext (`usePlayback`:
`{ now: () => ctx.currentTime }`, calculada en vivo por anclas), así que
una posición estática con el reloj de pared corriendo ⇒ **el dispositivo
de audio paró su reloj** (glitch del sistema/driver). No hay nada en el
código que suspenda el contexto en plena reproducción.

Efectos encadenados durante el paro (la cadena de la nota fantasma):
1. los temporizadores de pared siguen vivos → el robot pulsa contra la
   posición parada (gate-4.5 pulsado 490 ms antes, con las teclas del 4.0
   aún bajadas → `noteOn descartado: ya sostenido` ×4 → acorde inaudible);
2. el gate-18.875 se consume `ANTICIPADO (faltaban 0.365 s)` en espera;
3. el audio del motor congelado = silencio fantasma.

**Acción tomada:** vigilancia del reloj en el sondeo del runner — traza
`motor reloj DETENIDO` (pos, ms estáticos, adeudo) y `motor reloj
reanudado tras X ms`. Solo cuenta el paro: no cambia el comportamiento de
los pulsos (retener pulsos contra el reloj parado rompe los tests de muro
estático y adelanta la decisión a los datos del próximo log). Respuesta
pendiente del entorno del usuario: ¿sin grabación de Audacity abierto?
¿con auriculares o altavoces distintos? ¿en otro navegador (Chrome vs
Edge)? Si el DETENIDO se repite fuera de grabaciones, aparece la opción
de retener el pulso hasta la reanudación (pulso tardío dentro de la
tolerancia del 0.25, ya respaldada por firePress).
