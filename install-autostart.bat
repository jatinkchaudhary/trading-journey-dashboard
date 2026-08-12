@echo off
rem OPTIONAL: run once to make the dashboard server start automatically at login.
copy /Y "%~dp0start-dashboard-silent.bat" "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\trading-dashboard-server.bat"
echo Installed. The dashboard server will start automatically when you log in.
pause
