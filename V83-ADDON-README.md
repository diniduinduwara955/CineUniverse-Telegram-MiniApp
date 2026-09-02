# Cine Universe V83 – Reliability Add-on

This version preserves the existing V82 source files and adds an independent reliability layer.

## Start
- Windows CMD: `start-v83.bat`
- PowerShell: `./start-v83.ps1`
- Direct: `node server/v83-runner.mjs`

## What it adds
- Telegram send deduplication for short duplicate bursts.
- Automatic retry for transient Telegram API/network failures.
- A canonical, de-duplicated catalog snapshot at `server/v83-canonical-catalog.json`.
- Periodic catalog sync state at `server/v83-reliability-state.json`.

The original `server/server.js`, `src/main.jsx`, and existing catalog files are not rewritten by the V83 add-on.
