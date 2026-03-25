param(
    [Parameter(Mandatory = $true)]
    [string]$Name,

    [string]$Command,

    [string]$ScriptFile,

    [string]$Cwd
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Command) -eq [string]::IsNullOrWhiteSpace($ScriptFile)) {
    throw "Provide exactly one of -Command or -ScriptFile."
}

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot
$env:PYTHONPATH = "src"

$pythonArgs = @("-m", "remote_agent_bridge", "exec")

if (-not [string]::IsNullOrWhiteSpace($Cwd)) {
    $pythonArgs += @("--cwd", $Cwd)
}

if (-not [string]::IsNullOrWhiteSpace($ScriptFile)) {
    $pythonArgs += @("--command-file", $ScriptFile)
}

$pythonArgs += $Name

if (-not [string]::IsNullOrWhiteSpace($Command)) {
    $pythonArgs += @("--", $Command)
}

python @pythonArgs
