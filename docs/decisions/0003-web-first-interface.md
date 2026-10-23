<!-- description: ADR 0003: la interfaz principal es web (Next.js + Web Audio), no una app nativa. -->
<!-- context: Justifica el navegador, el teclado del ordenador como entrada mínima y Web MIDI como mejora posterior. -->

# 0003 — La interfaz principal es web

- **Estado:** aceptada
- **Fecha:** 2026-10-23 · registrada a posteriori (decisión de la semana 1)
- **Ámbito:** B-006 (reproducción), B-007 (piano virtual), B-012.1 (sesión y WebSocket)
- **Sustituye a:** —
- **Sustituida por:** —

## Contexto

El producto necesita dibujar un piano de 88 teclas, reproducir audio con precisión, capturar pulsaciones y reflejar el estado de una sesión en tiempo real. El MVP tiene cinco semanas y la demo se enseña por enlace, sin instalar nada. La consola retro ya se había descartado como interfaz principal antes de empezar.

## Opciones consideradas

1. **Aplicación nativa** (Electron, Qt): control total del audio y del dispositivo MIDI, pero instalador, empaquetado por sistema operativo y ninguna demo por URL.
2. **Consola retro:** encaja con la estética, pero no con un teclado de 88 teclas ni con la accesibilidad.
3. **Web:** Next.js + Web Audio + Web MIDI, accesible por URL y con el teclado del ordenador como entrada mínima.

## Decisión

Web. El piano se pinta en SVG, el audio se programa con Web Audio (sampler Salamander con voz sintetizada de reserva), la entrada inicial es el teclado del ordenador y Web MIDI físico queda como mejora posterior. El estado de la sesión viaja por WebSocket al navegador.

## Consecuencias

- Cero instalación: la demo es un enlace y la validación se hace en el navegador.
- La latencia de audio depende del navegador y del sistema; se compensa programando contra `AudioContext.currentTime` y no con temporizadores de JavaScript.
- Web MIDI no está en todos los navegadores: el teclado del ordenador es el camino garantizado.
- El backend no gestiona audio: solo sesión, eventos y evaluación. El sonido es responsabilidad del frontend.

## Referencias

`frontend/src/lib/synth.ts`, `frontend/src/lib/piano-samples.ts`, `frontend/src/lib/websocket-client.ts`, `README.md` §5 (principio 7).
