PianoMentor USB - Tunnel + Remote Desktop (encrypted key)
========================================================

Contents
--------
  launch.bat          Double-click this to start the tunnel and open RDP.
  launch.ps1          PowerShell logic (called by launch.bat).
  protect-key.ps1     Run ONCE on your main PC to encrypt the private key.
  ssh\id_ed25519      YOUR private SSH key (optional after encryption).
  ssh\id_ed25519.enc  Encrypted key (created by protect-key.ps1).
  autorun.inf         Hint for Windows (does not auto-run on modern Windows).

First-time setup
----------------
1. Copy your private key file to:   ssh\id_ed25519
   (On your main PC it lives at C:\Users\Andres\.ssh\id_ed25519)

2. Run protect-key.ps1 (right-click > Run with PowerShell, or from a
   PowerShell prompt):
       .\protect-key.ps1
   It reads the USB volume serial number, derives an AES-256 key from it,
   encrypts id_ed25519 into id_ed25519.enc, and asks whether to delete
   the plaintext key. Answer 'y' to delete it.

   The encrypted key can ONLY be decrypted when this exact USB is plugged
   in: the volume serial number is the secret. Copying id_ed25519.enc to
   another drive or PC is useless.

3. (Optional) Fix file permissions so Windows OpenSSH does not complain:
       icacls ssh\id_ed25519.enc /inheritance:r
       icacls ssh\id_ed25519.enc /grant:r "%USERNAME%:R"

   If the key had a passphrase, remove it first so the tunnel starts
   without typing anything:
       ssh-keygen -p -f ssh\id_ed25519
   (enter the old passphrase, leave the new one empty)

Usage
-----
  Double-click launch.bat.
  - It decrypts the key in memory (using the USB volume serial).
  - It starts the SSH tunnel in the background.
  - It waits until port 3390 is listening locally.
  - It opens Remote Desktop to 127.0.0.1:3390.
  - When you close Remote Desktop, the tunnel is closed and the temp key
    file is deleted.

  If both id_ed25519.enc and id_ed25519 exist, the encrypted one is used.

Requirements on the client PC
----------------------------
  - Windows 10/11 with the OpenSSH client installed (Settings > Apps >
    Optional features > OpenSSH Client). Installed by default on recent
    Windows 10/11.
  - Port 3390 free locally (used instead of 3389 to avoid conflicts with
    the Windows RDP service if it is running on the client PC).

Security notes
--------------
  - The encrypted key on this USB can only be used with this USB. If
    someone copies id_ed25519.enc to another drive, decryption fails
    because the volume serial number differs.
  - Keep the USB safe. Anyone with the USB can decrypt the key.
  - autorun.inf is included but modern Windows disables USB autorun by
    default. Double-click launch.bat to start.
  - Do not commit id_ed25519 or id_ed25519.enc to git (both gitignored).