# Axiom CoLab Current Handoff

Last updated: 2026-08-27

## Current state

- Stage 0 consolidation is complete enough to enter Stage 1; no memory service,
  adapter redesign, validation service, or workshop implementation has begun.
- The repository is initialized as an unborn Git repository on branch `main`.
- The current non-ignored filesystem state of
  `D:\Dev\tools\general-ts-cpp-adapter` was imported as the executable baseline
  while retaining its root-relative CMake, TypeScript, Qt, test, skill, and
  deployment paths.
- The imported adapter baseline includes the in-progress layout migration, Qt
  GUI, current tests, generated runtime, and replacement `add_numbers`
  numerical Tool. Deleted pre-migration files and deleted demo Tools were not
  resurrected.
- Relevant memory architecture was reconciled into
  `docs/memory-architecture-reference.md`. The memory reference contains no
  production implementation to import.
- Import selection, exclusions, source commit identity, working-tree facts, and
  newline normalization are recorded in `docs/import-provenance.md`.
- `README.md` and the existing root build/package files are the unified entry
  points. Axiom's `AGENTS.md` and this handoff are the only governing root agent
  contract and current-state record.

## Stage 0 baseline and preservation

Adapter source baseline:

- branch `main`;
- HEAD `787d05e2280b7ababc2416d5e815759d3940317d`;
- current authored/non-ignored filesystem state, including uncommitted user
  work;
- 77 files imported, excluding `.git`, builds, dependencies, local config,
  generated overlays, logs, and the conflicting root governance files.

Memory source baseline:

- unborn branch `main`, with zero commits;
- architecture and durable design only; no production code or build system.

Read-only Git status after import matched the status captured beforehand for
both references. Neither reference was cleaned, reset, staged, copied over, or
otherwise modified by the consolidation work.

## Validation actually run

Passed in `D:\Dev\axiom-colab`:

- `pnpm.cmd test`
- TypeScript build regenerated `dist/`.
- All 17 TypeScript tests passed.

Passed against the selected adapter baseline binaries:

- Debug C++ tests: 12/12.
- Release C++ tests: 12/12.
- Release `cpp-tool-bridge.exe --describe-tools` returned protocol `1.0`, all
  four required capabilities, and the imported `add_numbers` descriptor.

Attempted but blocked by the known managed-shell environment:

- `powershell.exe -ExecutionPolicy Bypass -File
  .\proj\scripts\build-and-test.ps1 -SkipHarnessInspection`
- CMake selected Visual Studio 18 2026 but reported an unknown C++ compiler and
  `No CMAKE_CXX_COMPILER could be found`. No C++ compilation ran in the copied
  tree.

Attempted but unavailable in the selected baseline:

- `pnpm.cmd test:integration` rebuilt `dist/`, then failed because
  `tests/integration/bridge.integration.test.ts` does not exist. That file is
  deleted in the selected adapter working tree while the package script still
  references it. It was not silently restored because doing so would reverse
  user-owned baseline work.

The imported adapter therefore behaves no worse than its selected filesystem
baseline. Fresh copied-tree C++ validation remains an environment limitation,
and the stale integration-test entry is a known baseline inconsistency to
resolve explicitly after consolidation.

## Accepted product and trust boundary

The minimum product remains a local IDE-style laboratory where a user supervises
an LLM, scoped typed C++ tools, restart-safe structured memory, independent
validation, hidden challenge tests, exact-hash approval, provenance, recovery,
and goal distillation.

Keep this distinction explicit:

```text
model claim != observed tool result != validated evidence != user approval
```

The adapter and memory service remain complementary. Memory is provider-, UI-,
and adapter-independent; tools receive only short-lived call-scoped memory
sessions through typed C++ dependency injection and trusted host context.

## Exact next work

Begin Stage 1 only:

1. Define versioned identities and envelopes for workspace, goal, session,
   actor, call, tool, object, capability, proposal, approval, evidence, and
   validation records.
2. Separate trusted-host fields from model-controlled fields.
3. Define operation matrices, lifecycle state machines, canonical hashing,
   protocol errors, permissions, audit outputs, and failure behavior.
4. Write contract and adversarial tests before selecting or implementing the
   storage layer.
5. Resolve the stale `test:integration` entry as a small explicit baseline fix,
   without restoring obsolete demo-specific behavior.

Do not begin Stage 2 storage, memory-client integration, adapter redesign, or
tool-workshop implementation until the Stage 1 contracts pass their exit gate.

