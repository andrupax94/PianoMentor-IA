[CmdletBinding()]
param(
    [string]$CsvPath = (Join-Path $PSScriptRoot '..\project-backlog.csv'),
    [string]$Repository = 'andrupax94/PianoMentor-IA',
    [string]$ProjectOwner = 'andrupax94',
    [string]$ProjectTitle = '@andrupax94 PianoMentor IA',
    [int]$ProjectNumber = 0,
    [datetime]$PlanningStartDate = [datetime]'2026-10-06',
    [switch]$Preview,
    [switch]$SkipFieldSync,
    [switch]$ForceIssueBodies,
    [switch]$IncludeMissingIssueDocs
)

$ErrorActionPreference = 'Stop'

function Write-Utf8NoBom {
    param([string]$Path, [string]$Content)
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function Invoke-Gh {
    param([string[]]$Arguments)
    & gh @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Falló gh $($Arguments -join ' ') con código $LASTEXITCODE."
    }
}

function Resolve-ProjectNumber {
    param([string]$Owner, [string]$Title)

    $projectsJson = & gh project list --owner $Owner --format json
    if ($LASTEXITCODE -ne 0) {
        throw "No se pudo consultar los Projects del usuario $Owner."
    }

    $projects = ($projectsJson | Out-String | ConvertFrom-Json).projects
    $match = @($projects | Where-Object { $_.title -eq $Title })
    if ($match.Count -eq 0) {
        throw "No se encontró un Project llamado '$Title' para el propietario '$Owner'."
    }
    if ($match.Count -gt 1) {
        throw "Hay varios Projects llamados '$Title'. Indica -ProjectNumber manualmente."
    }
    return [int]$match[0].number
}

function Get-OrCreateIssue {
    param(
        [string]$Repo,
        [string]$Id,
        [string]$Title,
        [string]$BodyFile,
        [string[]]$IssueLabels,
        [object[]]$ExistingIssues,
        [bool]$IssueDocumentExists,
        [switch]$ForceBody
    )

    $idPattern = '\[' + [regex]::Escape($Id) + '\]'
    $existing = $existingIssues | Where-Object { $_.title -match $idPattern } | Select-Object -First 1
    if ($null -ne $existing) {
        if (-not $IssueDocumentExists) {
            Write-Warning "No existe documento local para $Id; se conserva sin modificar el cuerpo remoto."
        }
        elseif ($ForceBody -or [string]::IsNullOrWhiteSpace([string]$existing.body)) {
            $bodyOutput = & gh issue edit "$($existing.number)" --repo $Repo --body-file $BodyFile 2>&1
            if ($LASTEXITCODE -ne 0) {
                throw "No se pudo actualizar el cuerpo del Issue existente $Title.`n$($bodyOutput | Out-String)"
            }
            if ($ForceBody) { Write-Output "Issue existente actualizado forzosamente desde Markdown: $Title" }
            else { Write-Output "Issue existente con cuerpo vacío actualizado desde Markdown: $Title" }
        }
        else {
            Write-Output "Issue existente con cuerpo conservado: $Title"
        }
        return $existing.url
    }

    $createdUrl = & gh issue create --repo $Repo --title $Title --body-file $BodyFile --label ($IssueLabels -join ',')
    if ($LASTEXITCODE -ne 0) {
        throw "No se pudo crear el Issue $Title."
    }
    return $createdUrl
}

if (-not (Test-Path $CsvPath)) {
    throw "No existe el CSV: $CsvPath"
}

if (-not (Get-Command gh.exe -ErrorAction SilentlyContinue)) {
    throw "GitHub CLI (gh) no está instalado o no está disponible en PATH."
}

if ([string]::IsNullOrWhiteSpace($Repository)) {
    $Repository = (git remote get-url origin 2>$null)
    if ($Repository -match 'github.com[:/](.+?)(?:\.git)?$') {
        $Repository = $Matches[1]
    }
}

if ([string]::IsNullOrWhiteSpace($Repository) -or $Repository -notmatch '^[^/]+/[^/]+$') {
    throw "El repositorio debe tener el formato owner/repo, por ejemplo andrupax94/PianoMentor-IA."
}

Invoke-Gh @('auth', 'status')
$items = Import-Csv -LiteralPath $CsvPath
$existingIssues = @()
if (-not $Preview) {
    $existingJson = & gh issue list --repo $Repository --state all --limit 1000 --json number,title,url,body
    if ($LASTEXITCODE -ne 0) {
        throw "No se pudieron consultar los Issues existentes del repositorio $Repository."
    }
    $existingIssues = @($existingJson | Out-String | ConvertFrom-Json)
    Write-Output "Issues existentes consultados una sola vez: $($existingIssues.Count)"
}
$labels = @('P0', 'P1', 'P2', 'Semana 1', 'Semana 2', 'Semana 3', 'Semana 4', 'Semana 5', 'MIDI', 'Backend', 'Frontend', 'Evaluación', 'Agente', 'IA', 'Deploy', 'Video', 'Comunicación', 'Arquitectura', 'Calidad', 'Documentación')

