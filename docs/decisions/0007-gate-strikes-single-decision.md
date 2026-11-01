<!-- description: ADR 0007: el grano del fallo lo mide el navegador (gate) y la decisión es por compás, determinista, con un solo punto de decisión en el backend. -->
<!-- context: Cierre de la vertical B-032 (B-032.6): las señales de práctica se convierten en intervención del profesor sin LLM. -->

# 0007 — El grano es el gate, la decisión es por compás

- **Estado:** aceptada
- **Fecha:** 2026-11-01
- **Ámbito:** B-032.5 (gates) y B-032.6 (strikes e escalado); convive con el ADR 0004 y la evaluación batch de B-012.2.
- **Sustituye a:** —
- **Sustituida por:** —

## Contexto

Con el modo espera (B-032.5) el navegador sabe cuándo el alumno falla un gate y cuánto espera. Faltaba cerrar el bucle pedagógico: convertir ese retraso en una intervención del profesor (bajar el tempo, dar una pista, demostrar el compás) en mitad de la práctica, determinista y sin LLM. El riesgo registrado en la issue es doble: duplicar la lógica de decisión (dos caminos que se contradicen en la demo) y crear bucles de intervención (demostrar, fallar, volver a demostrar sin tope).

## Opciones consideradas

1. **Decidir en el navegador:** el front ya tiene todas las señales; pero el backend no lo vería, no habría registro y la escalera viviría fuera del ámbito de la lista blanca de acciones.
2. **Dos caminos de decisión:** uno para la evaluación batch (B-012.2) y otro para las señales en vivo, con especializaciones propias.
3. **Un solo punto de decisión:** `decide()` del agente recibe estado + evaluación + contexto de señales (`DecisionContext.strikes`), todo persistido en SQLite; la regla concreta vive en `practice_rules.py`, puro y testeable.

## Decisión

Opción 3, con el reparto que ya marcaba la issue:

- **El navegador mide, el backend decide.** El front solo emite el sobre `practice` (`gate`, `measure`, `outcome`, `wait_ms`, `hand`). El backend agrega: grano = gate (un fallo por gate, deduplicado por id y con el último outcome mandando), decisión = compás (los fallos se cuentan por compás y se reinician con la intervención o el acierto).
- **Reglas deterministas en `practice_rules.py`:** 2 gates fallados → `slow_down`; 3 → `give_hint`; `timeout` en un gate (silencio del alumno) → `demonstrate` de ese compás. Sin evaluación previa requerida, con prioridad sobre el corte por silencio porque en el modo espera el silencio es el estado normal.
- **Topes anti-bucle:** máximo de bajadas de tempo, pistas y demostraciones por compás, y tope de intervenciones por sesión (`InterventionLimits`); al llegar a un tope las reglas callan y queda la recuperación manual del gate.
- **Registro y reinicio:** cada intervención ejecutada se guarda en `agent_decisions` (migración `0013`) con `baseline_signal_id` (la última señal de práctica vista al ejecutar): las señales anteriores ya motivaron su intervención y no cuentan otra vez, sin borrar el historial de `practice_signals`.
- **Cierre del bucle:** una demostración de strikes programa su propia `return_control` (el backend conoce la duración de la ventana demostrada con la rejilla de B-008, más margen de canal); al returnar, el transporte recarga la pieza del modo del alumno y reanuda al **inicio del compás demostrado** con el tempo vigente, así que el gate se rearma solo. Durante la intervención los gates están desactivados (quien toca la demo no es el alumno).
- **El LLM narra, no decide:** la escalera es fija (2/3/silencio) y la lista blanca del ADR 0004 la acota; las reglas de strikes entran por `decide()`, que es la única función de decisión.

## Consecuencias

- Todo funciona sin red: `MockProvider` y reglas; el chat puede explicar lo ocurrido pero no puede apartar a la regla.
- La métrica es del gate, no de la calidad musical: no mide dinámica ni digitación.
- `agent_decisions` introduce un registro de intervenciones reutilizable por el observatorio del agente (verduras futuras), a costa de una tabla por sesión.
- La devolución automática usa el tiempo estimado de la ventana; si el front tarda más del margen, el `return_control` puede llegar con la demo aún en marcha: el sobre es la cuenta atrás real del front y el control efectivo lo decide el último sobre recibido (B-012.5), que en este caso es justo el que la devuelve.

## Referencias

`backend/src/piano_mentor/practice_rules.py`, `backend/src/piano_mentor/agent.py`, `backend/src/piano_mentor/migrations/0013_add_agent_decisions.sql`, `frontend/src/lib/gate-controller.ts`, `docs/issues/B-032/B-032.6.md`.
