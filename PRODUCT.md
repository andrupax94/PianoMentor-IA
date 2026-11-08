# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Estudiante autodidacta de piano que practica con el teclado del ordenador (Web MIDI opcional) sobre piezas MIDI, recibe feedback de notas y timing, y puede pedir pistas, demostraciones o acompañamiento al agente.

## Product Purpose

PianoMentor AI convierte una pieza MIDI en una sesión de práctica adaptativa: carga y analiza la pieza, la reproduce en un piano virtual, evalúa la interpretación del estudiante (precisión y timing) e interviene pedagógicamente con acciones limitadas, visibles y reversibles. La IA no solo explica: observa la interpretación, detecta dificultades y propone una intervención validada.

## Positioning

La IA propone, el sistema valida: ninguna acción generada por el LLM se ejecuta directamente. El motor musical (MIDI, reproducción, reloj, timing, evaluación) es determinista y separado del LLM, que solo emite acciones estructuradas dentro de una lista blanca. El estudiante conserva el control final: toda intervención tiene límites, puede detenerse y devuelve el control automáticamente.

## Operating Context

Aplicación web (Next.js + FastAPI) con piano virtual en el navegador, WebSocket para el estado de práctica en tiempo real y HTTP para piezas, sesiones y acciones. Las piezas se cargan como archivos MIDI y se reproducen por secciones con control de tempo, pausa y repetición.

## Capabilities and Constraints

- Motor musical determinista separado de la API, la UI y el agente pedagógico.
- Funciona sin LLM (reglas deterministas como fallback obligatorio).
- Acciones del agente validadas mediante lista blanca, límites y timeout.
- Privacidad: los MIDI cargados se tratan como privados; sin subida de audio en el MVP.
- Frontend: Next.js 16 + React 19 + TypeScript; Bootstrap solo para grid (ver skill `piano-mentor-css`); tokens en `globals.css`.
- Sin aplicación móvil nativa, transcripción de audio a MIDI ni catálogo universal en el MVP.

## Brand Commitments

- Paleta navy profundo + oro, color-scheme oscuro.
- Tipografía: Gabriola (display) + Manrope (cuerpo), con Reem Kufi como reserva.
- Glassmorphism (backdrop-blur) en contenedores flotantes.
- Colores de mano de la cascada: azul (izquierda), ámbar (derecha), verde (sin mano), violeta (IA acompañante).

## Evidence on Hand

- `README.md`, `PLAN.md`, `ARCHITECTURE.md`: visión, alcance y estructura.
- `frontend/src/app/globals.css`: tokens de color, tipografía y efectos.
- `docs/design/`: referencias visuales (Illustrator y renders).

## Product Principles

1. No es un chatbot genérico: el agente trabaja con una pieza, una interpretación y un estado pedagógico.
2. El código determinista controla la música: MIDI, reproducción, reloj, timing y evaluación no dependen del LLM.
3. La IA propone, el sistema valida: ninguna acción generada por un LLM se ejecuta directamente.
4. El estudiante conserva el control final: toda intervención tiene límites, puede detenerse y devuelve el control automáticamente.
5. El sistema funciona sin LLM: las reglas deterministas son el fallback obligatorio.
6. La interfaz debe hacer visible el estado: práctica, espera, pista o demostración.
7. La interfaz inicial es web.
8. El alcance se mantiene pequeño: las funcionalidades opcionales se posponen si amenazan el núcleo MIDI → práctica → evaluación → intervención.

## Accessibility & Inclusion

Teclado del ordenador como entrada principal; Web MIDI opcional (requiere contexto seguro y permisos). Respeto de `prefers-reduced-motion`. Contraste definido por los tokens de texto (`--text`, `--text-soft`, `--text-mute`) sobre fondos oscuros. Avisos y errores con color accesible (`--error`).

---

"