# Backlog de GitHub Projects

Este directorio contiene una exportación operativa del backlog de cinco semanas para usarlo con GitHub Issues y GitHub Projects.

## Archivos

- `project-backlog.csv`: tareas del backlog con prioridad, semana, área, riesgo, tamaño y dependencias.
- `scripts/import-github-issues.ps1`: crea o reutiliza Issues, usa `issues/B-xxx/B-xxx.md` como cuerpo cuando existe, los añade al Project y sincroniza `Priority` y `Target date`.
- `scripts/create-github-subissues.ps1`: crea o reutiliza las Sub-issues documentadas en `issues/B-xxx/B-xxx.N.md`, las vincula a su Issue principal y puede añadirlas al Project.
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

## Documentos de Issues y Sub-issues

Los documentos operativos viven en [`/issues`](../issues/), agrupados en una carpeta por Issue principal. Por ejemplo, `issues/B-001/B-001.md` resume la Issue principal y cada `issues/B-001/B-001.N.md` contiene el objetivo, dependencias, criterios y evidencia de una Sub-issue. Si el documento local no existe, el importador no modifica el cuerpo remoto de esa Issue. La lista de Issues, incluyendo `body`, se consulta una sola vez por ejecución, no una vez por tarea.

Por defecto, el importador solo procesa Issues que tienen su documento local. Si falta `issues/B-xxx/B-xxx.md`, la tarea se omite completamente: no ejecuta `issue edit`, `issue create` ni `project item-add` para ella. Para procesar también tareas sin documento —usando el cuerpo genérico del CSV— hay que indicarlo explícitamente con `-IncludeMissingIssueDocs`.

```powershell
.\.github\scripts\import-github-issues.ps1 -IncludeMissingIssueDocs
```

Para reemplazar explícitamente el cuerpo de las Issues que sí tengan documento local:

```powershell
.\.github\scripts\import-github-issues.ps1 -ForceIssueBodies
```

`-ForceIssueBodies` no inventa documentos: las Issues sin `issues/B-xxx/B-xxx.md` se conservan sin modificar.

Para previsualizar las Sub-issues de B-001:

```powershell
.\.github\scripts\create-github-subissues.ps1 -ParentId B-001 -Preview
```

Para crearlas, vincularlas al padre y añadirlas al Project #1:

```powershell
.\.github\scripts\create-github-subissues.ps1 -ParentId B-001
```

El script es reejecutable: localiza las Issues por el identificador estable `[B-001.1]`, actualiza su cuerpo con el Markdown y no crea duplicados. Para crear o actualizar las Sub-issues sin consumir solicitudes del Project:

```powershell
.\.github\scripts\create-github-subissues.ps1 -ParentId B-001 -SkipProject
```

La relación de padre/Sub-issue se crea con la opción oficial `gh issue create --parent`. La columna `Sub-issues progress` del Project mostrará el avance automáticamente cuando las Sub-issues estén vinculadas.

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
