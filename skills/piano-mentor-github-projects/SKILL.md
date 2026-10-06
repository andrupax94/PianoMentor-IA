---
name: piano-mentor-github-projects
description: Automatización de GitHub Projects para PianoMentor AI. Usar al crear o reutilizar Issues, añadirlos al Project, sincronizar Priority y Target date, exportar un respaldo local, detectar duplicados, revisar límites de API o decidir cómo reflejar Sub-issues en PLAN.md.
---

# GitHub Projects de PianoMentor AI

## Alcance

Aplicar este flujo al repositorio `andrupax94/PianoMentor-IA` y al Project `@andrupax94 PianoMentor IA` (actualmente número `1`). Confirmar los valores en los scripts antes de actuar si el repositorio o Project han cambiado.

La fuente estratégica es `PLAN.md`. El backlog operativo es `.github/project-backlog.csv`. La guía detallada es `.github/README.md`.

## Prerrequisitos

- Ejecutar desde la raíz del repositorio.
- Verificar `gh auth status`; nunca leer, imprimir ni copiar tokens.
- El token de GitHub CLI necesita el scope `project` para listar y editar Projects.
- No usar el contenido de `.env` como sustituto automático de la sesión de `gh`.
- Si GitHub devuelve `GraphQL: API rate limit exceeded`, consultar el estado y esperar hasta `resetAt`; no repetir en bucle.

Consultar el límite sin mostrar secretos:

```powershell
gh api graphql -f query='{ rateLimit { limit remaining resetAt cost } }'
```

La cuota GraphQL habitual es de 5.000 puntos por hora por usuario. REST y GraphQL tienen límites separados.

## Orden normal de ejecución

### 1. Previsualizar

```powershell
.\.github\scripts\import-github-issues.ps1 -Preview
```

El preview no crea Issues ni consulta Projects. Sirve para validar el CSV y los títulos generados.

### 2. Importar y sincronizar

```powershell
.\.github\scripts\import-github-issues.ps1
```

Este script:

1. Lee `.github/project-backlog.csv`.
2. Busca Issues por el ID estable `[B-xxx]`, no por el título completo; esto evita fallos por tildes y `ñ`.
3. Reutiliza Issues existentes o crea los que falten.
4. Añade los Issues al Project y tolera elementos ya presentes.
5. Ejecuta `sync-github-project.ps1` al finalizar.

### 3. Sincronizar solo campos

Usar cuando los Issues ya existen o cuando una importación quedó interrumpida:

```powershell
.\.github\scripts\sync-github-project.ps1 -Preview
.\.github\scripts\sync-github-project.ps1
```

Actualiza solamente `Priority` y `Target date`. No modificar desde estos scripts:

- `Status`.
- `Start date`.
- `Linked pull requests`.
- `Sub-issues`.

La fecha base predeterminada es `2026-10-06` y las fechas objetivo son el final de cada semana:

- Semana 1: `2026-10-12`.
- Semana 2: `2026-10-19`.
- Semana 3: `2026-10-26`.
- Semana 4: `2026-11-02`.
- Semana 5: `2026-11-09`.

Para mover el calendario, pasar otra fecha explícita:

```powershell
.\.github\scripts\sync-github-project.ps1 -PlanningStartDate '2026-10-13'
```

El sincronizador consulta los elementos reales del Project y actualiza todas las filas que compartan un ID. Esto es importante si existen duplicados como `B-006` o `B-007`.

### 4. Exportar respaldo local

```powershell
.\.github\scripts\export-github-project.ps1
```

Genera `.github/project-backup.json`, incluyendo Project, campos y elementos con los valores que GitHub devuelva. Ejecutarlo antes de analizar cambios, crear nuevas Sub-issues o modificar `PLAN.md`.

Para guardar una instantánea fechada:

```powershell
.\.github\scripts\export-github-project.ps1 -OutputPath '.github/backups/project-2026-10-06.json'
```

## Mantenimiento del plan

- Mantener `PLAN.md` como fuente de verdad, no convertir automáticamente cada Sub-issue en una fase nueva.
- Tras exportar el respaldo, comparar nuevas Sub-issues con el backlog y decidir si son:
  - detalle técnico que permanece solo en GitHub;
  - nueva tarea del backlog;
  - cambio de alcance que requiere actualizar `PLAN.md`.
- Si se actualiza el plan, mantener coherencia con `.github/project-backlog.csv`, prioridades, semanas y criterios de aceptación.
- No borrar Issues duplicados automáticamente. Reportar sus IDs y URLs y pedir o aplicar una decisión explícita de cuál conservar.

## Diagnóstico

### Issue visible pero no encontrado

No comparar el título completo. Buscar por `[B-xxx]` y operar sobre los elementos del Project, no sobre el primer Issue que devuelva el repositorio.

### Elemento ya existente

`Content already exists in this project` no es un error fatal: continuar.

### Rate limit

No es un límite diario. Es una cuota GraphQL por hora que se restablece en `resetAt`. Esperar y después ejecutar primero el exportador o el sincronizador en modo preview.

### Campos no encontrados

Comprobar que el Project tenga campos llamados `Priority` y `Target date`. El sincronizador adapta `P0/P1/P2` a opciones estándar (`Urgent/High`, `High/Medium`, `Medium/Low`) cuando no existen opciones P0/P1/P2.

## Seguridad

- No mostrar valores de `GH_TOKEN`, `GITHUB_TOKEN` ni `.env`.
- No solicitar al usuario que pegue tokens en el chat.
- No eliminar datos del Project automáticamente.
- Mantener respaldos locales sin secretos y revisar su contenido antes de publicarlos.