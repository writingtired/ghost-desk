@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-board.ps1"
if errorlevel 1 echo Setup did not finish.
pause
