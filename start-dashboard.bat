@echo off
rem Start the local trading dashboard and open it in the browser.
rem Server binds to localhost only (not visible to other devices).
powershell -NoProfile -Command "if (-not (Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue)) { Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','\"%~dp0serve.ps1\"' ; Start-Sleep -Seconds 1 }"
start "" http://localhost:4173
