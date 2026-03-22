# Restart server script
Write-Host "Killing Node processes..." -ForegroundColor Yellow
taskkill /IM node.exe /F 2>$null
Start-Sleep -Milliseconds 500

Write-Host "Starting server on port 4000..." -ForegroundColor Green
cd $PSScriptRoot
node index.js
