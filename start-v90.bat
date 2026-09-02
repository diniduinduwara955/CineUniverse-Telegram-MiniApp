@echo off
setlocal
cd /d "%~dp0"
start "Cine Universe V90 API" cmd /k "node server/v90-server.mjs"
start "Cine Universe V90 UI" cmd /k "npx vite"
