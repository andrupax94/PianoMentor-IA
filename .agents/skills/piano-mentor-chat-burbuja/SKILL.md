---
name: piano-mentor-chat-burbuja
description: La voz y el rol del chat del mentor en PianoMentor AI — el chat como cara del profesor y como informante de la práctica. Usar al añadir cualquier mensaje dirigido al alumno (feed informativo, oferta de demostración, resultado de una evaluación), al cablear eventos de página hacia la burbuja, o al decidir qué comunica el chat frente a lo que muestra el panel de estado.
license: Complete terms in LICENSE.txt
---
<!-- description: Skill de la burbuja del mentor: voz, qué se informa y qué no, y cómo se cablea. -->
<!-- context: Cargar al tocar MentorChat, chat-feed, agent_hint, ofertas (B-032.7) o cualquier mensaje dirigido al alumno. -->

# PianoMentor AI — la voz del chat

## Objetivo

El chat del mentor es la cara del profesor. No es un panel de diagnóstico ni un log del sistema. Su trabajo pedagógico es doble: **contestar lo que el alumno pregunta** y **contar lo que pasa en la práctica** — en el lenguaje de un profesor, no en el de un sistema.

## Principios obligatorios

1. **Doble canal con dos voces distintas:**
   - la **conversación** (pregunta → respuesta del agente, con LLM);
   - el **feed informativo** (lo que hace la página → línea determinista, sin LLM).
   El feed nunca borra una respuesta de conversación, no entra en la memoria que viaja al LLM y no activa la animación de escritura.
2. **Primera persona del mentor, segunda del alumno.** El feed habla como el profesor: «Reproduciendo Pieza de práctica», «Te espero en la primera nota». Nunca en tercera impersonal ni en modo telemático.
3. **El estado del sistema no se canta en el chat.** Compás en curso, latencia, conexión o proveedor viajan por el panel de estado (`SessionStatus`); en el chat no hay `PATCH`, `WS`, UUID, códigos HTTP ni «Estatus de sesión: conectado». Lo equivalente bien dicho es «Listo para practicar».
4. **Determinista ante todo.** La misma señal produce siempre la misma frase. El feed no compone frases libres ni acepta variaciones del LLM: el LLM solo contesta conversación, el feed es texto listo.
5. **Buffer corto y anti-ruido:** el feed tiene un tope (3–5 líneas) para que no se vuelva un log de sistema. Sobre-informar es un defecto, no una riqueza: si una página dispara diez eventos, el feed se agota en su umbral.
6. **El LLM narra, el feed no decide.** Las acciones que el backend propone (p. ej. `offer_demo` de B-032.7) se cuentan como pregunta con opciones; la decisión es siempre del alumno, no del feed ni del tick del WebSocket.

## Qué se informa y qué no

| Se informa en el chat | No se informa en el chat |
|---|---|
| Entrar o salir de una sesión de práctica | Cambio de `status` (`idle → playing`) por sí solo |
| Reproducir, pausar, detener | Compás en curso, latencia, conexión |
| Cambio de modo (Observar / Una mano / Dos manos) | Cada nota, cada gate, cada strike individual |
| Oferta del agente («¿Te lo muestro?») | Códigos de error HTTP o del WS (van al error del chat o del panel) |
| Resultado de una evaluación (B-014 si llega) | Consultas y respuestas normales de conversación |

## Redacción (guía)

- Tono de aula, empático, en español. Sin siglas técnicas.
- Corto: una frase por línea informativa. Si hace falta más, se parte en dos entradas o queda en el panel.
- Referirse a lo que **hace el alumno**, no a lo que hace el backend: «Reproduciendo» (no «El backend activó el transporte»).
- Nada de preguntar por gusto: la única pregunta con opciones que hace el chat es la de la intervención del agente (B-032.7).

## Integración técnica

- Módulo puro `frontend/src/lib/chat-feed.ts` (o *informant-store*):
  - `subscribeChatFeed` + snapshot para `useSyncExternalStore`;
  - API `inform(text)`;
  - buffer corto sin persistir en `chat_messages` ni en `localStorage`.
- Emisores: `PlaybackArea`, `PracticeBridge`, `SongDetailPanel`. El feed se consume desde `MentorChat` con un estilo propio (`.informantLine`), separado del estilo de la burbuja de conversación.
- Las señales del feed salen de lo que el front ya recibe (`session-store`, `piece-store` y el transporte); el backend nunca envía texto para el feed.

## Checklist antes de entregar

- [ ] Todo mensaje al alumno tiene voz asignada: conversación (LLM) o feed (determinista).
- [ ] La línea informativa no borra ni interrumpe la conversación.
- [ ] Sin `status`/códigos/siglas saliendo por el chat; lo técnico queda en el panel correspondiente.
- [ ] El feed es determinista (misma señal → misma frase), con buffer corto.
- [ ] Tests: el `inform` del feed, el tope del buffer y que no contamina la conversación (ni el historial del LLM).
- [ ] Verificación visual pendiente del usuario, según la normal del proyecto.