if (-not $Preview -and $ProjectNumber -le 0 -and -not [string]::IsNullOrWhiteSpace($ProjectTitle)) {
    $ProjectNumber = Resolve-ProjectNumber -Owner $ProjectOwner -Title $ProjectTitle
    Write-Output "Project encontrado: '$ProjectTitle' (#$ProjectNumber)"
}

if ($Preview) {
    Write-Output "Modo preview. No se crearán Issues ni se consultará Projects. Repositorio: $Repository"
    Write-Output "Project previsto: '$ProjectTitle' (propietario: $ProjectOwner)"
}

foreach ($item in $items) {
    $title = "[$($item.ID)] $($item.Title)"
    $body = @"
## Objetivo
$($item.Description)

## Metadatos

| Campo | Valor |
|---|---|
| ID | $($item.ID) |
| Prioridad | $($item.Priority) |
| Semana | $($item.Week) |
| Área | $($item.Area) |
| Riesgo | $($item.Risk) |
| Tamaño | $($item.Size) |
| Estado inicial | $($item.Status) |
| Dependencias | $($item.DependsOn) |

## Criterio inicial
Implementar, probar y documentar esta tarea sin mezclar responsabilidades de otras capas.

> Fuente: [backlog inicial](../../blob/main/.github/project-backlog.csv)
"@
    $issueDocPath = Join-Path (Join-Path (Join-Path $PSScriptRoot '..\..\issues') $item.ID) "$($item.ID).md"
    $issueDocumentExists = Test-Path $issueDocPath
    if (Test-Path $issueDocPath) {
        $body = Get-Content -LiteralPath $issueDocPath -Raw -Encoding UTF8
        $body += "`r`n`r`n---`r`n`r`n> Documento local: [issues/$($item.ID)/$($item.ID).md](../../blob/main/issues/$($item.ID)/$($item.ID).md)"
        Write-Output "$($item.ID): usando documento $issueDocPath"
    }
    else {
        Write-Warning "$($item.ID): no existe $issueDocPath; no se actualizará el cuerpo de esa Issue."
        if (-not $IncludeMissingIssueDocs) {
            Write-Output "$($item.ID): omitida por falta de Markdown; no se consultará ni modificará GitHub para esta tarea."
            continue
        }
    }

    $labelsForIssue = @($item.Priority, $item.Week, $item.Area)
    if ($Preview) {
        Write-Output "ISSUE: $title | labels=$($labelsForIssue -join ', ')"
        continue
    }

    foreach ($label in $labelsForIssue) {
        if ($labels -contains $label) {
            & gh label create $label --repo $Repository --color '0E8A16' --force 2>$null | Out-Null
        }
    }

    $tempBody = Join-Path ([System.IO.Path]::GetTempPath()) ("piano-mentor-$($item.ID).md")
    try {
        Write-Utf8NoBom -Path $tempBody -Content $body
        $issueUrl = Get-OrCreateIssue -Repo $Repository -Id $item.ID -Title $title -BodyFile $tempBody -IssueLabels $labelsForIssue -ExistingIssues $existingIssues -IssueDocumentExists $issueDocumentExists -ForceBody:$ForceIssueBodies | Select-Object -Last 1
        Write-Output "$($item.ID): $issueUrl"

        if ($ProjectNumber -gt 0) {
            $projectOutput = & gh project item-add "$ProjectNumber" --owner $ProjectOwner --url $issueUrl 2>&1
            if ($LASTEXITCODE -ne 0) {
                $projectMessage = $projectOutput | Out-String
                if ($projectMessage -match 'Content already exists|already exists') {
                    Write-Output "$($item.ID): ya estaba en el Project"
                }
                else {
                    throw "No se pudo añadir $($item.ID) al Project: $projectMessage"
                }
            }
            else {
                $projectOutput | ForEach-Object { Write-Output $_ }
            }
        }
    }
    finally {
        Remove-Item $tempBody -Force -ErrorAction SilentlyContinue
    }
}

Write-Output 'Importación completada.'
if ($ProjectNumber -le 0) {
    Write-Output "No se vinculó ningún Project. Indica -ProjectTitle o -ProjectNumber si quieres añadir los Issues al Project '$ProjectTitle'."
}
elseif (-not $Preview -and -not $SkipFieldSync) {
    $syncScript = Join-Path $PSScriptRoot 'sync-github-project.ps1'
    $backupPath = Join-Path $PSScriptRoot '..\project-backup.json'
    if (-not (Test-Path $syncScript)) {
        throw "No se encontró el sincronizador de campos: $syncScript"
    }
    if (Test-Path $backupPath) {
        Write-Output 'Actualizando Priority y Target date usando el respaldo local...'
        & $syncScript -CsvPath $CsvPath -BackupPath $backupPath -Repository $Repository -ProjectOwner $ProjectOwner -ProjectTitle $ProjectTitle -ProjectNumber $ProjectNumber -PlanningStartDate $PlanningStartDate
        if ($LASTEXITCODE -ne 0) {
            throw "Falló la sincronización local de campos del Project."
        }
    }
    else {
        Write-Warning "No existe $backupPath. Issues importados; Priority y Target date se sincronizarán después de generar el respaldo local."
    }
}
