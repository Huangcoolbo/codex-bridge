param(
    [Parameter(Mandatory = $true)]
    [string]$Name,

    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [string]$Pattern,

    [string]$Encoding = "utf-8",

    [switch]$Recurse
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot
$env:PYTHONPATH = "src"

$pythonArgs = @(
    "-m", "remote_agent_bridge", "search-text",
    $Name,
    $Path,
    $Pattern,
    "--encoding", $Encoding
)

if ($Recurse) {
    $pythonArgs += "--recurse"
}

python @pythonArgs
