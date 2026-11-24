PianoMentor USB - Tunnel + Remote Desktop
=========================================

Contents
--------
  launch.bat          Double-click this to start the tunnel and open RDP.
  launch.ps1          PowerShell logic (called by launch.bat).
  ssh\id_ed25519      YOUR private SSH key (copy it here, see below).
  autorun.inf         Hint for Windows (does not auto-run on modern Windows).

First-time setup
----------------
1. Copy your private key file to:   ssh\id_ed25519
   (On your main PC it lives at C:\Users\Andres\.ssh\id_ed25519)
   Do NOT commit this file to git or share it.

2. If the key has a passphrase, remove it so the tunnel starts without
   typing anything:
       ssh-keygen -p -f ssh\id_ed25519
   (enter the old passphrase, leave the new one empty)
   Alternatively keep the passphrase and type it when prompted.

3. (Optional) Fix file permissions so Windows OpenSSH does not complain:
       icacls ssh\id_ed25519 /inheritance:r
       icacls ssh\id_ed25519 /grant:r "%USERNAME%:R"

Usage
-----
  Double-click launch.bat.
  - It starts the SSH tunnel in the background.
  - It waits until port 3389 is listening locally.
  - It opens Remote Desktop to 127.0.0.1:3389.
  - When you close Remote Desktop, the tunnel is closed automatically.

Requirements on the client PC
----------------------------
  - Windows 10/11 with the OpenSSH client installed (Settings > Apps >
    Optional features > OpenSSH Client). It is installed by default on
    recent Windows 10/11.
  - No other program using local port 3389.

Security notes
--------------
  - The private key on this USB gives access to your server. Keep the USB
    safe and never leave it plugged in unattended.
  - autorun.inf is included for convenience but modern Windows disables
    USB autorun by default. You must double-click launch.bat manually.
  - Delete the key from the USB when you no longer need it.
