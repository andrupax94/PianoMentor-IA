[CmdletBinding()]
param(
    [string]$CsvPath = (Join-Path $PSScriptRoot '..\project-backlog.csv'),
    [string]$BackupPath = (Join-Path $PSScriptRoot '..\project-backup.json'),
    [string]$Repository = 'andrupax94/PianoMentor-IA',
    [string]$ProjectOwner = 'andrupax94',
    [string]$ProjectTitle = '@andrupax94 PianoMentor IA',
    [int]$ProjectNumber = 1,
    [datetime]$PlanningStartDate = [datetime]'2026-10-06',
    [switch]$Preview,
    [switch]$RefreshRemote
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

function Get-PropertyValue {
    param($Object, [string[]]$Names)
    if ($null -eq $Object) { return $null }
    foreach ($name in $Names) {
        $property = $Object.PSObject.Properties | Where-Object { $_.Name -ieq $name } | Select-Object -First 1
        if ($null -ne $property) { return $property.Value }
    }
    return $null
}

function Get-ProjectItemTitle {
    param($Item)
    $title = Get-PropertyValue -Object $Item -Names @('title')
    if (-not [string]::IsNullOrWhiteSpace([string]$title)) { return [string]$title }
    $content = Get-PropertyValue -Object $Item -Names @('content')
    $contentTitle = Get-PropertyValue -Object $content -Names @('title')
    if (-not [string]::IsNullOrWhiteSpace([string]$contentTitle)) { return [string]$contentTitle }
    return ''
}

function Get-ProjectItemUrl {
    param($Item)
    $content = Get-PropertyValue -Object $Item -Names @('content')
    $contentUrl = Get-PropertyValue -Object $content -Names @('url')
    if (-not [string]::IsNullOrWhiteSpace([string]$contentUrl)) { return [string]$contentUrl }
    $url = Get-PropertyValue -Object $Item -Names @('url')
    if (-not [string]::IsNullOrWhiteSpace([string]$url) -and [string]$url -match '/issues/|/pull/') { return [string]$url }
    return $null
}

function Get-ItemId {
    param($Item)
    $title = Get-ProjectItemTitle -Item $Item
    if ($title -match '\[(B-\d+)\]') { return $Matches[1] }
    if ($title -match '(?<![A-Za-z0-9])(B-\d+)(?![A-Za-z0-9])') { return $Matches[1] }
    return $null
}

function Get-FieldValueText {
    param($Item, [string[]]$Names)
    $value = Get-PropertyValue -Object $Item -Names $Names
    if ($null -eq $value) { return '' }
    if ($value -is [string]) { return $value }
    $nested = Get-PropertyValue -Object $value -Names @('name', 'date', 'value', 'text')
    if ($null -ne $nested) { return [string]$nested }
    return [string]$value
}

function Get-WeekNumber {
    param([string]$Week)
    if ($Week -notmatch '(\d+)') { throw "Semana no reconocida: '$Week'" }
    return [int]$Matches[1]
}

function Get-PriorityCandidates {
    param([string]$Priority)
    switch ($Priority) {
        'P0' { return @('P0', 'Urgent', 'High') }
        'P1' { return @('P1', 'High', 'Medium') }
        'P2' { return @('P2', 'Medium', 'Low') }
        default { return @($Priority) }
    }
}

function Resolve-PriorityValue {
    param([string]$Priority, $PriorityField)
    $candidates = Get-PriorityCandidates -Priority $Priority
    if ($null -ne $PriorityField) {
        $options = @($PriorityField.options | ForEach-Object { $_.name })
        foreach ($candidate in $candidates) {
            $match = $options | Where-Object { $_ -ieq $candidate } | Select-Object -First 1
            if ($null -ne $match) { return [string]$match }
        }
        throw "No hay una opción compatible para '$Priority'. Opciones disponibles: $($options -join ', ')"
    }
    return [string]$candidates[0]
}

if (-not (Test-Path $CsvPath)) { throw "No existe el CSV: $CsvPath" }
if (-not (Get-Command gh.exe -ErrorAction SilentlyContinue)) { throw 'GitHub CLI (gh) no está disponible en PATH.' }

if (-not (Test-Path $BackupPath) -and -not $RefreshRemote) {
    throw "No existe el respaldo local '$BackupPath'. Ejecuta export-github-project.ps1 después de que se restablezca el límite, o usa -RefreshRemote para consultar GitHub directamente."
}

$items = Import-Csv -LiteralPath $CsvPath
$backupData = $null
$backupItems = @()
$priorityField = $null

if (-not $RefreshRemote) {
    $backupData = Get-Content -LiteralPath $BackupPath -Raw | ConvertFrom-Json
    $backupItems = @($backupData.items)
    $backupFields = @($backupData.fields)
    $priorityField = $backupFields | Where-Object { $_.name -ieq 'Priority' } | Select-Object -First 1
    Write-Output "Modo local-first: $($backupItems.Count) elementos leídos desde $BackupPath"
} else {
    Write-Warning 'Modo RefreshRemote: se consultarán campos y elementos directamente en GitHub y se consumirá cuota GraphQL.'
    $fieldsJson = Invoke-GhText @('project', 'field-list', "$ProjectNumber", '--owner', $ProjectOwner, '--format', 'json')
    $remoteFields = ($fieldsJson | ConvertFrom-Json).fields
    $priorityField = $remoteFields | Where-Object { $_.name -ieq 'Priority' } | Select-Object -First 1
    $itemsJson = Invoke-GhText @('project', 'item-list', "$ProjectNumber", '--owner', $ProjectOwner, '--format', 'json', '--limit', '1000')
    $parsedItems = $itemsJson | ConvertFrom-Json
    if ($null -ne $parsedItems.items) { $backupItems = @($parsedItems.items) } else { $backupItems = @($parsedItems) }
}

Write-Output "Project #${ProjectNumber}: Priority='Priority', TargetDate='Target date'"
Write-Output "Planificación: $($PlanningStartDate.ToString('yyyy-MM-dd'))"

foreach ($item in $items) {
    $weekNumber = Get-WeekNumber -Week $item.Week
    $targetDate = $PlanningStartDate.AddDays((($weekNumber - 1) * 7) + 6).ToString('yyyy-MM-dd')
    $priorityCandidates = Get-PriorityCandidates -Priority $item.Priority
    $priorityValue = Resolve-PriorityValue -Priority $item.Priority -PriorityField $priorityField
    $matchingItems = @($backupItems | Where-Object { (Get-ItemId -Item $_) -eq $item.ID })

    if ($matchingItems.Count -eq 0) {
        Write-Warning "No se encontró el elemento $($item.ID) en el respaldo/localización del Project; se omite."
        continue
    }

    $changedItems = @()
    foreach ($projectItem in $matchingItems) {
        $currentPriority = Get-FieldValueText -Item $projectItem -Names @('priority', 'Priority')
        $currentTargetDate = Get-FieldValueText -Item $projectItem -Names @('targetDate', 'Target date', 'TargetDate')
        $priorityNeedsUpdate = [string]::IsNullOrWhiteSpace($currentPriority) -or (($priorityCandidates -notcontains $currentPriority) -and (($priorityCandidates | Where-Object { $_ -ieq $currentPriority }).Count -eq 0))
        $dateNeedsUpdate = [string]::IsNullOrWhiteSpace($currentTargetDate) -or ($currentTargetDate.Substring(0, [Math]::Min(10, $currentTargetDate.Length)) -ne $targetDate)
        if ($priorityNeedsUpdate -or $dateNeedsUpdate) {
            $changedItems += [pscustomobject]@{ Item = $projectItem; Priority = $priorityNeedsUpdate; TargetDate = $dateNeedsUpdate }
        }
    }

    if ($changedItems.Count -eq 0) {
        Write-Output "$($item.ID): sin cambios; no se solicita GitHub"
        continue
    }

    Write-Output "$($item.ID): Priority=$priorityValue TargetDate=$targetDate Cambios=$($changedItems.Count)"
    if ($Preview) { continue }

    foreach ($change in $changedItems) {
        $issueUrl = Get-ProjectItemUrl -Item $change.Item
        if ([string]::IsNullOrWhiteSpace($issueUrl)) {
            Write-Warning "El elemento $($item.ID) no tiene URL editable; se omite."
            continue
        }
        if ($change.Priority) {
            Invoke-GhText @('project', 'item-edit', "$ProjectNumber", '--owner', $ProjectOwner, '--url', $issueUrl, '--field', 'Priority', '--value', $priorityValue) | Out-Null
        }
        if ($change.TargetDate) {
            Invoke-GhText @('project', 'item-edit', "$ProjectNumber", '--owner', $ProjectOwner, '--url', $issueUrl, '--field', 'Target date', '--date', $targetDate) | Out-Null
        }
    }
}

Write-Output 'Sincronización completada. Solo se modificaron campos vacíos o diferentes en el respaldo local.'
Write-Output 'No se modificaron Status, Start date, Linked pull requests ni Sub-issues.'
