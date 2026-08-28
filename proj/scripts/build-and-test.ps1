[CmdletBinding()]
param(
    [string]$Generator = '',
    [ValidateSet('', 'Win32', 'x64', 'ARM', 'ARM64')]
    [string]$Architecture = '',
    [string]$HarnessRoot = '',
    [string]$ReferencePluginRoot = '',
    [switch]$SkipHarnessInspection,
    [switch]$SkipGuiBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$buildRoot = Join-Path $projectRoot 'build\windows'
. (Join-Path $PSScriptRoot 'common.ps1')
$settings = Get-AdapterSettings -ProjectRoot $projectRoot
if ([string]::IsNullOrWhiteSpace($HarnessRoot) -and $settings.ContainsKey('harnessRoot')) {
    $HarnessRoot = [string]$settings['harnessRoot']
}
if ([string]::IsNullOrWhiteSpace($ReferencePluginRoot)) {
    if ($settings.ContainsKey('referencePluginRoot')) {
        $ReferencePluginRoot = [string]$settings['referencePluginRoot']
    }
}

function Assert-LastExitCode([string]$Step) {
    if ($LASTEXITCODE -ne 0) {
        throw "$Step failed with exit code $LASTEXITCODE"
    }
}

Push-Location $projectRoot
try {
    # Some launchers pass both Path and PATH on Windows. MSBuild 18 treats
    # those case variants as duplicate dictionary keys when it starts cl.exe.
    Normalize-ProcessPath

    if (-not $SkipHarnessInspection) {
        if ([string]::IsNullOrWhiteSpace($HarnessRoot)) {
            throw 'HarnessRoot is required for inspection; pass -HarnessRoot, set proj/config/adapter.local.json, or use -SkipHarnessInspection.'
        }
        & (Join-Path $PSScriptRoot 'inspect-local-harness.ps1') `
            -HarnessRoot $HarnessRoot -ReferencePluginRoot $ReferencePluginRoot
    }

    $nodeVersion = (& node --version).TrimStart('v')
    Assert-LastExitCode 'node --version'
    if ([version]$nodeVersion -lt [version]'24.0.0') {
        throw "Node.js 24 or newer is required; found $nodeVersion"
    }

    if ([string]::IsNullOrWhiteSpace($Generator) -and $settings.ContainsKey('generator')) {
        $Generator = [string]$settings['generator']
    }
    if ([string]::IsNullOrWhiteSpace($Architecture)) {
        $Architecture = if ($settings.ContainsKey('architecture')) {
            [string]$settings['architecture']
        } else {
            'x64'
        }
    }
    $resolvedGenerator = Find-CMakeGenerator -Requested $Generator
    $configureArguments = @('--fresh', '-S', '.', '-B', $buildRoot, '-G', $resolvedGenerator,
        '-DBUILD_TESTING=ON', '-DCPP_ADAPTER_WARNINGS_AS_ERRORS=ON')
    if ($resolvedGenerator.StartsWith('Visual Studio ')) {
        $configureArguments += @('-A', $Architecture)
    }
    Write-Host "CMake generator: $resolvedGenerator"
    & cmake @configureArguments
    Assert-LastExitCode 'CMake configure'

    foreach ($configuration in @('Debug', 'Release')) {
        $buildArguments = @('--build', $buildRoot, '--config', $configuration,
            '--parallel')
        if ($SkipGuiBuild) {
            $buildArguments += @('--target', 'cpp-tool-bridge',
                'cpp-memory-test-bridge', 'cpp-adapter-tests')
        }
        & cmake @buildArguments
        Assert-LastExitCode "C++ $configuration build"
        & ctest --test-dir $buildRoot -C $configuration --output-on-failure
        Assert-LastExitCode "C++ $configuration tests"
    }

    & node proj/scripts/build.mjs
    Assert-LastExitCode 'TypeScript adapter build'
    & node --test tests/ts/adapter.test.ts tests/ts/authoring-boundary.test.ts tests/ts/deployment.test.ts
    Assert-LastExitCode 'TypeScript adapter tests'

    foreach ($configuration in @('Debug', 'Release')) {
        $bridge = Join-Path $buildRoot "$configuration/cpp-tool-bridge.exe"
        $env:CPP_BRIDGE_PATH = $bridge
        $descriptionText = (& $bridge --describe-tools | Out-String)
        Assert-LastExitCode "$configuration --describe-tools"
        $description = $descriptionText | ConvertFrom-Json
        $names = @($description.tools | ForEach-Object { $_.name })
        if ($description.protocolVersion -ne '1.0' -or $names.Count -lt 1) {
            throw "$configuration registration smoke test returned an unexpected descriptor set"
        }
        $env:AXIOM_MEMORY_TEST_BRIDGE = Join-Path $buildRoot `
            "$configuration/cpp-memory-test-bridge.exe"
        & node --test tests/integration/*.test.ts
        Assert-LastExitCode "$configuration scoped-memory integration tests"
    }
} finally {
    Remove-Item Env:CPP_BRIDGE_PATH -ErrorAction SilentlyContinue
    Remove-Item Env:AXIOM_MEMORY_TEST_BRIDGE -ErrorAction SilentlyContinue
    Pop-Location
}

Write-Host 'All portable, Debug, Release, and integration checks passed.'
