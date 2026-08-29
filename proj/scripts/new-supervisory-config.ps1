param(
    [Parameter(Mandatory = $true)]
    [string]$StateRoot,
    [Parameter(Mandatory = $true)]
    [string]$BridgePath,
    [Parameter(Mandatory = $true)]
    [string]$OutputPath,
    [Parameter(Mandatory = $true)]
    [string]$ValidationStagingRoot,
    [string]$BridgeWorkingDirectory = '',
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

function Resolve-AbsolutePath([string]$Path, [string]$Name, [bool]$MustExist) {
    if ($Path -notmatch '^(?:[A-Za-z]:[\\/]|\\\\)') {
        throw "$Name must be an absolute path."
    }
    if ($MustExist -and -not (Test-Path -LiteralPath $Path)) {
        throw "$Name does not exist: $Path"
    }
    return [System.IO.Path]::GetFullPath($Path)
}

$state = Resolve-AbsolutePath $StateRoot 'StateRoot' $false
$bridge = Resolve-AbsolutePath $BridgePath 'BridgePath' $true
$output = Resolve-AbsolutePath $OutputPath 'OutputPath' $false
$validationStaging = Resolve-AbsolutePath $ValidationStagingRoot 'ValidationStagingRoot' $false
$statePrefix = $state.TrimEnd([System.IO.Path]::DirectorySeparatorChar) +
    [System.IO.Path]::DirectorySeparatorChar
if ($output.StartsWith($statePrefix, [System.StringComparison]::OrdinalIgnoreCase) -or
    $output.Equals($state, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'OutputPath must be outside the authoritative StateRoot.'
}
if ((Test-Path -LiteralPath $output) -and -not $Force) {
    throw "OutputPath already exists; pass -Force to replace it: $output"
}

$config = [ordered]@{
    stateRoot = $state
    bridgePath = $bridge
    bridgeArgs = @()
    hostActorId = 'actor:local-host'
    userActorId = 'actor:local-user'
    maxLineBytes = 65536
    validationProfile = [ordered]@{
        toolchain = [ordered]@{ name = 'cmake'; version = 'system'; target = 'linux-x86_64' }
        wslDistribution = 'Ubuntu-24.04'
        stagingRoot = $validationStaging
        allowedExecutables = @('/usr/bin/cmake', '/usr/bin/ctest')
        process = [ordered]@{
            timeoutMs = 120000; maxStdinBytes = 1048576
            maxStdoutBytes = 8388608; maxStderrBytes = 4194304; killGraceMs = 500
        }
        resources = [ordered]@{ maxMemoryBytes = 1073741824; cpuQuotaPercent = 100; maxProcesses = 64 }
        maxCommands = 4
        candidateCommands = @(
            [ordered]@{ commandId = 'candidate-configure'; executable = '/usr/bin/cmake'; args = @('-S', '.', '-B', 'build', '-G', 'Ninja'); cwd = 'candidate' },
            [ordered]@{ commandId = 'candidate-build'; executable = '/usr/bin/cmake'; args = @('--build', 'build'); cwd = 'candidate' }
        )
        standardCommands = @(
            [ordered]@{ commandId = 'laboratory-tests'; executable = '/usr/bin/ctest'; args = @('--test-dir', 'build', '--output-on-failure'); cwd = 'candidate' }
        )
    }
    memoryToolPolicies = @(
        [ordered]@{
            toolName = 'compute_buffer'
            toolId = 'tool:compute-buffer'
            toolVersion = '1.0.0'
            operations = @('compute.create', 'compute.read', 'compute.update', 'compute.snapshot', 'compute.release')
            maxOperations = 2
            maxRequestBytes = 1048576
            lifetimeMs = 10000
        },
        [ordered]@{
            toolName = 'derive_artifact'
            toolId = 'tool:derive-artifact'
            toolVersion = '1.0.0'
            operations = @('artifact.read', 'artifact.derive')
            maxOperations = 2
            maxRequestBytes = 1048576
            lifetimeMs = 10000
        }
    )
}
if (-not [string]::IsNullOrWhiteSpace($BridgeWorkingDirectory)) {
    $config['bridgeWorkingDirectory'] = Resolve-AbsolutePath `
        $BridgeWorkingDirectory 'BridgeWorkingDirectory' $true
}

$parent = Split-Path -Parent $output
if (-not [string]::IsNullOrWhiteSpace($parent)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
}
$json = $config | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText(
    $output, $json, [System.Text.UTF8Encoding]::new($false))
Write-Output $output
