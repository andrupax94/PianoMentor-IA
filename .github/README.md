# Backlog de GitHub Projects

Este directorio contiene una exportación operativa del backlog de cinco semanas para usarlo con GitHub Issues y GitHub Projects.

## Archivos

- `project-backlog.csv`: tareas del backlog con prioridad, semana, área, riesgo, tamaño y dependencias.
- `scripts/import-github-issues.ps1`: crea o reutiliza Issues, los añade al Project y sincroniza `Priority` y `Target date`.
- `scripts/sync-github-project.ps1`: compara primero con `project-backup.json` y rellena solo `Priority` y `Target date` vacíos o modificados, sin tocar `Status`, `Start date`, Pull Requests ni Sub-issues.
- `scripts/export-github-project.ps1`: descarga el estado del Project a `project-backup.json` para mantener un respaldo local legible.

## Requisitos

- GitHub CLI instalado.
- Sesión autenticada con `gh auth login` en tu terminal personal.
- Permiso para crear Issues en el repositorio.
- Si se vincula a un Project, permiso para editar ese Project.

## Vista recomendada en GitHub Projects

El Project existente aparece en la CLI como `@andrupax94 PianoMentor IA` (número `1`) y pertenece a `andrupax94`. Debe tener:

- Vista Board agrupada por `Status`.
- Vista Table para revisar el backlog.
- Vista Roadmap o Timeline agrupada por `Week`.
- Campos: `Priority`, `Week`, `Area`, `Risk` y `Size`.
- Estados: `Backlog`, `Ready`, `In Progress`, `Blocked`, `Review`, `Done`.

## Uso en modo preview

Desde la raíz del repositorio:

```powershell
.\.github\scripts\import-github-issues.ps1 -Repository "andrupax94/PianoMentor-IA" -Preview
```

## Crear Issues

```powershell
.\.github\scripts\import-github-issues.ps1 -Repository "andrupax94/PianoMentor-IA"
```

## Crear Issues y añadirlos al Project `PianoMentor IA`

El script usa por defecto el repositorio `andrupax94/PianoMentor-IA`, el propietario `andrupax94` y el Project `#1`. Por tanto, puedes ejecutar:

```powershell
.\.github\scripts\import-github-issues.ps1
```

También puedes especificar el nombre explícitamente:

```powershell
.\.github\scripts\import-github-issues.ps1 `
  -Repository "andrupax94/PianoMentor-IA" `
  -ProjectOwner "andrupax94" `
  -ProjectTitle "PianoMentor IA"
```

Si el nombre no se resuelve o hay más de un Project con ese título, indica su número manualmente con `-ProjectNumber`. El script crea los Issues y los añade al Project. La configuración de campos personalizados y vistas se recomienda hacerla manualmente una sola vez en GitHub Projects.

La importación es reejecutable: si un Issue con el mismo título ya existe, se reutiliza; si ya está dentro del Project, se continúa sin considerarlo un error.

## Rellenar Priority y Target date

El sincronizador usa como inicio de planificación el **6 de octubre de 2026** y asigna como fecha objetivo el final de cada semana:

| Semana | Target date |
|---|---|
| Semana 1 | 2026-10-12 |
| Semana 2 | 2026-10-19 |
| Semana 3 | 2026-10-26 |
| Semana 4 | 2026-11-02 |
| Semana 5 | 2026-11-09 |

La fecha de inicio no se modifica. Puedes revisar primero los valores:

```powershell
.\.github\scripts\sync-github-project.ps1 -Preview
```

Si el resultado es correcto, aplica los cambios:

```powershell
.\.github\scripts\sync-github-project.ps1
```

El script intenta usar `P0/P1/P2` si esas opciones existen. Si el campo Priority usa las opciones estándar de GitHub, utiliza este mapeo:

```text
P0 → Urgent o High
P1 → High o Medium
P2 → Medium o Low
```

El sincronizador es **local-first**: necesita `.github/project-backup.json` para saber qué tareas ya tienen los valores correctos. Las tareas sin cambios no generan solicitudes a GitHub. Si no existe el respaldo, hay que generarlo cuando la cuota GraphQL esté disponible.

## Generar respaldo local del Project

```powershell
.\.github\scripts\export-github-project.ps1
```

Esto genera:

```text
.github/project-backup.json
```

El respaldo incluye la fecha de exportación, el Project, sus campos y todos sus elementos, incluyendo el estado actual de Issues, Pull Requests y Sub-issues cuando GitHub los devuelve. `Start date` no se modifica por ningún script.

Para usar otro archivo de salida:

```powershell
.\.github\scripts\export-github-project.ps1 -OutputPath ".github/backups/project-2026-10-06.json"
```

## Relación con la documentación

El CSV refleja el backlog operativo de [PLAN.md](../PLAN.md), pero `PLAN.md` sigue siendo la fuente de verdad para el alcance, el cronograma y la aceptación del MVP.
