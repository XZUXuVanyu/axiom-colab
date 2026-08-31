# Release and migration policy

The adapter uses semantic versions. Before 1.0, minor releases may change C++
authoring APIs or configuration, but migration notes are required. Patch
releases preserve the Bridge protocol, public Tool names, configuration keys,
and descriptor meaning. After 1.0, incompatible changes require a major
version. Additive Bridge capabilities remain compatible within protocol 1.0.

## Release checklist

1. Run `pnpm install --frozen-lockfile` and `pnpm test`.
2. Run `proj/scripts/build-and-test.ps1` for Debug, Release, and real-Bridge tests.
3. Inspect the target Harness checkout and complete one real model Tool call;
   verify the exported session and invocation ledger.
4. Confirm `dist/` matches `source/ts/`, the compatibility matrix is current, and no
   local configuration, build output, logs, or secrets are tracked.
5. Update the package and CMake versions together, add migration notes below,
   and refresh `for-agent/HANDOFF.md` and `for-agent/PROGRESS.md`.
6. Tag only a clean commit whose CI checks pass.
7. Stop the supervisory host, create and verify an offline state archive using
   `proj/scripts/state-archive.mjs`, restore it to a new root, and inspect the
   restored workspaces through the production supervisory boundary.

## Migration notes

### 0.1.0

Initial protocol 1.0 baseline. C++ descriptors are authoritative. Runtime
configuration moved to layered `proj/config/adapter.defaults.json` plus ignored
`proj/config/adapter.local.json`; generated Harness overlays replace hand-edited
absolute paths. Call verification uses `getInvocationLedger(ctx).verify(...)`.

`tool-only` proves only ledger policy. Harness rc.5 does not expose a pre-commit
no-prose enforcement seam, so prose claims and fabricated prose results must be
checked in the exported session. A mismatched Bridge response call ID is
rejected and never counts as a successful ledger call.
