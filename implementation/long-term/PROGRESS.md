# Progress (long-term)

Last updated: 2026-09-09 (after T01, `main` @ `c09e39d` + long-term context commit).

Machine-readable state: `implementation/progress.json`.
Per-task evidence: `implementation/records/<TASK>.md`.

## Where the project stands

| Task | Status | Gate | Notes |
| --- | --- | --- | --- |
| T00 inspect + preserve legacy | completed | G00 partial | legacy preserved as `legacy` branch + `legacy-v0-20260909-a79f478` tag (local + remote, peeled verified). Build/test part of G00 ran as `not_run` at the time. |
| T01 freeze deps + CMake project | completed | **G01 passed** | configure/build/ctest green in `win-debug` and `win-release`; dependencies locked by SHA-256; AXH1 golden vectors verified. |
| T02 sandbox + audio smoke | not_started | G02 not_run | **next task**; per the task index, T02 failure blocks every candidate-execution path. |
| T03–T18 | not_started | not_run | see `implementation/specification/tasks/INDEX.md` |

## Repository state

| Ref | SHA | Meaning |
| --- | --- | --- |
| `main` | see `git log -1` | V1 tree; descendant of the legacy `main` |
| `legacy` | `a79f4780ac7c25db53ad0c738e48674359fd742f` | pre-V1 snapshot, untouched |
| `legacy-v0-20260909-a79f478` | `a80ddfb7…` → peeled `a79f4780…` | archive tag |
| `v1-rebuild-prep` | `d3848c1` | ancestor of `main`, kept |

- `main` was fast-forwarded (never force-pushed) from `a79f4780` to the V1 tree:
  192 → 267 tracked files, **75 added, 0 deleted**; only `.gitignore`, `AGENTS.md`,
  `CMakeLists.txt`, `README.md` were modified. See `implementation/migration-plan.md` §7.
- Legacy TypeScript/C++ sources, `dist/`, `proj/`, `tests/ts` are still tracked on
  `main` and unused; owner instructed to ignore them (their removal needs a separate
  explicit commit).

## What exists and works

- `CMakePresets.json` — `win-debug` / `win-release` configure+build+test presets, Ninja, x64.
- `CMakeLists.txt` — explicit source lists (no GLOB), one `axiom_target()` registration
  function, 12 component targets + product targets declared with their dependency
  direction; targets whose sources are not yet delivered are reported as **pending**,
  never stubbed.
- `cmake/Warnings.cmake` — `/W4 /permissive- /utf-8 /EHsc /fp:precise`, `/MDd`/`/MD`,
  `/WX` in Release.
- `cmake/Dependencies.cmake` — offline-only resolution, hash/marker gate, Qt 6.11.2
  EXACT check, forbidden Qt components rejected.
- `cmake/BootstrapDependencies.cmake` + `tools/bootstrap-deps.ps1` — user-authorised
  fetch of locked bytes only.
- `deps/lock.json` — nlohmann/json v3.12.0, Catch2 v3.8.1, SQLite 3.53.4 with real
  archive and tree digests; `sqlite3.c` SHA3-256 matches the baseline.
- `tests/contract/` — build contract + AXH1 golden vectors, 1 CTest test, label `domain;build`.
- `LICENSE` (AGPL-3.0 full text) and `deps/THIRD-PARTY-NOTICES.md`.

## Open blockers and awaiting_user

| Item | State | Needed |
| --- | --- | --- |
| VS IDE F5 path | **available now** (VS Insiders 2026, `E:\Microsoft Visual Studio\Common7\IDE\devenv.exe`, 18.10.12120.281) but **not yet exercised** | user performs F5 per `docs/BUILD.md` §3 and records the observation |
| JUCE 8.0.14 | not fetched; DNS blocks juce.com / raw.githubusercontent.com | fetch from GitHub archive, hash, verify `LICENSE.md` |
| `D:\Dev\tools\*` reference projects | unreachable (`D:\Dev` absent) | owner waiver or real paths |
| DAW verification (Live/FL) | not attempted | T17/T18 |
| DCR landing path | resolved by DCR-0003 (this folder) | — |

## Next action

T02 (`implementation/specification/tasks/T02.md`): implement `libs/runner/windows_sandbox.{hpp,cpp}`,
`tests/fixtures/sandbox_probe.cpp`, `tests/platform_probe.cpp`, and the JUCE silent smoke
shell, then run `ctest -L platform_probe`. Read `AGENTS.md`, `RULES.md`, `ERRORS.md`,
`DECISIONS.md` and the task card first. Only the sanctioned `CMakeLists.txt` edits are
allowed outside the owned files.
