param(
    [switch]$EnsurePython = $true,
    [switch]$EnsureAdb = $true
)

$ErrorActionPreference = "Stop"

function Resolve-ConfiguredProjectRoot {
    if ($env:CODEX_BRIDGE_RUNTIME_ROOT) {
        return $env:CODEX_BRIDGE_RUNTIME_ROOT
    }

    return (Split-Path -Parent $PSScriptRoot)
}

function Resolve-ConfiguredDataRoot {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ProjectRoot
    )

    if ($env:CODEX_BRIDGE_DATA_ROOT) {
        return $env:CODEX_BRIDGE_DATA_ROOT
    }

    return (Join-Path $ProjectRoot "data")
}

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

    return $null
}

function Install-PythonWithWinget {
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $winget) {
        throw "Python launcher was not found and winget is unavailable. Install Python manually."
    }

    $packageIds = @(
        "Python.Python.3.13",
        "Python.Python.3.12"
    )

    foreach ($packageId in $packageIds) {
        Write-Host "[bootstrap] Trying to install Python via winget: $packageId"
        & $winget.Source install --id $packageId --exact --silent --accept-package-agreements --accept-source-agreements | Out-Host
        if ($LASTEXITCODE -eq 0) {
            Start-Sleep -Seconds 2
            return
        }
    }

    throw "Failed to install Python automatically with winget."
}

function Ensure-PythonLauncher {
    $launcher = Resolve-PythonLauncher
    if ($launcher) {
        return $launcher
    }

    Install-PythonWithWinget
    $launcher = Resolve-PythonLauncher
    if ($launcher) {
        return $launcher
    }

    throw "Python launcher was not found after automatic installation."
}

function Test-PythonEnvironmentReady {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PythonExecutable
    )

    if (-not (Test-Path $PythonExecutable)) {
        return $false
    }

    & $PythonExecutable -c "import paramiko, remote_agent_bridge" *> $null
    return ($LASTEXITCODE -eq 0)
}

function Test-CurrentUserIsAdministratorMember {
    try {
        $group = [ADSI]"WinNT://./Administrators,group"
        $members = @($group.psbase.Invoke("Members")) | ForEach-Object {
            $_.GetType().InvokeMember("Name", "GetProperty", $null, $_, $null)
        }
        return ($members -contains $env:USERNAME)
    }
    catch {
        return $false
    }
}

function Resolve-AuthorizedKeysTarget {
    $isAdminMember = Test-CurrentUserIsAdministratorMember
    if ($isAdminMember) {
        return [pscustomobject]@{
            Path = "C:\ProgramData\ssh\administrators_authorized_keys"
            AdministratorsFile = $true
        }
    }

    return [pscustomobject]@{
        Path = (Join-Path $env:USERPROFILE ".ssh\authorized_keys")
        AdministratorsFile = $false
    }
}

function Resolve-PowerShellExecutable {
    $pwsh = Join-Path ${env:ProgramFiles} "PowerShell\7\pwsh.exe"
    if (Test-Path $pwsh) {
        return $pwsh
    }

    return "powershell.exe"
}

