<!-- description: ADR 0001: un monorepo para backend, frontend, contratos y documentación. -->
<!-- context: Explica por qué el backend se construye desde la raíz y por qué los contratos viven en shared/. -->

# 0001 — Un monorepo para backend, frontend y contratos

- **Estado:** aceptada
- **Fecha:** 2026-10-23 · registrada a posteriori (decisión de la semana 1)
- **Sustituye a:** —
- **Sustituida por:** —

## Contexto

El MVP se construye en cinco semanas con un desarrollador y varios agentes trabajando en paralelo sobre las mismas funcionalidades. Casi ningún cambio se queda en una capa: una nota MIDI nueva afecta al parser, al contrato HTTP, al cliente TypeScript y a los tests de ambos lados. Además, el backend se despliega en Render y necesita el corpus `data/midi` dentro de la imagen, y el contrato de las acciones del agente lo consumen backend y frontend.

## Opciones consideradas

1. **Dos repositorios** (`backend`, `frontend`) más un paquete de contratos aparte. Aislamiento máximo, pero tres versiones que sincronizar y ningún commit atómico entre capas.
2. **Monorepo** con `backend/`, `frontend/`, `shared/`, `data/` y `docs/`. Un solo historial, un solo `git clone` y un commit por cambio completo.

## Decisión

Monorepo. El backend se construye con contexto en la raíz (`docker-compose.yml` y `backend/Dockerfile`) precisamente para poder hornear `data/midi` en la imagen, y `.dockerignore` recorta lo que no pertenece al build. `shared/schemas/` es la frontera de contratos entre Python y TypeScript.

## Consecuencias

- Un cambio de contrato se revisa y se prueba en un único diff; los tests de backend y frontend corren desde la misma raíz.
- El despliegue queda partido por herramienta, no por repositorio: Render construye desde la raíz con `backend/Dockerfile`; Vercel despliega con `frontend/` como raíz.
- El repositorio pesa más y el contexto de build hay que cuidarlo; se mitiga con `.dockerignore` y `.gitignore`.
- Si el producto crece hasta necesitar equipos separados, se puede dividir sin reescribir la lógica: las fronteras ya están en `shared/` y en la API HTTP.

## Referencias

`README.md` §1.1, `docker-compose.yml`, `.dockerignore`, `docs/architecture/architecture_base.md` §4.
