@echo off
cd /d "%~dp0"
title Install Discord Bot Auto Start

echo ==========================================
echo Installing auto start for Discord bot...
echo ==========================================

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install_AutoStart.ps1"

if errorlevel 1 (
    echo.
    echo Failed to install auto start.
    echo Try running this file as Administrator.
    pause
    exit /b 1
)

echo.
echo Done. The bot will start automatically when you log in to Windows.
echo To remove this later, run Uninstall_AutoStart.bat
pause
