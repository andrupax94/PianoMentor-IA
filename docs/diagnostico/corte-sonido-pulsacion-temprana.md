<!-- description: Contexto de diagnóstico para cerrar el corte de sonido residual al pulsar una tecla antes del gate (B-032.8, ajuste 2026-11-07). Documento de trabajo para discutir el caso con ChatGPT (que puede recibir el audio grabado). -->
<!-- context: El problema sigue sin reproducirse en el código tras el commit a278a7d; se registran aquí arquitectura de audio, hipótesis y guion de reproducción con trazas. -->

# Diagnóstico: corte de sonido al pulsar una tecla antes del gate

## 1. El sistema (frontend PianoMentor AI)

Next.js 16 + WebAudio. Todo el piano pasa por **un solo AudioContext** (creado
en `usePlayback`, política de autoplay: resume con el primer gesto) y una
cadena `master (GainNode) → destination`.

Sobre esa cadena trabajan dos generadores que **comparten el mismo
instancia de sampler**:

1. **PianoSampler de muestras** (`lib/piano-samples.ts`): 30 grabs reales
   (MP3 decodificados a `AudioBuffer`, detune por semitono, capas soft/hard
   mezcladas por velocity), con **voz aditiva de reserva** (`lib/synth.ts`,
   senos con inarmonicidad) cuando la muestra no está decodificada.
2. El **transporte** (`lib/playback-engine.ts`, sin framework, testeable con
   reloj falso) programa las notas de la pieza con `voice.scheduleNote(event,
   atTime)` dentro de un horizonte de 0,1 s.

Y **por el mismo sampler** suenan las pulsaciones del alumno (teclado del PC
y Web MIDI): `TransportProvider` recibe cada evento del puerto de entrada y
llama a `player.auditionOn(pitch, velocity)` / `auditionOff(pitch)`, que
llaman `sampler.noteOn/noteOff`. En el sampler hay dos registros:

- `voices`: todas las voces activas (programadas + audición),
- `sustained`: `pitch → voz` de las notas sostenidas por audición
  (una sola voz por pitch).

## 2. El modo espera (donde ocurre el problema)

En modos de práctica el transporte **se congela al llegar a cada gate** (nota
que el alumno debe tocar): `enterWaiting(gate)` fija la posición en
`gate.time_s`, empuja `scheduledUpto_s` hacia atrás para que las notas de ese
instante queden pendientes, y llama **`voice.silence()`** — el audio de la
pieza calla donde se congela. Al pulsar la tecla correcta, el
gate-controller (`lib/gate-controller.ts`) evalúa hit y llama
`resolveGate()`: el motor reanuda en `gate.time_s` y el tick re programa el
audio desde ahí.

El rebote visual del gate (B-032.8): si el alumno no pulsa, la cascada
sobrepasa la línea un margen (60 % del gate, recortado a [150, 750] ms),
rebobina y queda quieta.

## 3. Síntoma reportado

> «Si presiono la tecla **antes** que el rectángulo llegue, corta por
> completo el sonido de esa tecla; y además genera que no haya un wait de
> margen de error para la siguiente nota, como si el 60 % se convirtiera en
> 0 % solo en ese caso.»

Tras el commit `a278a7d` (2026-11-07) el usuario **sigue oyendo el corte**.

## 4. Lo que ya se cambió (commits d5bebb4 → a278a7d)

1. **`silence({ keepAudition: true })`**: `enterWaiting` ahora pide no cortar
   las voces sostenidas. En `piano-samples.ts` el `silence` salta las voces
   presentes en `sustained`; en `synth.ts` (reserva aditiva) igual. El resto
   de `silence()` (stop/seek/load/pause) sigue silenciando TODO.
2. **Anticipación ≠ hit instantáneo** (`gate-controller.ts`): cada pulsación
   se marca con su instante (`pressedAt`); solo cuentan las hechas **durante**
   la espera. Así la tecla mantenida desde antes del congelado no resuleve
   el gate a cero (eso mataba el rebote del 60 %). Re-pulsar cuenta.

