@echo off
rem Starts the dashboard server without opening a browser (used at login).
powershell -NoProfile -Command "if (-not (Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue)) { Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','\"%~dp0serve.ps1\"' }"
