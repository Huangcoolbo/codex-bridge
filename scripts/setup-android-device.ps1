param(
    [string]$AdbPath,

    [switch]$InstallPlatformTools,

    [string]$WingetPackageId = "Google.PlatformTools",

    [string]$DeviceSerial,

    [string]$DeviceName,

    [string]$Description,

    [switch]$Probe
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

function Find-AdbExecutable {
    $command = Get-Command adb -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    $candidates = @(
        (Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe"),
        (Join-Path $env:ProgramFiles "Android\platform-tools\adb.exe")
    )

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path $candidate)) {
            return $candidate
        }
    }

    $wingetPackagesRoot = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages"
    if (Test-Path $wingetPackagesRoot) {
        $match = Get-ChildItem -Path $wingetPackagesRoot -Filter adb.exe -File -Recurse -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($match) {
            return $match.FullName
        }
    }

    return $null
}

function Install-PlatformToolsWithWinget {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RequestedPackageId
    )

    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $winget) {
        throw "winget is not available. Install Android platform-tools manually or pass -AdbPath."
    }

    $packageIds = @($RequestedPackageId, "Google.PlatformTools", "Google.AndroidSDK.PlatformTools") |
        Where-Object { $_ } |
        Select-Object -Unique

    foreach ($packageId in $packageIds) {
        Write-Host "Trying winget package id: $packageId"
        & $winget.Source install --id $packageId --exact --accept-package-agreements --accept-source-agreements | Out-Host
        if ($LASTEXITCODE -eq 0) {
            return
        }
    }

    throw "Failed to install Android platform-tools with winget. Try again with -WingetPackageId or install manually."
}

function Resolve-AdbExecutable {
    param(
        [string]$RequestedPath,
        [switch]$AllowInstall,
        [string]$RequestedPackageId
    )

    if ($RequestedPath) {
        if (-not (Test-Path $RequestedPath)) {
            throw "ADB executable not found at: $RequestedPath"
        }
        return (Resolve-Path $RequestedPath).Path
    }

    $adbExecutable = Find-AdbExecutable
    if ($adbExecutable) {
        return $adbExecutable
    }

    if (-not $AllowInstall) {
        throw "ADB is not available. Install Android platform-tools first, or rerun with -InstallPlatformTools."
    }

    Install-PlatformToolsWithWinget -RequestedPackageId $RequestedPackageId

    $adbExecutable = Find-AdbExecutable
    if ($adbExecutable) {
        return $adbExecutable
    }

    throw "Platform-tools installation finished, but adb.exe still was not found. Open a new shell or pass -AdbPath explicitly."
}

function Get-PythonExecutable {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ProjectRoot
    )

    $venvPython = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
    if (Test-Path $venvPython) {
        return $venvPython
    }

    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($python) {
        return $python.Source
    }

    throw "Python is not available. Run scripts\\init.ps1 first or install Python."
}

function Get-AdbDevices {
    param(
        [Parameter(Mandatory = $true)]
        [string]$AdbExecutable
    )

    $output = & $AdbExecutable devices
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to list adb devices. Exit code: $LASTEXITCODE."
    }

    $devices = @()
    foreach ($line in $output) {
        if ([string]::IsNullOrWhiteSpace($line)) {
            continue
        }
        if ($line -match "^List of devices attached") {
            continue
        }
        if ($line -match "^(?<serial>\S+)\s+(?<state>\S+)$") {
            $devices += [pscustomobject]@{
                Serial = $matches.serial
                State  = $matches.state
            }
        }
    }

    return $devices
}

function Select-TargetDevice {
    param(
        [Parameter(Mandatory = $true)]
        [object[]]$Devices,
        [string]$RequestedSerial
    )

    if ($RequestedSerial) {
        $selected = $Devices | Where-Object { $_.Serial -eq $RequestedSerial } | Select-Object -First 1
        if (-not $selected) {
            $known = ($Devices | ForEach-Object { "$($_.Serial) [$($_.State)]" }) -join ", "
            throw "Requested device serial '$RequestedSerial' was not found. Known devices: $known"
        }
        return $selected
    }

    if ($Devices.Count -eq 1) {
        return $Devices[0]
    }

    $known = ($Devices | ForEach-Object { "$($_.Serial) [$($_.State)]" }) -join ", "
    throw "Multiple adb devices are connected. Pass -DeviceSerial explicitly. Known devices: $known"
}

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot
$env:PYTHONPATH = "src"

Write-Host "[1/5] Resolving adb..."
$adbExecutable = Resolve-AdbExecutable -RequestedPath $AdbPath -AllowInstall:$InstallPlatformTools -RequestedPackageId $WingetPackageId
Write-Host "Using adb:" $adbExecutable

Write-Host "[2/5] Starting adb server..."
Invoke-CheckedCommand -Command { & $adbExecutable start-server } -ErrorMessage "Failed to start adb server."

Write-Host "[3/5] Listing connected devices..."
$devices = Get-AdbDevices -AdbExecutable $adbExecutable
if (-not $devices -or $devices.Count -eq 0) {
    Write-Warning "No authorized adb device was found. Connect a phone, enable USB debugging, accept the trust prompt, then rerun the script."
    return
}

foreach ($device in $devices) {
    Write-Host ("- {0} [{1}]" -f $device.Serial, $device.State)
}

$needsRegistration = $DeviceName -or $DeviceSerial -or $Description -or $Probe
if (-not $needsRegistration) {
    Write-Host "[4/5] Skipping bridge registration because no device profile arguments were provided."
    Write-Host "[5/5] Done."
    return
}

$targetDevice = Select-TargetDevice -Devices $devices -RequestedSerial $DeviceSerial
if ($targetDevice.State -ne "device") {
    throw "Device '$($targetDevice.Serial)' is not ready. Current adb state: $($targetDevice.State)"
}

$resolvedDeviceName = if ($DeviceName) { $DeviceName } else { $targetDevice.Serial }
$pythonExecutable = Get-PythonExecutable -ProjectRoot $projectRoot

Write-Host "[4/5] Saving Android device profile to codex-bridge..."
$command = @(
    "-m", "remote_agent_bridge",
    "host", "add", $resolvedDeviceName,
    "--hostname", $targetDevice.Serial,
    "--platform", "android",
    "--transport", "adb"
)

if ($Description) {
    $command += @("--description", $Description)
}

Invoke-CheckedCommand -Command { & $pythonExecutable @command } -ErrorMessage "Failed to save Android device profile."

if ($Probe) {
    Write-Host "[5/5] Probing saved Android device profile..."
    Invoke-CheckedCommand -Command { & $pythonExecutable -m remote_agent_bridge probe $resolvedDeviceName } -ErrorMessage "Failed to probe Android device profile."
}
else {
    Write-Host "[5/5] Done."
}
