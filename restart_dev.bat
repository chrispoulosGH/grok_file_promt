@echo off
echo ========================================
echo Killing all processes and restarting dev environment...
echo ========================================

REM Kill all existing processes
call kill_all.bat

REM Wait a moment for processes to fully terminate
timeout /t 2 /nobreak >nul

echo.
echo ========================================
echo Starting development environment...
echo ========================================

REM Start both server and client
npm run dev

echo.
echo Development environment started!
echo Client: http://localhost:5173
echo Server: http://localhost:4000
pause