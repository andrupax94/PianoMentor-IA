@echo off
title PianoMentor USB Tunnel
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0launch.ps1"
if errorlevel 1 pause