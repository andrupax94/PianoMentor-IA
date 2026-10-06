[CmdletBinding()]
param(
    [string]$CsvPath = (Join-Path $PSScriptRoot '..\project-backlog.csv'),
    [string]$Repository = 'andrupax94/PianoMentor-IA',
    [string]$ProjectOwner = 'andrupax94',
    [string]$ProjectTitle = '@andrupax94 PianoMentor IA',
    [int]$ProjectNumber = 1,
    [datetime]$PlanningStartDate = [datetime]'2026-10-06',
    [switch]$Preview
)

$ErrorActionPreference = 'Stop'

function Invoke-GhText {
    param([string[]]$Arguments)
    $result = & gh @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Falló gh $($Arguments -join ' ') con código $LASTEXITCODE.`n$($result | Out-String)"
    }
    return ($result | Out-String)
}

function Resolve-ProjectNumber {
    param([string]$Owner, [string]$Title)
    $json = Invoke-GhText @('project', 'list', '--owner', $Owner, '--format', 'json')
    $projects = ($json | ConvertFrom-Json).projects
    $matches = @($projects | Where-Object { $_.title -eq $Title })
    if ($matches.Count -eq 0) { throw "No se encontró el Project '$Title' para '$Owner'." }
    if ($matches.Count -gt 1) { throw "Hay varios Projects llamados '$Title'. Indica -ProjectNumber." }
    return [int]$matches[0].number
}

function Get-ProjectFields {
    param([string]$Owner, [int]$Number)
    $json = Invoke-GhText @('project', 'field-list', "$Number", '--owner', $Owner, '--format', 'json')
    return ($json | ConvertFrom-Json).fields
}

function Get-FieldName {
    param($Fields, [string[]]$Candidates)
    foreach ($candidate in $Candidates) {
        $field = $Fields | Where-Object { $_.name -ieq $candidate } | Select-Object -First 1
        if ($null -ne $field) { return $field.name }
    }
    return $null
}

function Resolve-PriorityValue {
    param($PriorityField, [string]$Priority)
    $options = @($PriorityField.options | ForEach-Object { $_.name })
    $preferred = switch ($Priority) {
        'P0' { @('P0', 'Urgent', 'High') }
        'P1' { @('P1', 'High', 'Medium') }
        'P2' { @('P2', 'Medium', 'Low') }
        default { @($Priority) }
    }
    foreach ($candidate in $preferred) {
        $match = $options | Where-Object { $_ -ieq $candidate } | Select-Object -First 1
        if ($null -ne $match) { return $match }
    }
    throw "No hay una opción compatible para '$Priority' en Priority. Opciones disponibles: $($options -join ', ')"
}

function Get-ProjectItems {
    param([string]$Owner, [int]$Number)
    $json = Invoke-GhText @('project', 'item-list', "$Number", '--owner', $Owner, '--format', 'json', '--limit', '1000')
    return @($json | ConvertFrom-Json)
}

function Get-ProjectItemTitle {
    param($Item)
    if (-not [string]::IsNullOrWhiteSpace([string]$Item.title)) { return [string]$Item.title }
    if ($null -ne $Item.content -and -not [string]::IsNullOrWhiteSpace([string]$Item.content.title)) { return [string]$Item.content.title }
    return ''
}

function Get-ProjectItemUrl {
    param($Item)
    if ($null -ne $Item.content -and -not [string]::IsNullOrWhiteSpace([string]$Item.content.url)) { return [string]$Item.content.url }
    if (-not [string]::IsNullOrWhiteSpace([string]$Item.url) -and [string]$Item.url -match '/issues/|/pull/') { return [string]$Item.url }
    return $null
}

function Get-WeekNumber {
    param([string]$Week)
    if ($Week -notmatch '(\d+)') { throw "Semana no reconocida: '$Week'" }
    return [int]$Matches[1]
}

if (-not (Test-Path $CsvPath)) { throw "No existe el CSV: $CsvPath" }
if (-not (Get-Command gh.exe -ErrorAction SilentlyContinue)) { throw 'GitHub CLI (gh) no está disponible en PATH.' }
if ($ProjectNumber -le 0) { $ProjectNumber = Resolve-ProjectNumber -Owner $ProjectOwner -Title $ProjectTitle }

$items = Import-Csv -LiteralPath $CsvPath
$fields = Get-ProjectFields -Owner $ProjectOwner -Number $ProjectNumber
$priorityFieldName = Get-FieldName -Fields $fields -Candidates @('Priority')
$targetDateFieldName = Get-FieldName -Fields $fields -Candidates @('Target date', 'Target Date')
if ($null -eq $priorityFieldName) { throw "No se encontró el campo Priority en el Project." }
if ($null -eq $targetDateFieldName) { throw "No se encontró el campo Target date en el Project." }
$priorityField = $fields | Where-Object { $_.name -eq $priorityFieldName } | Select-Object -First 1
$projectItems = Get-ProjectItems -Owner $ProjectOwner -Number $ProjectNumber

Write-Output "Project #${ProjectNumber}: Priority='$priorityFieldName', TargetDate='$targetDateFieldName'"
Write-Output "Planificación: $($PlanningStartDate.ToString('yyyy-MM-dd'))"

foreach ($item in $items) {
    $title = "[$($item.ID)] $($item.Title)"
    $idPattern = '\[' + [regex]::Escape($item.ID) + '\]'
    $matchingProjectItems = @($projectItems | Where-Object { (Get-ProjectItemTitle -Item $_) -match $idPattern })
    if ($matchingProjectItems.Count -eq 0) {
        Write-Warning "No se encontró el elemento $($item.ID) dentro del Project; se omite."
        continue
    }

    $priorityValue = Resolve-PriorityValue -PriorityField $priorityField -Priority $item.Priority
    $weekNumber = Get-WeekNumber -Week $item.Week
    $targetDate = $PlanningStartDate.AddDays((($weekNumber - 1) * 7) + 6).ToString('yyyy-MM-dd')

    Write-Output "$($item.ID): Priority=$priorityValue TargetDate=$targetDate Items=$($matchingProjectItems.Count)"
    if ($Preview) { continue }

    foreach ($projectItem in $matchingProjectItems) {
        $issueUrl = Get-ProjectItemUrl -Item $projectItem
        if ([string]::IsNullOrWhiteSpace($issueUrl)) {
            Write-Warning "El elemento $($item.ID) no tiene una URL de Issue/PR editable; se omite esa fila."
            continue
        }
        Invoke-GhText @('project', 'item-edit', "$ProjectNumber", '--owner', $ProjectOwner, '--url', $issueUrl, '--field', $priorityFieldName, '--value', $priorityValue) | Out-Null
        Invoke-GhText @('project', 'item-edit', "$ProjectNumber", '--owner', $ProjectOwner, '--url', $issueUrl, '--field', $targetDateFieldName, '--date', $targetDate) | Out-Null
    }
}

Write-Output 'Sincronización completada. No se modificaron Status, Start date, Linked pull requests ni Sub-issues.'
