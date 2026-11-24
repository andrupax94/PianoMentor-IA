#Requires -Version 5.1
<#
  launch.ps1 - Start an SSH tunnel to the home server and open RDP.
  Called by launch.bat. The USB drive letter is detected automatically.
#>

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms | Out-Null

$usbRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$keyPath = Join-Path $usbRoot 'ssh\id_ed25519'
$hostName = 'pianomentoria.com'
$user = 'chimuelo'
$remoteRdp = '192.168.1.134:3389'
$localPort = 3389

function Show-Error($msg) {
    [System.Windows.Forms.MessageBox]::Show($msg, 'PianoMentor USB', 'OK', 'Error') | Out-Null
}

# --- Checks ---------------------------------------------------------------

if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
    Show-Error 'OpenSSH client not found. Install it from Windows Settings > Apps > Optional features > OpenSSH Client.'
    exit 1
}

if (-not (Test-Path $keyPath)) {
    Show-Error "Private key not found:`n$keyPath`n`nCopy id_ed25519 into the ssh\ folder."
    exit 1
}

# --- Fix key permissions (best effort) -----------------------------------

try {
    icacls $keyPath /inheritance:r 2>$null | Out-Null
    icacls $keyPath /grant:r "$($env:USERNAME):R" 2>$null | Out-Null
} catch { }

# --- Start the tunnel -----------------------------------------------------

$sshArgs = @(
    '-N'
    '-L', "$localPort`:$remoteRdp"
    '-i', $keyPath
    '-o', 'StrictHostKeyChecking=accept-new'
    '-o', 'ServerAliveInterval=30'
    '-o', 'ServerAliveCountMax=3'
    "$user@$hostName"
)

$sshProc = Start-Process -FilePath 'ssh' -ArgumentList $sshArgs -WindowStyle Hidden -PassThru

# Wait until the local port is listening (max 30 s)
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    $test = Test-NetConnection -ComputerName '127.0.0.1' -Port $localPort -WarningAction SilentlyContinue
    if ($test.TcpTestSucceeded) { $ready = $true; break }
}

if (-not $ready) {
    $sshProc | Stop-Process -Force -ErrorAction SilentlyContinue
    Show-Error 'The SSH tunnel did not start. Check the key, the network, or the passphrase.'
    exit 1
}

# --- Launch Remote Desktop -----------------------------------------------

$mstsc = Start-Process -FilePath 'mstsc.exe' -ArgumentList "/v:127.0.0.1:$localPort" -PassThru

# Wait for RDP to appear, then for it to close, then tear down the tunnel
Start-Sleep -Seconds 2
while (Get-Process -Name 'mstsc' -ErrorAction SilentlyContinue) {
    Start-Sleep -Seconds 2
}

$sshProc | Stop-Process -Force -ErrorAction SilentlyContinue
Write-Host 'Tunnel closed.'