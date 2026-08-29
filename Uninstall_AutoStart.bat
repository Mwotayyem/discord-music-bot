@echo off
cd /d "%~dp0"
title Uninstall Discord Bot Auto Start

echo ==========================================
echo Removing Discord bot auto start...
echo ==========================================

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Uninstall_AutoStart.ps1"

echo.
echo Done.
pause