El visor del margen no cambia con estos arreglos: si el corte sigue, la voz
de la tecla del alumno muere en **otro** punto del pipeline.

## 5. Dónde puede morir una voz (tabla de sospechosos)

| # | Punto | ¿Cuándo dispara? | ¿Cortaría la tecla del alumno? |
|---|---|---|---|
| 1 | `enterWaiting → silence()` | transporte llega al gate | **NO ahora** (keepAudition) — verificar |
| 2 | `stop()` / `stop` del lanzamiento del robot | parar transporte | SÍ (sin keepAudition): mataría una tecla sostenida |
| 3 | `pause()` / `seek()` / `load()` (setAudible, cambio de modo) | pausa, salto, cambio de mano/modo | SÍ (sin keepAudition) |
| 4 | Robo de la voz más vieja (`MAX_SAMPLED_VOICES = 48`) | saturación | Puede (raro con 48) |
| 5 | `noteOff` (audición) por note_off real o por `releaseAll` al cerrar la puerta | usuario suelta / demo de IA | Solo si suelta |
| 6 | Remonte del motor (StrictMode en dev recrea engine+sampler) | dev al entrar/navegar | El AudioContext nuevo no mata las voces viejas; el corte sería distinto |
| 7 | Fin del buffer de muestra (loop de cola cuando `duration > 1`s) | notas largas | No (bucle de la cola), pero el fade final existe |
| 8 | `resolveGate` reproduce la nota de la pieza en el gate (si la mano es audible) — **duplicado** con la tecla del alumno | tras el hit | No corta; puede sonar doble y confundir |

## 6. Guion de reproducción (para grabar)

1. Abrir la sesión con `http://localhost:3000/<id>?traceAudio` y DevTools
   abierto, la consola filtrada por el texto `[audio]`.
2. Empezar a **grabar el audio** (Audacity en Windows: entrada
   «WASAPI loopback» del dispositivo de salida — así se captura lo que
   reproduce el navegador).
3. En el modo «Dos manos» (el robot no está en marcha):
   - t0 clic en ▶ (la pieza corre),
   - ~0,5–1 s **antes** de que el rectángulo de la nota llegue a la línea,
     pulsar y **mantener** la tecla correcta,
   - esperar el congelado (el sonido de la tecla debe seguir),
   - volver a pulsar (hit) y mantener un par de segundos antes de soltar.
4. Guardar el audio + copiar el log de la consola (debe contener, por cada
   silencio, la pila de llamadas).

Marcas esperadas en el log de un repaso limpio:
`noteOn (audición)` → [`enterWaiting` + `silence() keepAudition=true`] →
`noteOn` (re-pulsación) → `noteOff`. **Si entre ellas aparece cualquier
`silence() keepAudition=false` (con su pila) o un `noteOff` que el usuario no
dio, ese es el asesino.**

Señales de audio que ayudan a ChatGPT a identificar el punto del corte:

- corte con **caída instantánea** (< 50 ms): `stopVoice` con fade 0,03 s
  (un `silence()`), no un release natural (sampler: 0,4 s; cola: 1,5 s);
- corte con colita de ~0,4 s: un `noteOff` (auditionOff);
- la tecla que corta: ¿coincide el pitch con la nota del gate o con otra?

## 7. Código clave (pegado para el contexto)

`piano-samples.ts` — silencio y audición:

```ts
silence(options?: SilenceOptions): void {
  const keepAudition = options?.keepAudition === true ? new Set(sustained.values()) : null;
  const now = ctx.currentTime;
  for (const voice of [...voices]) {
    if (keepAudition?.has(voice)) continue;
    stopVoice(voice, now, 0.03);        // fade de 30 ms: corte percibido instantáneo
  }
  if (keepAudition === null) sustained.clear();
  fallback?.silence(options);
},
noteOn(pitch, velocity): void { /* crea voz, sustained.set(pitch, voice) */ },
noteOff(pitch): void { /* stopVoice(voice, now, 0.4): colita de 400 ms */ },
```

