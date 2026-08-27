# Axiom CoLab Progress Ledger

Entries are chronological. Each entry corresponds to one logical Git commit and
records its exact subject, purpose, material changes, and validation actually
performed.

## 2026-08-27 — chore(project): consolidate Stage 0 baseline

Purpose: establish Axiom CoLab as a self-contained repository without mutating
or silently omitting user work from either reference project.

Material changes:

- Imported the adapter's complete current authored and non-ignored filesystem
  baseline while retaining its behavior-sensitive root paths.
- Preserved the in-progress layout migration, Qt GUI, generated TypeScript
  runtime, current tests, and replacement `add_numbers` Tool.
- Excluded reference Git metadata, builds, dependencies, machine-local config,
  generated overlays, logs, deleted pre-migration paths, and conflicting root
  governance documents.
- Reconciled the memory scaffold's architecture under Axiom CoLab's governing
  contract without importing a nonexistent implementation.
- Added unified project entry documentation and detailed import provenance.
- Initialized the repository on branch `main` and updated the durable handoff
  to make Stage 1 the exact next work.

Validation performed:

- `pnpm.cmd test` rebuilt `dist/` and passed all 17 TypeScript tests.
- Existing selected-baseline Debug and Release C++ test binaries each passed
  12/12 tests.
- Release Bridge discovery returned protocol `1.0`, the four required
  capabilities, and the `add_numbers` descriptor.
- Fresh copied-tree CMake configuration was attempted with the standard build
  script and failed at the known managed-shell MSVC compiler-discovery issue.
- Integration testing was attempted and exposed the inherited stale package
  entry for the deleted `tests/integration/bridge.integration.test.ts`; no
  obsolete test was silently restored.
- Read-only post-import Git status confirmed both reference repositories
  retained their original working-tree states.

## 2026-08-27 — docs(agent): restore minimum laboratory roadmap

Purpose: make the route from the consolidated baseline to the first usable IDE
laboratory durable and practical before Stage 1 begins in a new context.

Material changes:

- Added Stage 0 plus ten ordered implementation stages directly to the current
  handoff.
- Defined concrete work, a user-visible practical result, and a testable exit
  gate for every stage.
- Tied the roadmap to the minimum launch loop: supervised goal, typed Tool use,
  structured memory, independent candidate validation, hidden user tests,
  exact-hash approval, GUI operation, restart recovery, and goal distillation.
- Corrected the handoff's repository state to reference the saved Stage 0 root
  commit.

Validation performed:

- Reviewed the roadmap against the authority, memory, adapter, validation,
  workshop, IDE, recovery, and packaging boundaries in `AGENTS.md`.
- Confirmed Stage 1 remains the exact next work and later implementation stages
  remain gated.

