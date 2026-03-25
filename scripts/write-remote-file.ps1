param(
    [Parameter(Mandatory = $true)]
    [string]$Name,

    [Parameter(Mandatory = $true)]
    [string]$Path,

    [string]$Content,

    [string]$ContentFile,

    [string]$Encoding = "utf-8"
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Content) -eq [string]::IsNullOrWhiteSpace($ContentFile)) {
    throw "Provide exactly one of -Content or -ContentFile."
}

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot
$env:PYTHONPATH = "src"

$command = @(
    "-m", "remote_agent_bridge", "write-file",
    $Name,
    $Path,
    "--encoding", $Encoding
)

if (-not [string]::IsNullOrWhiteSpace($Content)) {
    $command += @("--content", $Content)
}

if (-not [string]::IsNullOrWhiteSpace($ContentFile)) {
    $command += @("--content-file", $ContentFile)
}

python @command
