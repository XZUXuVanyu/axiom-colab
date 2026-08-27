[CmdletBinding()]
param(
    [string]$HarnessRoot = '',
    [string]$ReferencePluginRoot = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Require-Pattern(
    [string]$Path,
    [string]$Pattern,
    [string]$Contract
) {
    if (-not (Select-String -LiteralPath $Path -Pattern $Pattern -Quiet)) {
        throw "Harness API check failed: $Contract was not found in $Path"
    }
}

if (-not (Test-Path -LiteralPath $HarnessRoot -PathType Container)) {
    throw "Harness root does not exist: $HarnessRoot"
}
$cliPackage = Join-Path $HarnessRoot 'apps\cli\package.json'
$toolApi = Join-Path $HarnessRoot 'packages\core\tools\src\index.ts'
$skillApi = Join-Path $HarnessRoot 'packages\skill\skill\src\index.ts'
foreach ($requiredFile in @($cliPackage, $toolApi, $skillApi)) {
    if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
        throw "Required Harness source file does not exist: $requiredFile"
    }
}

$version = (Get-Content -LiteralPath $cliPackage -Raw | ConvertFrom-Json).version
Require-Pattern $toolApi 'register\(definition:\s*ToolDefinition\):\s*\(\)\s*=>\s*void' 'raw Tool registration'
Require-Pattern $toolApi 'readonly output:\s*ToolOutputDefinition' 'output schema/render contract'
Require-Pattern $toolApi 'timeoutMs\?:\s*number' 'Tool timeout metadata'
Require-Pattern $toolApi 'isConcurrencySafe\?' 'Tool concurrency metadata'
Require-Pattern $skillApi 'register\(skill:\s*SkillRegistration\):\s*\(\)\s*=>\s*void' 'runtime Skill registration'

Write-Host "Harness version: $version"
Write-Host "Tool API: raw JSON Schema + output + timeout + concurrency verified"
Write-Host "Skill API: runtime skills.register verified"
if ([string]::IsNullOrWhiteSpace($ReferencePluginRoot)) {
    Write-Host 'Reference plugin inspection skipped (no checkout supplied).'
} else {
    if (-not (Test-Path -LiteralPath $ReferencePluginRoot -PathType Container)) {
        throw "Reference plugin root does not exist: $ReferencePluginRoot"
    }
    $referenceFiles = @(Get-ChildItem -LiteralPath $ReferencePluginRoot -Recurse -File `
        | Where-Object { $_.Extension -in @('.ts', '.js', '.yml', '.yaml', '.json') })
    if ($referenceFiles.Count -eq 0) {
        throw "No reference plugin source/config files were found under $ReferencePluginRoot"
    }
    Write-Host "Reference plugin files visible: $($referenceFiles.Count)"
}
