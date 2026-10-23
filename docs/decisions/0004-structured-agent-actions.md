<!-- description: ADR 0004: las acciones del agente son un enum cerrado, validadas en el backend. -->
<!-- context: Contrato compartido en shared/schemas/action.schema.json; ninguna acción del LLM se ejecuta sin validar. -->

# 0004 — Las acciones del agente son estructuradas y validadas

- **Estado:** aceptada
- **Fecha:** 2026-10-23
- **Ámbito:** B-012.4 (validación), B-012.5 (demo y control), B-012.6 (Groq) y B-012.8 (chat)
- **Sustituye a:** —
- **Sustituida por:** —

## Contexto

El agente interviene en una sesión viva: puede pedir espera, dar una pista, bajar el tempo, demostrar un fragmento, acompañar o devolver el control. Si esa decisión llegara como texto libre y el navegador la interpretara, el modelo podría inventar capacidades, saltarse límites o dejar al estudiante sin el piano. Además, la demo tiene que poder explicar qué hace el agente en cada turno.

## Opciones consideradas

1. **Texto libre interpretado en el frontend:** rápido de prototipar, imposible de validar y de auditar.
2. **Enum cerrado y validación en el backend:** el modelo elige entre acciones conocidas; el servidor comprueba límites antes de emitir nada.

## Decisión

Opción 2. `shared/schemas/action.schema.json` define el enum `wait`, `give_hint`, `slow_down`, `demonstrate`, `accompany` y `return_control`, con `reason` y sin propiedades adicionales. El backend valida la acción contra la lista blanca y contra sus límites (tempo, compases, repeticiones, duración y timeout) y solo entonces la emite. Si la orden del estudiante no está en la lista de funciones, el agente responde que no puede y recuerda qué sí puede.

## Consecuencias

- El modelo no puede alucinar capacidades: lo que no está en el enum no existe.
- Añadir una acción obliga a tocar cuatro sitios a la vez (esquema, validador, máquina de estados y UI), lo que evita acciones a medias.
- La negación honesta es una funcionalidad, no un fallo: demuestra que el agente conoce sus límites.
- El contrato es el mismo para el LLM, el backend y el navegador, así que un test del esquema vale para los tres.

## Referencias

`shared/schemas/action.schema.json`, `backend/src/piano_mentor/agent.py`, `docs/DEMO_AGENT.md`.
