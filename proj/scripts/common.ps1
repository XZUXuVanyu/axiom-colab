Set-StrictMode -Version Latest

function Get-AdapterSettings {
    param([string]$ProjectRoot)

    $settings = @{}
    $defaultsPath = Join-Path $ProjectRoot 'proj\config\adapter.defaults.json'
    $localPath = Join-Path $ProjectRoot 'proj\config\adapter.local.json'
    foreach ($path in @($defaultsPath, $localPath)) {
        if (Test-Path -LiteralPath $path -PathType Leaf) {
            $document = Get-Content -Raw -LiteralPath $path | ConvertFrom-Json
            foreach ($property in $document.PSObject.Properties) {
                $settings[$property.Name] = $property.Value
            }
        }
    }
    return $settings
}

function Find-CMakeGenerator {
    param([string]$Requested = '')

    $help = (& cmake --help | Out-String)
    if ($LASTEXITCODE -ne 0) { throw 'cmake --help failed' }
    $candidates = if ([string]::IsNullOrWhiteSpace($Requested)) {
        @('Visual Studio 18 2026', 'Visual Studio 17 2022', 'Ninja Multi-Config', 'Ninja')
    } else {
        @($Requested)
    }
    foreach ($candidate in $candidates) {
        if ($help -match "(?m)^\s*\*?\s*$([regex]::Escape($candidate))\s*=") {
            return $candidate
        }
    }
    throw "No supported CMake generator found. Tried: $($candidates -join ', ')"
}

function Normalize-ProcessPath {
    $processPath = $env:Path
    Remove-Item Env:Path -ErrorAction SilentlyContinue
    $env:Path = $processPath
}
