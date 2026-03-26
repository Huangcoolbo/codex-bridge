param(
    [switch]$EnsurePython = $true,
    [switch]$EnsureAdb = $true
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
        throw "$ErrorMessage Exit code: $LASTEXITCODE."
    }
}

function Resolve-PythonLauncher {
    $candidates = @(
        @{ Command = "py"; Args = @("-3.13") },
        @{ Command = "py"; Args = @("-3") },
        @{ Command = "python"; Args = @() }
    )

    foreach ($candidate in $candidates) {
        $command = Get-Command $candidate.Command -ErrorAction SilentlyContinue
        if ($command) {
            return [pscustomobject]@{
                Command = $command.Source
                Args = $candidate.Args
            }
        }
    }

    throw "Python launcher was not found. Install Python first."
}

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

if ($EnsurePython) {
    $venvPython = Join-Path $projectRoot ".venv\Scripts\python.exe"
    if (-not (Test-Path $venvPython)) {
        Write-Host "[bootstrap] Python environment missing. Creating .venv..."
        $launcher = Resolve-PythonLauncher
        Invoke-CheckedCommand -Command { & $launcher.Command @($launcher.Args + @("-m", "venv", ".venv")) } -ErrorMessage "Failed to create the virtual environment."
        Invoke-CheckedCommand -Command { & $venvPython -m ensurepip --upgrade } -ErrorMessage "Failed to prepare pip in the virtual environment."
        Invoke-CheckedCommand -Command { & $venvPython -m pip install setuptools wheel } -ErrorMessage "Failed to install packaging tools in the virtual environment."
        Invoke-CheckedCommand -Command { & $venvPython -m pip install --no-build-isolation -e . } -ErrorMessage "Failed to install project dependencies."
        Invoke-CheckedCommand -Command { & $venvPython -m pip install pytest } -ErrorMessage "Failed to install pytest in the virtual environment."
        Write-Host "[bootstrap] Python environment is ready."
    }
    else {
        Write-Host "[bootstrap] Python environment already present."
    }
}

if ($EnsureAdb) {
    $androidSetupScript = Join-Path $PSScriptRoot "setup-android-device.ps1"
    if (-not (Test-Path $androidSetupScript)) {
        throw "Android setup script was not found: $androidSetupScript"
    }

    Write-Host "[bootstrap] Ensuring Android platform-tools and adb server..."
    & $androidSetupScript -InstallPlatformTools
    if ($LASTEXITCODE -ne 0) {
        throw "Android setup bootstrap failed. Exit code: $LASTEXITCODE."
    }
}

Write-Host "[bootstrap] Done."
