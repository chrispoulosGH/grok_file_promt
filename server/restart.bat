@echo off
echo Killing Node processes...
taskkill /IM node.exe /F 2>nul
timeout /t 1 /nobreak
echo Starting server on port 4000...
cd /d "%~dp0"
node index.js
pause
