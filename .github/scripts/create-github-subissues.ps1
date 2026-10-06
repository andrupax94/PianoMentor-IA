[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^B-\d+$')]
    [string]$ParentId,
    [string]$IssuesPath = (Join-Path $PSScriptRoot '..\..\issues'),
    [string]$Repository = 'andrupax94/PianoMentor-IA',
    [string]$ProjectOwner = 'andrupax94',
    [int]$ProjectNumber = 1,
    [switch]$Preview,
    [switch]$SkipProject
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

function Get-ExistingIssues {
    param([string]$Repo)
    $json = Invoke-GhText @('issue', 'list', '--repo', $Repo, '--state', 'all', '--limit', '1000', '--json', 'number,title,url')
    return @($json | ConvertFrom-Json)
}

function Get-IssueIdFromTitle {
    param([string]$Title)
    if ($Title -match '^\[(B-\d+(?:\.\d+)*)\]') { return $Matches[1] }
    return $null
}

function Get-DocumentTitle {
    param([string]$Path)
    $firstHeading = Get-Content -LiteralPath $Path -Encoding UTF8 | Where-Object { $_ -match '^#\s+' } | Select-Object -First 1
    if ($null -eq $firstHeading -or $firstHeading -notmatch '^#\s+\[(B-\d+(?:\.\d+)*)\]\s+(.+)$') {
        throw "El documento '$Path' debe comenzar con '# [$ParentId.N] Título'."
    }
    return "[$($Matches[1])] $($Matches[2].Trim())"
}

if (-not (Test-Path $IssuesPath)) { throw "No existe la carpeta de Issues: $IssuesPath" }

$parentDocsPath = Join-Path $IssuesPath $ParentId
if (-not (Test-Path $parentDocsPath)) { throw "No existe la carpeta de documentos para $ParentId`: $parentDocsPath" }

$childPattern = '^' + [regex]::Escape($ParentId) + '\.\d+\.md$'
$documents = @(Get-ChildItem -LiteralPath $parentDocsPath -File -Filter "$ParentId.*.md" | Where-Object { $_.Name -match $childPattern } | Sort-Object { [int]([regex]::Match($_.BaseName, '\.(\d+)$').Groups[1].Value) })
if ($documents.Count -eq 0) { throw "No se encontraron documentos de Sub-issues para $ParentId en $IssuesPath." }

if ($Preview) {
    Write-Output "Preview offline de Sub-issues para [$ParentId]"
    Write-Output "Documentos encontrados: $($documents.Count)"
    foreach ($document in $documents) {
        $childId = [regex]::Match($document.BaseName, '^(B-\d+\.\d+)$').Groups[1].Value
        $childTitle = Get-DocumentTitle -Path $document.FullName
        Write-Output "$childId`: $childTitle | documento=$($document.Name)"
    }
    exit 0
}

if (-not (Get-Command gh.exe -ErrorAction SilentlyContinue)) { throw 'GitHub CLI (gh) no está disponible en PATH.' }

$parentIssue = $null
$existingIssues = Get-ExistingIssues -Repo $Repository
$parentIssue = $existingIssues | Where-Object { (Get-IssueIdFromTitle -Title $_.title) -eq $ParentId } | Select-Object -First 1
if ($null -eq $parentIssue) { throw "No se encontró la Issue principal [$ParentId] en $Repository." }

Write-Output "Issue principal: [$ParentId] #$($parentIssue.number)"
Write-Output "Documentos encontrados: $($documents.Count)"

foreach ($document in $documents) {
    $childId = [regex]::Match($document.BaseName, '^(B-\d+\.\d+)$').Groups[1].Value
    $childTitle = Get-DocumentTitle -Path $document.FullName
    $existing = $existingIssues | Where-Object { (Get-IssueIdFromTitle -Title $_.title) -eq $childId } | Select-Object -First 1

    if ($null -ne $existing) {
        Write-Output "$childId`: Issue existente #$($existing.number); no se crea duplicado."
        if (-not $Preview) {
            $editOutput = & gh issue edit "$($existing.number)" --repo $Repository --body-file $document.FullName 2>&1
            if ($LASTEXITCODE -ne 0) { throw "No se pudo actualizar el cuerpo de $childId.`n$($editOutput | Out-String)" }
            $linkOutput = & gh issue edit "$($parentIssue.number)" --repo $Repository --add-sub-issue "$($existing.number)" 2>&1
            if ($LASTEXITCODE -ne 0 -and (($linkOutput | Out-String) -notmatch 'already|exist')) { throw "No se pudo vincular $childId al padre $ParentId.`n$($linkOutput | Out-String)" }
        }
        continue
    }

    Write-Output "$childId`: $childTitle"
    if ($Preview) { continue }

    $createOutput = & gh issue create --repo $Repository --title $childTitle --body-file $document.FullName --parent "$($parentIssue.number)" 2>&1
    if ($LASTEXITCODE -ne 0) { throw "No se pudo crear la Sub-issue $childId.`n$($createOutput | Out-String)" }
    $createdUrl = ($createOutput | Select-Object -Last 1).ToString().Trim()
    Write-Output "$childId`: creada $createdUrl"

    if (-not $SkipProject -and $ProjectNumber -gt 0 -and $createdUrl -match '^https://') {
        $projectOutput = & gh project item-add "$ProjectNumber" --owner $ProjectOwner --url $createdUrl 2>&1
        if ($LASTEXITCODE -ne 0) {
            $message = $projectOutput | Out-String
            if ($message -notmatch 'Content already exists|already exists') { throw "No se pudo añadir $childId al Project.`n$message" }
            Write-Output "$childId`: ya estaba en el Project"
        }
    }
}

Write-Output "Sub-issues de $ParentId procesadas."
