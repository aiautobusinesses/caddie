# Fast pre-push checks (typecheck + lint). Run from repo root: .\scripts\check.ps1
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "Typecheck..." -ForegroundColor Cyan
npm run typecheck
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Lint..." -ForegroundColor Cyan
npm run lint
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Checks passed." -ForegroundColor Green
