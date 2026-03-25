param(
    [string]$Python = "py -3.13"
)

$ErrorActionPreference = "Stop"

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory = $true)]
        [scriptblock]$Command,

        [Parameter(Mandatory = $true)]
        [string]$ErrorMessage
    )

    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw $ErrorMessage
    }
}

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

if (Test-Path ".venv") {
    Write-Host "Removing existing .venv so the environment is rebuilt with the selected Python..."
    Remove-Item -Recurse -Force ".venv"
}

Write-Host "[1/4] Creating virtual environment with Python 3.13..."
Invoke-CheckedCommand -Command { Invoke-Expression "$Python -m venv .venv" } -ErrorMessage "Failed to create the virtual environment."

$activateScript = Join-Path $projectRoot ".venv\Scripts\Activate.ps1"
if (-not (Test-Path $activateScript)) {
    throw "Virtual environment was not created successfully."
}

Write-Host "[2/4] Activating virtual environment..."
. $activateScript

$venvPython = Join-Path $projectRoot ".venv\Scripts\python.exe"
Write-Host "Using interpreter:" (& $venvPython --version)

Write-Host "[3/4] Making sure packaging tools are available..."
Invoke-CheckedCommand -Command { & $venvPython -m ensurepip --upgrade } -ErrorMessage "Failed to prepare pip in the virtual environment."
Invoke-CheckedCommand -Command { & $venvPython -m pip install setuptools wheel } -ErrorMessage "Failed to install packaging tools in the virtual environment."

Write-Host "[4/4] Installing project dependencies..."
Invoke-CheckedCommand -Command { & $venvPython -m pip install --no-build-isolation -e . } -ErrorMessage "Failed to install project dependencies."

Write-Host "Done. Environment is ready."
