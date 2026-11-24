#Requires -Version 5.1
<#
  tunnel-only.ps1 - Start the SSH tunnel and keep it open.
  Does NOT launch RDP. Use this to test manually with mstsc or other clients.
  Press Enter or Ctrl+C to close the tunnel.
#>

$ErrorActionPreference = 'Stop'

$usbRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$sshDir = Join-Path $usbRoot 'ssh'
$plainKey = Join-Path $sshDir 'id_ed25519'
$encKey = Join-Path $sshDir 'id_ed25519.enc'
$hostName = 'pianomentoria.com'
$user = 'chimuelo'
$remoteRdp = '192.168.1.134:3389'
$localPort = 3390

$tempKey = $null

# --- Decrypt or use plaintext key -----------------------------------------

if (Test-Path $encKey) {
    $driveLetter = (Split-Path -Qualifier $usbRoot).TrimEnd(':')
    $volume = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$driveLetter`:'"
    if (-not $volume -or -not $volume.VolumeSerialNumber) {
        Write-Host "ERROR: Could not read USB volume serial." -ForegroundColor Red
        exit 1
    }
    $salt = [System.Text.Encoding]::UTF8.GetBytes('PianoMentor-USB-v1')
    $keyMaterial = [System.Text.Encoding]::UTF8.GetBytes($volume.VolumeSerialNumber)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $aesKey = $sha.ComputeHash($keyMaterial + $salt)
    $sha.Dispose()

    $encrypted = [System.IO.File]::ReadAllBytes($encKey)
    if ($encrypted.Length -lt 16) {
        Write-Host "ERROR: Encrypted key too small." -ForegroundColor Red
        exit 1
    }

    $aes = [System.Security.Cryptography.Aes]::Create()
    $aes.Key = $aesKey
    $aes.Mode = [System.Security.Cryptography.CipherMode]::CBC
    $aes.Padding = [System.Security.Cryptography.PaddingMode]::PKCS7
    $aes.IV = $encrypted[0..15]
    $decryptor = $aes.CreateDecryptor()
    $ms = [System.IO.MemoryStream]::new($encrypted, 16, ($encrypted.Length - 16))
    $cs = [System.Security.Cryptography.CryptoStream]::new($ms, $decryptor, [System.Security.Cryptography.CryptoStreamMode]::Read)
    $dec = New-Object System.IO.MemoryStream
    try {
        $cs.CopyTo($dec)
    } catch {
        Write-Host "ERROR: Decryption failed. Wrong USB?" -ForegroundColor Red
        Write-Host $_.Exception.Message
        exit 1
    } finally {
        $cs.Close(); $aes.Dispose(); $ms.Dispose(); $dec.Dispose()
    }
    $plainBytes = $dec.ToArray()
    $text = [System.Text.Encoding]::UTF8.GetString($plainBytes)
    if ($text -notmatch 'PRIVATE KEY') {
        Write-Host "ERROR: Decrypted data is not a private key." -ForegroundColor Red
        exit 1
    }

    $tempKey = Join-Path $env:TEMP "pm_usb_$([System.Guid]::NewGuid().ToString('N')).tmp"
    [System.IO.File]::WriteAllBytes($tempKey, $plainBytes)
    try {
        icacls $tempKey /inheritance:r 2>$null | Out-Null
        icacls $tempKey /grant:r "$($env:USERNAME):R" 2>$null | Out-Null
    } catch { }
    $keyPath = $tempKey
    Write-Host "Key decrypted from USB serial." -ForegroundColor Green

} elseif (Test-Path $plainKey) {
    $keyPath = $plainKey
    Write-Host "Using plaintext key." -ForegroundColor Yellow
} else {
    Write-Host "ERROR: No key found in ssh\ folder." -ForegroundColor Red
    exit 1
}

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

Write-Host "Starting SSH tunnel: 127.0.0.1:$localPort -> $remoteRdp via $hostName" -ForegroundColor Cyan
$sshProc = Start-Process -FilePath 'ssh' -ArgumentList $sshArgs -WindowStyle Hidden -PassThru

# Wait until the local port is listening (max 30 s)
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    $test = Test-NetConnection -ComputerName '127.0.0.1' -Port $localPort -WarningAction SilentlyContinue
    if ($test.TcpTestSucceeded) { $ready = $true; break }
    Write-Host "  waiting... ($($i+1)/30)" -ForegroundColor DarkGray
}

if (-not $ready) {
    $sshProc | Stop-Process -Force -ErrorAction SilentlyContinue
    if ($tempKey) { Remove-Item $tempKey -Force -ErrorAction SilentlyContinue }
    Write-Host "ERROR: Tunnel did not start. Check the key, network, or passphrase." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Tunnel is UP. Port 3390 is listening on 127.0.0.1." -ForegroundColor Green
Write-Host ""
Write-Host "Now open Remote Desktop manually:" -ForegroundColor Yellow
Write-Host "  mstsc /v:127.0.0.1:3390" -ForegroundColor White
Write-Host ""
Write-Host "Or use the .rdp file: double-click pianomentor.rdp" -ForegroundColor White
Write-Host ""
Write-Host "Press Enter to close the tunnel..." -ForegroundColor DarkGray

# Keep running until Enter or Ctrl+C
try {
    Read-Host | Out-Null
} finally {
    Write-Host "Closing tunnel..." -ForegroundColor DarkGray
    $sshProc | Stop-Process -Force -ErrorAction SilentlyContinue
    if ($tempKey) { Remove-Item $tempKey -Force -ErrorAction SilentlyContinue }
    Write-Host "Done." -ForegroundColor Green
}