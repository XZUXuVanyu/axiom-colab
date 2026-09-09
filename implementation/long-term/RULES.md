# Governing rules (long-term)

This is the condensed, always-current rule set for Axiom V1. The full text is
`AGENTS.md` at the repository root (which reproduces the frozen production
constraints) and `implementation/specification/` (the frozen specification).

## Precedence

user instruction > approved DCR > `AGENTS.md` > specs & contracts > acceptance
matrix > FILE-MANIFEST > task card > guide.

A same-level contradiction must be raised as a DCR; never pick the convenient reading.

## Non-negotiable

1. **Serial execution.** Tasks T00–T18 have a fixed dependency order. One task per
   turn. No parallel implementation, no multiple agents editing shared files.
2. **Evidence ladder.** `written` → `built` → `tested` → `independent` → `user approved`
   → `DAW verified` are separate levels. Never infer a higher level from a lower one.
3. **No fabricated results.** Never invent command output, hashes, versions, or
   "passed" states. A missing platform/tool is recorded as `not_run` / `awaiting_user`.
4. **Trust separation.** `model claim != observed result != validated evidence != user
   approval`. The implementing model may not approve its own design, validation, or
   release.
5. **Frozen oracles.** Never change tests, tolerances, parameter domains, or disable
   failing cases to make an implementation pass.
6. **Offline, locked dependencies.** Normal builds never download. Bytes come from
   `deps/sources/` and must match `deps/lock.json`; a null/mismatched hash fails
   configure. No `latest`, no second package manager.
7. **No design drift.** Internal helpers are free; public fields, state machines,
   permissions, dependencies, algorithms, tolerances and file sets require a DCR.
8. **Whitelist.** `FILE-MANIFEST.csv` lists the handwritten production files. Never
   create a 13th business subsystem; new files require an approved DCR + manifest entry.
9. **History immutability.** Legacy bytes live in `legacy` / `legacy-v0-20260909-a79f478`.
   No force-push, no remote reset, no orphan branch.
10. **Isolation is not optional.** AppContainer failure may not be replaced by an
    ordinary child process to make a gate pass. Job Object limits are not a permission
    boundary.
11. **Scientific honesty.** Unknown uncertainty is not zero; float64 is not an error
    guarantee; non-convergence is not success; physical parameters are never silently
    truncated.
12. **Records live here.** Progress and errors are recorded only in `implementation/`
    (`records/`, `progress.json`, `long-term/`, approved DCRs). Business source files
    never carry test reports; logs never contain secrets or private challenges.

## Current owner-approved deviations from the frozen spec

| ID | Deviation | Approval |
| --- | --- | --- |
| DCR-0001 | toolchain: VS Insiders 2026 IDE on `E:\Microsoft Visual Studio` + MSVC 14.44 (baseline) / 14.51 (installed), CMake 4.3.1, Ninja 1.13.2 | owner 2026-09-09 |
| DCR-0001 | repository path is `D:\axiom-colab` (spec text says `D:\Dev\axiom-colab`) | owner 2026-09-09 |
| DCR-0002 | project licence is AGPL-3.0-or-later | owner 2026-09-09 |
| DCR-0003 | long-term context folder replaces the legacy `for-agent/` handoff rule | owner 2026-09-09 |
