<!-- description: ADR 0002: el motor musical es determinista y el LLM queda fuera del bucle de notas. -->
<!-- context: Gobierna B-005, B-008, B-009 y B-012: evaluación, reglas y validación no dependen del proveedor LLM. -->

# 0002 — El motor musical es determinista y no depende del LLM

- **Estado:** aceptada
- **Fecha:** 2026-10-23 · registrada a posteriori (decisión de la semana 1)
- **Ámbito:** B-005 (normalización), B-008 (compases), B-009 (acordes), B-012 (evaluación, estados y validación)
- **Sustituye a:** —
- **Sustituida por:** —

## Contexto

La evaluación de una interpretación tiene que ser reproducible: el mismo MIDI y los mismos `note_on` deben dar la misma puntuación, siempre. También tiene que poder probarse sin red, sin clave de API y sin coste, y la demo debe funcionar con `LLM_PROVIDER=mock`. Un LLM no garantiza nada de eso: puede variar entre ejecuciones y su razonamiento no es inspeccionable.

## Opciones consideradas

1. **El LLM evalúa y decide:** menos reglas que escribir, pero resultados no reproducibles, tests imposibles y dependencia de red en el camino crítico.
2. **Motor determinista y LLM solo para lenguaje:** más código de reglas, pero cada decisión es auditable y testeable.

## Decisión

Opción 2. El parsing MIDI, el `TempoMap`, el reloj, la evaluación (`PerformanceEvaluator`), la máquina de estados y la validación de acciones son código puro y determinista. El LLM solo propone texto y acciones de una lista blanca; nunca puntúa, nunca mueve una nota y nunca es requisito para que el flujo funcione.

## Consecuencias

- Los tests comparan números reales (notas correctas, `timing_ms`, `score_total`) en vez de comprobar que "algo devolvió algo".
- La demo y el CI funcionan sin clave; `MockProvider` es el último eslabón obligatorio de la cadena de proveedores.
- Escribir las reglas cuesta más que delegar en el modelo, y una regla mala no la arregla el LLM: se arregla con un test.
- El LLM queda acotado a lo que aporta valor real: redactar la pista y elegir qué intervención tiene sentido.

## Referencias

`README.md` §5 (principios 2 y 5), `backend/src/piano_mentor/evaluation.py`, `backend/src/piano_mentor/llm.py`.
