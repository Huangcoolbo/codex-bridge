param(
    [Parameter(Mandatory = $true)]
    [string]$PublicKeyPath,

    [Parameter(Mandatory = $true)]
    [string]$AuthorizedKeysPath,

    [switch]$AdministratorsFile
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $PublicKeyPath)) {
    throw "Public key file not found: $PublicKeyPath"
}

$publicKey = (Get-Content -LiteralPath $PublicKeyPath -Raw).Trim()
if (-not $publicKey) {
    throw "Public key file is empty: $PublicKeyPath"
}

$targetDirectory = Split-Path -Parent $AuthorizedKeysPath
if (-not (Test-Path $targetDirectory)) {
    New-Item -ItemType Directory -Path $targetDirectory -Force | Out-Null
}

if (-not (Test-Path $AuthorizedKeysPath)) {
    New-Item -ItemType File -Path $AuthorizedKeysPath -Force | Out-Null
}

$content = Get-Content -LiteralPath $AuthorizedKeysPath -Raw -ErrorAction SilentlyContinue
if ($content -notmatch [regex]::Escape($publicKey)) {
    if ($content -and -not $content.EndsWith("`n")) {
        Add-Content -LiteralPath $AuthorizedKeysPath -Value ""
    }
    Add-Content -LiteralPath $AuthorizedKeysPath -Value $publicKey
}

if ($AdministratorsFile) {
    icacls $AuthorizedKeysPath /inheritance:r | Out-Null
    icacls $AuthorizedKeysPath /grant "BUILTIN\Administrators:F" "NT AUTHORITY\SYSTEM:F" | Out-Null
}
