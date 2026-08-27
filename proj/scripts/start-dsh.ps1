[CmdletBinding()]
param(
    [string]$HarnessRoot = '',
    [ValidateSet('normal', 'tool-only')]
    [string]$Mode = 'normal',
    [string]$BridgePath = '',
    [string]$PatchPath = '',
    [switch]$SkipDependencyInstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
. (Join-Path $PSScriptRoot 'common.ps1')
$settings = Get-AdapterSettings -ProjectRoot $projectRoot
if ([string]::IsNullOrWhiteSpace($HarnessRoot) -and $settings.ContainsKey('harnessRoot')) {
    $HarnessRoot = [string]$settings['harnessRoot']
}
if ([string]::IsNullOrWhiteSpace($PatchPath)) {
    $PatchPath = Join-Path $projectRoot "proj\patches\generated\general-ts-cpp-adapter-$Mode.yml"
}

if (-not (Test-Path -LiteralPath $HarnessRoot -PathType Container)) {
    throw 'Harness root does not exist. Pass -HarnessRoot or set harnessRoot in proj/config/adapter.local.json.'
}

$overlayArguments = @((Join-Path $PSScriptRoot 'generate-overlay.mjs'), '--mode', $Mode, '--output', $PatchPath)
if (-not [string]::IsNullOrWhiteSpace($BridgePath)) {
    $overlayArguments += @('--bridge', $BridgePath)
}
& node @overlayArguments
if ($LASTEXITCODE -ne 0) { throw "overlay generation failed with exit code $LASTEXITCODE" }

Push-Location $HarnessRoot
try {
    if (-not $SkipDependencyInstall -and
        -not (Test-Path -LiteralPath (Join-Path $HarnessRoot 'node_modules') -PathType Container)) {
        Write-Host 'Harness dependencies are missing; running pnpm install --frozen-lockfile.'
        & pnpm install --frozen-lockfile
        if ($LASTEXITCODE -ne 0) {
            throw "pnpm install failed with exit code $LASTEXITCODE"
        }
    }
    & pnpm dsh web --patch $PatchPath
    if ($LASTEXITCODE -ne 0) {
        throw "dsh web failed with exit code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}
