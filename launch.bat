@echo off
title YT Channel Analyzer
echo.
echo  ==========================================
echo   YT Channel Analyzer - Web UI
echo  ==========================================
echo.

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed or not in PATH.
    echo         Download it from https://python.org
    pause
    exit /b 1
)

REM Install dependencies silently
echo [*] Checking dependencies...
pip install flask yt-dlp --quiet --disable-pip-version-check

echo [*] Starting server...
echo [*] Opening http://127.0.0.1:5000
echo.
echo  Press Ctrl+C in this window to stop the server.
echo.

REM Open browser after a short delay (runs in background)
start "" /b cmd /c "timeout /t 2 >nul && start http://127.0.0.1:5000"

REM Start Flask
python app.py

pause