`playback-engine.ts` — el congelado y la reanudación:

```ts
private enterWaiting(gate: Gate): void {
  this.position_s = gate.time_s;
  this.status = "waiting";
  this.currentGate = gate;
  this.waitingSince_wall_s = this.clock.now();
  this.waitingOvershoot_s = gateOvershoot_s(gate.duration_s);
  this.scheduledUpto_s = gate.time_s - CHORD_TOLERANCE_S;
  this.voice.silence({ keepAudition: true });   // ← el silencio ajustado
}

resolveGate(): void {
  // hitLead para el desvaneado del exceso tras el hit…
  this.status = "playing";
  this.position_s = this.currentGate.time_s;
  this.gatesPlayedUntil_s = Math.max(this.gatesPlayedUntil_s, this.position_s);
  this.currentGate = null;
  this.anchorWall_s = this.clock.now();   // el tick re programa desde scheduledUpto_s
  this.anchorPos_s = this.position_s;
}
```

`TransportProvider.tsx` — la audición del alumno:

```ts
const unsubscribe = subscribeNoteInput({
  onNoteOn: (event) => { held.add(event.pitch); player.auditionOn(event.pitch, event.velocity); },
  onNoteOff: (event) => { held.delete(event.pitch); player.auditionOff(event.pitch); },
});
const unsubscribeGate = subscribeNoteInputGate((enabled) => {
  if (!enabled) releaseAll();   // demo de IA: suelta lo pulsado
});
```

`usePlayback.ts` — a dónde llega la audición:

```ts
const auditionOn = (pitch, velocity) => {
  ensureEngine();
  if (ctxRef.current?.state === "suspended") void ctxRef.current.resume();
  samplerRef.current?.noteOn(pitch, velocity);   // MISMO sampler que la voz del motor
};
const auditionOff = (pitch) => { samplerRef.current?.noteOff(pitch); };
```

## 8. Preguntas para ChatGPT

1. Dado el análisis de espectro/forma de onda del corte grabado, ¿el corte es
   una caída de ganancia casi instantánea (consistente con un
   `exponentialRampToValueAtTime` de 30 ms) o una cola natural de release?
   ¿A qué operación del pipeline es más compatible?
2. ¿Se ve en la grabación **dos** señales del mismo pitch superpuestas
   (tecla del alumno + nota re-programada de la pieza tras `resolveGate`)? La
   duplicadete ayuda a confirmar la doble fuente.
3. ¿Hay evidencia de que el AudioContext se suspenda/reanude (gap de todo el
   audio, no solo de la tecla)?
4. Mi hipótesis principal tras el fix: el corte restante viene de un
   `silence()` de **stop/load/seek** (nºs 2-3 de la tabla) o del `noteOff`
   de `releaseAll`. ¿Qué evidencia en el audio discrimina entre ellas?
5. ¿Cómo instrumentar de forma más fina (WebAudio: registrar
   `AudioNode.disconnect` implícitos, contadores por tipo de nodo) para
   cazar el punto exacto si el log no alcanza?
6. ¿El fade de 30 ms en `silence()` es demasiado seco para percibirlo como
   «corte» también en los otros puntos (stop/seek)? ¿Conviene unificarlo a un
   release percusivo corto pero musical (~120 ms)?

## 9. Datos para volver

- El **clip de audio** (WAV/MP3 de unos 15 s) con las marcas t0 (play),
  t1 (pulsación temprana), t2 (congelado), t3 (re-pulsación/hit).
- El **log de la consola** filtrado por `[audio]` (con pila, tal cual sale
  por ?traceAudio).
- Modo de práctica usado (Dos manos / Una mano) y con qué teclado (PC o MIDI
  externo).
