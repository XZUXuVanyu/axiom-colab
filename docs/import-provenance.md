# Stage 0 import provenance

Import date: 2026-08-27

## Adapter baseline

Source repository: `D:\Dev\tools\general-ts-cpp-adapter`

- Branch: `main`
- HEAD: `787d05e2280b7ababc2416d5e815759d3940317d`
- Baseline choice: the complete current non-ignored filesystem state, not HEAD
  alone.
- Reason: the working tree contains the accepted layout migration, Qt GUI,
  validation changes, and replacement `numerical_calc_tool`; importing HEAD
  would silently omit user work.
- Mapping: current adapter runtime, build, test, documentation, skill, CI, and
  historical files retain their paths at the Axiom CoLab repository root so
  existing relative paths and entry points continue to work.
- Governance exception: the adapter's `AGENTS.md`, `README.md`, and `for-agent/`
  files were not placed at the root because Axiom CoLab owns those sources of
  truth. Their state was inspected before import and is summarized in the Axiom
  handoff and this record.

The import included 77 authored or versioned files reported by
`git ls-files --cached --others --exclude-standard` and present in the source
filesystem. Deleted pre-migration paths were not resurrected.

Excluded adapter products and machine-local state:

- `.git/`
- `build/`
- `node_modules/`
- `proj/config/adapter.local.json`
- `proj/patches/generated/`
- `*.log`

The source had no local configuration file. It did contain an ignored generated
Harness overlay and build/dependency trees; those are reproducible or
machine-specific and were not imported.

The source working-tree status was captured before import. It consisted of the
layout migration from `config/`, `cpp/`, `scripts/`, and `src/` into `proj/` and
`source/`; modified root/build/test/docs/generated-runtime files; the new Qt GUI;
and the new numerical tool. No cleanup, reset, staging, or write was performed
in the source repository.

All imported text is content-equivalent to the selected baseline. The patch
writer added a terminal newline to 16 source files that lacked one (the two
numerical-tool files, one archived design answer, and generated `dist/*.js`).
The remaining 61 imported files matched their source SHA-256 byte-for-byte
before validation. TypeScript regeneration may rewrite generated `dist/` in its
normal canonical form.

## Memory architecture baseline

Source repository: `D:\Dev\tools\general-agent-memory`

- Branch: unborn `main`; no commits exist.
- Baseline choice: architecture reference only.
- Reason: the repository contains contracts and scaffolding but no production
  implementation or build system.
- Mapping: the reconciled authority and storage outline is retained in
  `docs/memory-architecture-reference.md`; Axiom CoLab's `AGENTS.md` and handoff
  remain authoritative.

No file from either reference repository was modified during the import.

