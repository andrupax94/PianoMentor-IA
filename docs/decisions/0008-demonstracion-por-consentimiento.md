<!-- description: ADR 0008: la demostración automática del agente pasa de acción mandada a oferta aceptada por el alumno; slow_down y give_hint siguen automáticas. -->
<!-- context: Revisión del usuario tras verificar B-032.6 en el navegador: el `demonstrate` automático es demasiado intrusivo en mitad de la práctica. -->

# 0008 — La demostración se ofrece, no se impone

- **Estado:** propuesta (2026-11-02)
- **Fecha:** 2026-11-02
- **Ámbito:** B-032.6 (strikes), que su ejecución concreta concentra la issue B-032.7; convive con el ADR 0004 y la evaluación batch de B-012.2.
- **Sustituye a:** 0007 **solo en su regla de demostración automática** (`timeout → demonstrate`). El resto del ADR 0007 permanece: el grano sigue siendo el gate, la decisión por compás sigue determinista en `practice_rules.py` y el único punto de decisión sigue siendo `decide()`.
- **Sustituida por:** —

## Contexto

Tras verificar B-032.5/B-032.6 en el navegador, la revisión del usuario fue: **interrumpir la práctica es demasiado intrusivo**. El `demonstrate` automático roba el teclado en el peor momento pedagógico — justo cuando el alumno ya casi corrige — y borra el plan mental que estaba construyendo. No ocurre lo mismo con `slow_down` (baja el tempo sin quedarse el piano) ni con `give_hint` (solo escribe en el chat).

Además faltaba el «otra vez»: tras una demostración el alumno no puede pedir reproducirla; en clase real el profesor la repite sin que el alumno tenga que hablar.

## Opciones consideradas

1. **Quitar la escalera de descuento** (todas las intervenciones a lotería) — se pierde el timing pedagógico que funcionó con 2/3 strikes.
2. **Apagar todo en modo espera** — vuelve al estado pre-B-032.6: los strikes no desencadenan nada y el grano del gate se pierde.
3. **Oferta en vez de acción:** el backend sigue detectando y **ofrece** la demostración (por el chat o el panel); el alumno la acepta o la descarta. `slow_down` y `give_hint` siguen automáticas porque no son intrusivas.

## Decisión

- **El backend propone, el alumno decide, el motor ejecuta lo aceptado.** La regla 1 de `practice_rules.py` deja de devolver `demonstrate` y devuelve `offer_demo` (nueva acción de lista blanca), con los mismos parámetros que demostraría.
- **`offer_demo` no toca el control ni el motor.** Se difunde por el WebSocket (misma pareja `action` + `reason` que una acción ya ejecutada) pero **no** cambia `control = agent`, **no** silencia el transporte, **no** activa gates ni programa `return_control`. El alumno sigue tocando su compás mientras lee la oferta.
- **`demonstrate` solo llega a ejecutarse si el alumno la pide** (aceptando la oferta vía `POST /actions`, o por el chip «Pedir pista al agente» de B-012.6, que ya existe).
- **«Otra vez» (repetir la demo):** máximo 1 repetición por compás de una `demonstrate` ya ejecutada, reutilizando sus parámetros guardados, y con topes anti-bucle en `InterventionLimits`.
- **«Sigo yo»** registra un `offer_dismiss` y ese compás no se vuelve a ofrecer hasta que se acierte un gate o se pase al siguiente.

## Consecuencias

- **El bucle pedagógico deja de secuestrar**: el backend detecta y propone, pero la decisión y la interrupción son siempre del alumno.
- **El timing de las ofertas es del compás, no de la sesión**: un mismo compás puede producir oferta + respuesta + demo + otra vez sin entrar en bucle; lo acotan los topes de B-032.7.
- La redacción de la oferta es **fija y determinista** (módulo puro de reglas): el LLM no interviene; el chat la narra cuando llega.
- Los criterios de `demonstrate` de B-012.5 quedan intactos (persisten porque el bucle ya existe, y la vía de pedido por el chip debe estar sincronizada).

## Referencias

Issue **B-032.7** (diseño y ejecución de lo que se decide aquí), `backend/src/piano_mentor/practice_rules.py`, `backend/src/piano_mentor/agent.py`, `backend/src/piano_mentor/api.py`, `frontend/src/components/MentorPanel/MentorChat/`.
