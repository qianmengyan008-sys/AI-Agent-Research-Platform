@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File "%~dp0Start-Researcher-Preview.ps1" -Action Start
set "PREVIEW_RESULT=%errorlevel%"
pause
exit /b %PREVIEW_RESULT%
