$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not (Test-Path 'node_modules')) { npm install }
Write-Host 'Starting Cine Universe with V83 reliability layer...'
node server/v83-runner.mjs
