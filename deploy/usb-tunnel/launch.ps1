#Requires -Version 5.1
<#
  launch.ps1 - Start an SSH tunnel to the home server and open RDP.
  Called by launch.bat. The USB drive letter is detected automatically.

  Key resolution:
    1. If ssh\id_ed25519.enc exists, decrypt it with the USB volume serial
       number (AES-256-CBC) into a temp file, use that, then delete it.
    2. Otherwise fall back to ssh\id_ed25519 (plaintext).
#>

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms | Out-Null

$usbRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$sshDir = Join-Path $usbRoot 'ssh'
$plainKey = Join-Path $sshDir 'id_ed25519'
$encKey = Join-Path $sshDir 'id_ed25519.enc'
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

$tempKey = $null

if (Test-Path $encKey) {
    # --- Decrypt the key using the USB volume serial ----------------------

    $driveLetter = (Split-Path -Qualifier $usbRoot).TrimEnd(':')
    $volume = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$driveLetter`:'"

    if (-not $volume -or -not $volume.VolumeSerialNumber) {
        Show-Error "Could not read the volume serial number of drive $driveLetter`:. Is this the original USB?"
        exit 1
    }

    $salt = [System.Text.Encoding]::UTF8.GetBytes('PianoMentor-USB-v1')
    $keyMaterial = [System.Text.Encoding]::UTF8.GetBytes($volume.VolumeSerialNumber)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $aesKey = $sha.ComputeHash($keyMaterial + $salt)
    $sha.Dispose()

    $encrypted = [System.IO.File]::ReadAllBytes($encKey)
    if ($encrypted.Length -lt 16) {
        Show-Error 'Encrypted key file is too small or corrupt.'
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
    $decrypted = New-Object System.IO.MemoryStream
    try {
        $cs.CopyTo($decrypted)
    } catch {
        $aes.Dispose(); $cs.Dispose(); $ms.Dispose(); $decrypted.Dispose()
        Show-Error "Decryption failed. Is this the original USB?`n`n$($_.Exception.Message)"
        exit 1
    }
    $cs.Close()
    $plainBytes = $decrypted.ToArray()
    $aes.Dispose(); $ms.Dispose(); $decrypted.Dispose()

    # Validate it looks like a private key
    $text = [System.Text.Encoding]::UTF8.GetString($plainBytes)
    if ($text -notmatch 'PRIVATE KEY') {
        Show-Error 'Decrypted data does not look like a private key. Wrong USB?'
        exit 1
    }

    # Write to a temp file with restrictive permissions
    $tempKey = Join-Path $env:TEMP "pm_usb_$([System.Guid]::NewGuid().ToString('N')).tmp"
    [System.IO.File]::WriteAllBytes($tempKey, $plainBytes)
    try {
        icacls $tempKey /inheritance:r 2>$null | Out-Null
        icacls $tempKey /grant:r "$($env:USERNAME):R" 2>$null | Out-Null
    } catch { }
    $keyPath = $tempKey

} elseif (Test-Path $plainKey) {
    $keyPath = $plainKey
} else {
    Show-Error "No key found in ssh\ folder.`n`nExpected: id_ed25519.enc (encrypted) or id_ed25519 (plaintext).`n`nRun protect-key.ps1 first to encrypt your key."
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
    if ($tempKey) { Remove-Item $tempKey -Force -ErrorAction SilentlyContinue }
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
if ($tempKey) { Remove-Item $tempKey -Force -ErrorAction SilentlyContinue }
Write-Host 'Tunnel closed.'