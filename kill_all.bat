@echo off
echo Killing all processes on common ports and Node.js processes...

REM Kill processes on port 4000 (server)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :4000') do (
    echo Killing process %%a on port 4000
    taskkill /PID %%a /F >nul 2>&1
)

REM Kill processes on port 3000 (client dev server)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000') do (
    echo Killing process %%a on port 3000
    taskkill /PID %%a /F >nul 2>&1
)

REM Kill processes on port 5173 (Vite dev server)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173') do (
    echo Killing process %%a on port 5173
    taskkill /PID %%a /F >nul 2>&1
)

REM Kill all node.exe processes
echo Killing all Node.js processes...
taskkill /IM node.exe /F >nul 2>&1

REM Kill all npm processes
echo Killing all npm processes...
taskkill /IM npm.cmd /F >nul 2>&1

REM Kill MongoDB processes
echo Killing MongoDB processes...
taskkill /IM mongod.exe /F >nul 2>&1

echo All processes killed!
echo.
echo You can now restart your server with: npm start
pause