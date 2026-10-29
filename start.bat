@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20.19 or newer is required. Install Node.js LTS, then run this file again.
  pause
  exit /b 1
)
call npm run mfe -- %*
if errorlevel 1 pause
