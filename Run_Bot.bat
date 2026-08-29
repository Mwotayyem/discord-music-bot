@echo off
cd /d "%~dp0"
title Discord Music Bot - Moh Tayyem
echo ==========================================
echo Starting Discord Music Bot... (by Moh Tayyem)
echo ==========================================

if not exist package.json (
    echo package.json was not found.
    echo Make sure this file is inside the bot folder.
    pause
    exit /b 1
)

if not exist node_modules (
    echo Installing dependencies...
    call npm install
)

if not exist yt-dlp.exe (
    echo Downloading yt-dlp...
    call npm run setup
)

:restart
node index.js
echo.
echo Bot stopped or crashed. Restarting in 10 seconds...
timeout /t 10 /nobreak >nul
goto restart

pause
