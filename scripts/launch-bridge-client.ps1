$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$clientRoot = Join-Path $projectRoot "desktop-client"
$bootstrapScript = Join-Path $projectRoot "scripts\bootstrap-client-runtime.ps1"

if (-not (Test-Path $clientRoot)) {
    throw "desktop-client directory not found."
}

if (Test-Path $bootstrapScript) {
    powershell -ExecutionPolicy Bypass -File $bootstrapScript
}

Set-Location $clientRoot
npm run dev
