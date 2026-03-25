param(
    [Parameter(Mandatory = $true)]
    [string]$Name,

    [Parameter(Mandatory = $true)]
    [string]$HostName,

    [Parameter(Mandatory = $true)]
    [string]$UserName,

    [ValidateSet("key", "password")]
    [string]$Auth = "key",

    [string]$KeyPath,

    [int]$Port = 22,

    [string]$Description
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot
$env:PYTHONPATH = "src"

$command = @(
    "-m", "remote_agent_bridge",
    "host", "add", $Name,
    "--hostname", $HostName,
    "--username", $UserName,
    "--port", "$Port",
    "--auth", $Auth
)

if ($Description) {
    $command += @("--description", $Description)
}

if ($Auth -eq "key") {
    if (-not $KeyPath) {
        throw "Key auth requires -KeyPath."
    }
    $command += @("--key-path", $KeyPath)
}

python @command
