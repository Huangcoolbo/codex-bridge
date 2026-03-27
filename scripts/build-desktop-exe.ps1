$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$clientRoot = Join-Path $projectRoot "desktop-client"

if (-not (Test-Path $clientRoot)) {
    throw "desktop-client directory not found."
}

Set-Location $clientRoot

if (-not (Test-Path (Join-Path $clientRoot "node_modules"))) {
    npm install
    if ($LASTEXITCODE -ne 0) {
        throw "npm install failed. Exit code: $LASTEXITCODE."
    }
}

npm run dist:win
if ($LASTEXITCODE -ne 0) {
    throw "Portable Windows build failed. Exit code: $LASTEXITCODE."
}
