#Requires -Version 5.1
<#
  protect-key.ps1 - Encrypt the private SSH key with the USB volume serial.
  Run ONCE on your main PC, with the USB plugged in.

  Result: ssh\id_ed25519.enc  (encrypted, safe to carry on the USB)
  The plaintext ssh\id_ed25519 can then be deleted.
#>

$ErrorActionPreference = 'Stop'

$usbRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$keyPath = Join-Path $usbRoot 'ssh\id_ed25519'
$encPath = Join-Path $usbRoot 'ssh\id_ed25519.enc'

if (-not (Test-Path $keyPath)) {
    Write-Host "ERROR: Private key not found at $keyPath" -ForegroundColor Red
    Write-Host "Copy id_ed25519 into the ssh\ folder first."
    exit 1
}

# --- Read USB volume serial number ---------------------------------------

$driveLetter = (Split-Path -Qualifier $usbRoot).TrimEnd(':')
$volume = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$driveLetter`:'"

if (-not $volume -or -not $volume.VolumeSerialNumber) {
    Write-Host "ERROR: Could not read the volume serial number of drive $driveLetter`:" -ForegroundColor Red
    exit 1
}

$serial = $volume.VolumeSerialNumber
Write-Host "USB volume serial: $serial"
Write-Host "USB label:         $($volume.VolumeName)"

# --- Derive AES-256 key from serial + salt -------------------------------

$salt = [System.Text.Encoding]::UTF8.GetBytes('PianoMentor-USB-v1')
$keyMaterial = [System.Text.Encoding]::UTF8.GetBytes($serial)
$sha = [System.Security.Cryptography.SHA256]::Create()
$key = $sha.ComputeHash($keyMaterial + $salt)   # 32 bytes = AES-256
$sha.Dispose()

# --- Encrypt with AES-256-CBC --------------------------------------------

$plainBytes = [System.IO.File]::ReadAllBytes($keyPath)

$aes = [System.Security.Cryptography.Aes]::Create()
$aes.Key = $key
$aes.Mode = [System.Security.Cryptography.CipherMode]::CBC
$aes.Padding = [System.Security.Cryptography.PaddingMode]::PKCS7
$aes.GenerateIV()
$iv = $aes.IV

$encryptor = $aes.CreateEncryptor()
$ms = New-Object System.IO.MemoryStream
$ms.Write($iv, 0, $iv.Length)
$cs = [System.Security.Cryptography.CryptoStream]::new($ms, $encryptor, [System.Security.Cryptography.CryptoStreamMode]::Write)
$cs.Write($plainBytes, 0, $plainBytes.Length)
$cs.FlushFinalBlock()
$cs.Close()
$encrypted = $ms.ToArray()
$ms.Close()
$aes.Dispose()

[System.IO.File]::WriteAllBytes($encPath, $encrypted)
Write-Host ""
Write-Host "Encrypted key saved to: $encPath" -ForegroundColor Green
Write-Host "Size: $($encrypted.Length) bytes (16 bytes IV + ciphertext)"

# --- Remove plaintext (optional) -----------------------------------------

Write-Host ""
$remove = Read-Host "Delete the plaintext key (ssh\id_ed25519)? [y/N]"
if ($remove -eq 'y' -or $remove -eq 'Y') {
    Remove-Item $keyPath -Force
    Write-Host "Plaintext key removed. Only the encrypted version remains." -ForegroundColor Green
} else {
    Write-Host "Plaintext key kept. Delete it manually when ready."
    Write-Host "WARNING: as long as id_ed25519 exists, launch.ps1 uses it directly (no decryption)."
}
Write-Host ""
Write-Host "Done. The encrypted key can only be decrypted on a PC where this USB"
Write-Host "is plugged in (the volume serial must match)."