# Local operations and recovery

The supervisory state root is authoritative. Stop the Qt application and its
Node supervisory child before copying, backing up, or restoring that directory.
Configuration, build trees, WSL validation staging, and generated logs are not
authoritative state and are deliberately excluded from a state archive.

On Windows, choose a short state root such as `D:\Axiom\state`. Candidate
installation locators use collision-detecting 128-bit hash prefixes while full
workspace/candidate hashes remain authoritative and are reverified from stored
evidence. Deep state roots can still exceed legacy compiler/CMake object-path
limits during trusted executable builds; the build must fail closed rather
than relocating unverified output.

The supported WSL validation composition requires Ubuntu 24.04 with systemd,
Bubblewrap, cgroup v2, `prlimit`, CMake, CTest, Ninja, and a C++ compiler. These
are host prerequisites and are not downloaded by Axiom CoLab. Run the opt-in
confinement suite before accepting a machine for promotable validation.

## Create and verify an offline backup

Use absolute, non-overlapping paths. The archive target must not already exist.

```powershell
node .\proj\scripts\state-archive.mjs `
  --mode backup `
  --state-root D:\AxiomCoLab\state `
  --archive E:\AxiomBackups\state-2026-08-31

node .\proj\scripts\state-archive.mjs `
  --mode verify `
  --archive E:\AxiomBackups\state-2026-08-31
```

The command rejects SQLite `-wal` or `-shm` files because their presence means
the state cannot be assumed to be an offline, checkpointed snapshot. It also
rejects symbolic links, special filesystem entries, path overlap, an existing
target, unbound payload files, and any payload or manifest hash mismatch.

The archive is a directory containing `manifest.json`, `manifest.sha256`, and a
`payload` tree. The manifest binds every relative path, byte size, and SHA-256
hash. Backup is written to a sibling staging directory, verified, then renamed;
an interrupted staging directory never becomes the requested archive path.

## Restore

Restore only into a new state root, then point a separately stored supervisory
configuration at that root. Never restore over a running or existing state.

```powershell
node .\proj\scripts\state-archive.mjs `
  --mode restore `
  --archive E:\AxiomBackups\state-2026-08-31 `
  --restore-root D:\AxiomCoLab\restored-state
```

Restore verifies the archive before copying, reconstructs into a sibling
staging directory, hashes the restored files again, and only then renames it to
the requested state root. Start the supervisory process with the restored root
and use authoritative workspace/goal inspection to confirm recovery.

## Failure diagnostics

The command writes a single JSON success record to stdout. Failures go to stderr
with a stable bracketed code. Important codes include:

- `STATE_NOT_OFFLINE`: stop all supervisory processes and retry after SQLite
  has checkpointed and removed its WAL/SHM files.
- `CORRUPT_ARCHIVE_MANIFEST` or `CORRUPT_ARCHIVE_PAYLOAD`: do not restore this
  copy; use another verified backup.
- `TARGET_EXISTS`: choose a new archive or restore path. Existing data is never
  replaced.
- `PATH_OVERLAP`: move the archive outside the state/restore trees.
- `UNSAFE_STATE_ENTRY`: remove or separately account for links/special entries;
  they are not part of the supported local state format.

This mechanism does not migrate schemas between incompatible application
versions. Stage 10 migration notes must identify any required version-specific
procedure before a release changes a durable schema.
