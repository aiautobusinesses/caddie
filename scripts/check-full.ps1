# Full pre-deploy checks (typecheck + lint + production build).
# Run from repo root: .\scripts\check-full.ps1
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

& (Join-Path $PSScriptRoot "check.ps1")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Build..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "All checks passed." -ForegroundColor Green
