# Fetches and verifies the frozen dependency bytes declared in deps/lock.json.
#
# specs/03: the bootstrap is the only networked step. It downloads exactly the
# locked official artefact, verifies its SHA-256, extracts it into
# deps/sources/<name>, and writes a .axiom-lock-verified marker containing the
# digest that cmake/Dependencies.cmake checks at configure time.
#
# This script never executes content from the lock file as code and never
# substitutes a different version: a mismatch aborts.

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$LockFile,
    [Parameter(Mandatory = $true)][string]$Destination,
    [switch]$VerifyOnly,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not (Test-Path -LiteralPath $LockFile)) {
    throw "Lock file not found: $LockFile"
}

$lock = Get-Content -LiteralPath $LockFile -Raw | ConvertFrom-Json
if ($lock.schema_version -ne 1) {
    throw "Unsupported lock schema_version: $($lock.schema_version)"
}

if (-not (Test-Path -LiteralPath $Destination)) {
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
}

function Get-TreeHash {
    param([Parameter(Mandatory = $true)][string]$Root)
    $rootFull = (Resolve-Path -LiteralPath $Root).Path.TrimEnd('\')
    $lines = New-Object System.Collections.Generic.List[string]
    Get-ChildItem -LiteralPath $rootFull -Recurse -File -Force |
        Where-Object { $_.Name -ne '.axiom-lock-verified' } |
        Sort-Object FullName |
        ForEach-Object {
            $rel = $_.FullName.Substring($rootFull.Length).TrimStart('\') -replace '\\', '/'
            $h = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
            $lines.Add("$rel`t$h`t$($_.Length)")
        }
    $joined = ($lines -join "`n") + "`n"
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($joined)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { return ($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join '' }
    finally { $sha.Dispose() }
}

function Expand-LockedArchive {
    param([string]$Archive, [string]$TargetDir, [string]$Kind)
    switch ($Kind) {
        'zip' {
            if (-not (Get-Command Expand-Archive -ErrorAction SilentlyContinue)) {
                throw 'Expand-Archive is unavailable'
            }
            Expand-Archive -LiteralPath $Archive -DestinationPath $TargetDir -Force
        }
        'tar.gz' {
            & tar -xzf $Archive -C $TargetDir
            if ($LASTEXITCODE -ne 0) { throw "tar failed with $LASTEXITCODE" }
        }
        default { throw "Unsupported archive kind '$Kind'" }
    }
}

$results = New-Object System.Collections.Generic.List[object]

foreach ($name in $lock.dependencies.PSObject.Properties.Name) {
    $dep = $lock.dependencies.$name
    $target = Join-Path $Destination $dep.source_dir
    $marker = Join-Path $target '.axiom-lock-verified'

    if ($VerifyOnly) {
        if (-not (Test-Path -LiteralPath $marker)) {
            throw "[$name] missing .axiom-lock-verified marker at $target"
        }
        $actual = (Get-Content -LiteralPath $marker -Raw).Trim()
        if ($actual -ne $dep.sha256) {
            throw "[$name] marker '$actual' != locked '$($dep.sha256)'"
        }
        $results.Add([pscustomobject]@{ name = $name; status = 'verified'; sha256 = $actual })
        continue
    }

    if ((Test-Path -LiteralPath $marker) -and -not $Force) {
        $actual = (Get-Content -LiteralPath $marker -Raw).Trim()
        if ($actual -eq $dep.sha256) {
            $results.Add([pscustomobject]@{ name = $name; status = 'already-verified'; sha256 = $actual })
            continue
        }
    }

    if ([string]::IsNullOrWhiteSpace($dep.url)) {
        throw "[$name] has no locked url; refusing to guess a download location"
    }
    if ([string]::IsNullOrWhiteSpace($dep.sha256) -or $dep.sha256 -eq 'null') {
        throw "[$name] has no locked sha256; refusing to fetch unverifiable bytes"
    }

    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("axiom-bootstrap-" + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force -Path $tmp | Out-Null
    try {
        $archive = Join-Path $tmp $dep.archive_name
        Write-Host "[$name] downloading $($dep.url)"
        Invoke-WebRequest -Uri $dep.url -OutFile $archive -UseBasicParsing -TimeoutSec 900

        $got = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($got -ne $dep.sha256) {
            throw "[$name] SHA-256 mismatch: got $got, locked $($dep.sha256). Aborting without substituting another version."
        }

        if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
        New-Item -ItemType Directory -Force -Path $target | Out-Null

        if ($dep.archive_kind -eq 'none') {
            Copy-Item -LiteralPath $archive -Destination (Join-Path $target $dep.archive_name) -Force
        }
        else {
            Expand-LockedArchive -Archive $archive -TargetDir $target -Kind $dep.archive_kind
        }

        if ($dep.strip_components -and [int]$dep.strip_components -gt 0) {
            $entries = Get-ChildItem -LiteralPath $target -Force
            if ($entries.Count -eq 1 -and $entries[0].PSIsContainer) {
                $inner = $entries[0].FullName
                Get-ChildItem -LiteralPath $inner -Force | ForEach-Object {
                    Move-Item -LiteralPath $_.FullName -Destination $target -Force
                }
                Remove-Item -LiteralPath $inner -Recurse -Force
            }
        }

        Set-Content -LiteralPath $marker -Value $dep.sha256 -NoNewline
        $tree = Get-TreeHash -Root $target
        $results.Add([pscustomobject]@{
            name = $name; status = 'fetched'; sha256 = $dep.sha256; tree_sha256 = $tree
        })
    }
    finally {
        Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
    }
}

$results | Format-Table -AutoSize
$results | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $Destination 'bootstrap-report.json')
Write-Host "Bootstrap complete. Report: $(Join-Path $Destination 'bootstrap-report.json')"
