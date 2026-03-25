param(
    [string]$Python = "python"
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

Write-Host "[1/3] Creating virtual environment..."
& $Python -m venv .venv

$activateScript = Join-Path $projectRoot ".venv\Scripts\Activate.ps1"
if (-not (Test-Path $activateScript)) {
    throw "Virtual environment was not created successfully."
}

Write-Host "[2/3] Activating virtual environment..."
. $activateScript

Write-Host "[3/3] Installing project dependencies..."
python -m pip install --no-build-isolation -e .

Write-Host "Done. Environment is ready."
