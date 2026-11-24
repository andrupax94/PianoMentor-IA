@echo off
title PianoMentor USB - Tunnel Only
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0tunnel-only.ps1"
if errorlevel 1 pause