@echo off
setlocal
cd /d "%~dp0"
if exist "%~dp0runtime\node.exe" (
  "%~dp0runtime\node.exe" "%~dp0scripts\bootstrap.mjs" --interactive %*
) else (
  where node >nul 2>nul
  if errorlevel 1 (
    echo QUANTSMART source needs Node.js LTS 22.12 or newer.
    echo Download: https://nodejs.org/en/download
    echo Or download the Windows portable ZIP, which includes Node.js.
    pause
    exit /b 1
  )
  node "%~dp0scripts\bootstrap.mjs" --interactive %*
)
if errorlevel 1 pause
