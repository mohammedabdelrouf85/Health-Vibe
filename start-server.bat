@echo off
title Health Vibes AI Web Server
cd /d "%~dp0"

echo ===================================================
echo           Health Vibes AI - Local Server
echo ===================================================
echo.
echo Starting local web server on port 3000...
echo Opening http://localhost:3000 in your browser...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo PowerShell script exited with code %ERRORLEVEL%.
    pause
)
