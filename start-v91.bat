@echo off
setlocal
cd /d %~dp0
start "Cine Universe API V91" cmd /k "node server/v91-server.mjs"
start "Cine Universe Web" cmd /k "npx vite"