function Ensure-ManagedLocalhostSshKey {
    param(
        [Parameter(Mandatory = $true)]
        [string]$DataRoot,

        [Parameter(Mandatory = $true)]
        [string]$ScriptsRoot
    )

    $sshKeygen = Get-Command ssh-keygen -ErrorAction SilentlyContinue
    if (-not $sshKeygen) {
        Write-Host "[bootstrap] ssh-keygen was not found. Skipping localhost SSH key provisioning."
        return
    }

    $sshRoot = Join-Path $DataRoot "ssh"
    $privateKeyPath = Join-Path $sshRoot "localhost_ed25519"
    $publicKeyPath = "$privateKeyPath.pub"

    New-Item -ItemType Directory -Path $sshRoot -Force | Out-Null

    if (-not (Test-Path $privateKeyPath)) {
        Write-Host "[bootstrap] Generating managed localhost SSH key..."
        Invoke-CheckedCommand -Command {
            & $sshKeygen.Source -q -t ed25519 -N "" -f $privateKeyPath -C "codex-bridge-localhost"
        } -ErrorMessage "Failed to generate the managed localhost SSH key."
    }

    if (-not (Test-Path $publicKeyPath)) {
        throw "Managed localhost public key was not created: $publicKeyPath"
    }

    $authorizedKeys = Resolve-AuthorizedKeysTarget
    $authorizationScript = Join-Path $ScriptsRoot "authorize-managed-ssh-key.ps1"
    if (-not (Test-Path $authorizationScript)) {
        throw "Authorization helper script was not found: $authorizationScript"
    }

    Write-Host "[bootstrap] Ensuring localhost SSH public key is authorized..."
    try {
        & $authorizationScript -PublicKeyPath $publicKeyPath -AuthorizedKeysPath $authorizedKeys.Path -AdministratorsFile:$authorizedKeys.AdministratorsFile
        if ($LASTEXITCODE -ne 0) {
            throw "Authorization helper exited with code $LASTEXITCODE."
        }
    }
    catch {
        if (-not $authorizedKeys.AdministratorsFile) {
            throw
        }

        Write-Host "[bootstrap] Elevation is required to update administrators_authorized_keys. Requesting elevation..."
        $shell = Resolve-PowerShellExecutable
        $arguments = @(
            "-NoProfile",
            "-ExecutionPolicy", "Bypass",
            "-File", $authorizationScript,
            "-PublicKeyPath", $publicKeyPath,
            "-AuthorizedKeysPath", $authorizedKeys.Path,
            "-AdministratorsFile"
        )
        $process = Start-Process -FilePath $shell -ArgumentList $arguments -Verb RunAs -Wait -PassThru
        if ($process.ExitCode -ne 0) {
            throw "Elevated localhost SSH authorization failed with code $($process.ExitCode)."
        }
    }
}

$projectRoot = Resolve-ConfiguredProjectRoot
$dataRoot = Resolve-ConfiguredDataRoot -ProjectRoot $projectRoot
Set-Location $projectRoot
New-Item -ItemType Directory -Path $dataRoot -Force | Out-Null

if ($EnsurePython) {
    $venvPython = Join-Path $projectRoot ".venv\Scripts\python.exe"
    $isManagedRuntime = -not [string]::IsNullOrWhiteSpace($env:CODEX_BRIDGE_RUNTIME_ROOT)
    $venvExists = Test-Path $venvPython
    $venvReady = if ($venvExists) { Test-PythonEnvironmentReady -PythonExecutable $venvPython } else { $false }

    if (-not $venvExists -or -not $venvReady) {
        if ($venvExists -and -not $venvReady) {
            Write-Host "[bootstrap] Python environment is incomplete. Repairing dependencies..."
            if ($isManagedRuntime) {
                Remove-Item -LiteralPath (Join-Path $projectRoot ".venv") -Recurse -Force -ErrorAction SilentlyContinue
                $venvExists = $false
            }
        }

        if (-not $venvExists) {
            Write-Host "[bootstrap] Python environment missing. Creating .venv..."
            $launcher = Ensure-PythonLauncher
            Invoke-CheckedCommand -Command { & $launcher.Command @($launcher.Args + @("-m", "venv", ".venv")) } -ErrorMessage "Failed to create the virtual environment."
        }

        if (-not (Test-Path $venvPython)) {
            throw "Python virtual environment creation failed: $venvPython was not created."
        }

        Write-Host "[bootstrap] Installing Python dependencies..."
        Invoke-CheckedCommand -Command { & $venvPython -m ensurepip --upgrade } -ErrorMessage "Failed to prepare pip in the virtual environment."
        Invoke-CheckedCommand -Command { & $venvPython -m pip install setuptools wheel } -ErrorMessage "Failed to install packaging tools in the virtual environment."
        Invoke-CheckedCommand -Command { & $venvPython -m pip install --no-build-isolation -e . } -ErrorMessage "Failed to install project dependencies."
        Invoke-CheckedCommand -Command { & $venvPython -m pip install pytest } -ErrorMessage "Failed to install pytest in the virtual environment."

        if (-not (Test-PythonEnvironmentReady -PythonExecutable $venvPython)) {
            throw "Python environment repair finished, but required packages still are not importable."
        }

        Write-Host "[bootstrap] Python environment is ready."
    }
    else {
        Write-Host "[bootstrap] Python environment already present."
    }
}

Ensure-ManagedLocalhostSshKey -DataRoot $dataRoot -ScriptsRoot $PSScriptRoot

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
