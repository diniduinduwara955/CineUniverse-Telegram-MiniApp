@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules" (
  echo [V94] node_modules not found. Run: npm install
  exit /b 1
)
echo [V94] Starting Cine Universe with Telegram message spacing layer...
npx concurrently "vite" "node --import ./server/v94-telegram-message-spacing.mjs server/server.js"
