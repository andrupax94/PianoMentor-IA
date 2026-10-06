[CmdletBinding()]
param(
    [string]$OutputPath = (Join-Path $PSScriptRoot '..\project-backup.json'),
    [string]$ProjectOwner = 'andrupax94',
    [string]$ProjectTitle = '@andrupax94 PianoMentor IA',
    [int]$ProjectNumber = 1
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

if (-not (Get-Command gh.exe -ErrorAction SilentlyContinue)) { throw 'GitHub CLI (gh) no está disponible en PATH.' }
if ($ProjectNumber -le 0) { $ProjectNumber = Resolve-ProjectNumber -Owner $ProjectOwner -Title $ProjectTitle }

$outputParent = Split-Path -Parent $OutputPath
if (-not [string]::IsNullOrWhiteSpace($outputParent)) { New-Item -ItemType Directory -Force -Path $outputParent | Out-Null }

$fieldsJson = Invoke-GhText @('project', 'field-list', "$ProjectNumber", '--owner', $ProjectOwner, '--format', 'json')
$itemsJson = Invoke-GhText @('project', 'item-list', "$ProjectNumber", '--owner', $ProjectOwner, '--format', 'json', '--limit', '1000')
$fields = $fieldsJson | ConvertFrom-Json
$parsedItems = $itemsJson | ConvertFrom-Json
if ($null -ne $parsedItems.items) { $items = @($parsedItems.items) } else { $items = @($parsedItems) }

$backup = [ordered]@{
    schemaVersion = 1
    exportedAtUtc = [DateTime]::UtcNow.ToString('o')
    project = [ordered]@{
        owner = $ProjectOwner
        title = $ProjectTitle
        number = $ProjectNumber
    }
    fields = $fields.fields
    items = @($items)
    notes = @(
        'Respaldo local generado desde GitHub Projects.',
        'Linked pull requests y Sub-issues se conservan como vienen de GitHub.',
        'Start date no se modifica desde los scripts del repositorio.'
    )
}

$json = $backup | ConvertTo-Json -Depth 20
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($OutputPath, $json, $utf8NoBom)
Write-Output "Respaldo generado: $OutputPath"
Write-Output "Items exportados: $($items.Count)"
