# Axiom CoLab Progress Ledger

Entries are chronological. Each entry corresponds to one logical Git commit and
records its exact subject, purpose, material changes, and validation actually
performed.

## 2026-08-28 - test(project): reverify scoped memory and built-ins

Purpose: confirm the Stage 3 through Stage 5 execution path remains sound
before Stage 6 begins depending on its storage and authority boundaries.

Material changes:

- Rebuilt the ignored Release Bridge after detecting that its prior binary
  predated the Stage 5 built-ins.
- Reverified the C++ suite and real process-per-call memory/built-in integration
  path without changing production source.

Validation actually run:

- Release `ctest`: passed 1/1 C++ test executable.
- `pnpm.cmd run test:integration`: passed all 4 real-Bridge tests.

## 2026-08-28 - feat(validation): start independent candidate runner

Purpose: begin Stage 6 with an exact candidate/evidence binding and a trusted
observed-process verdict path before adding platform sandbox backends.

Material changes:

- Added content-addressed candidate snapshots that capture source and fixture
  bytes before execution and bind descriptor, toolchain, policy, and the three
  independent suite definitions.
- Added a shell-free executable-allowlisted runner with command-count, timeout,
  stdin, stdout, and stderr limits plus attributed process results.
- Hid user challenge commands, inputs, and output by default while retaining
  exact definition and output hashes.
- Rejected candidate-authored passing JSON, copied validation records, changed
  candidate hashes, and canonical path escapes as sources of promotion
  eligibility.
- Documented that durable validation storage and OS-enforced filesystem,
  descendant-process, network, CPU, and memory confinement remain pending.

Validation actually run:

- `pnpm.cmd test`: passed all 46 TypeScript tests and regenerated `dist/`.
- `git diff --check`: passed with newline-conversion notices only.

## 2026-08-28 — feat(goal): complete built-in Tool and supervised goal loop

Purpose: complete Stage 5 with useful production C++ Tools and an inspectable,
authority-preserving backend path from an approved plan to deterministic calls
and immutable results.

Material changes:

- Classified production built-ins versus the test-only fixture Bridge and added
  a compute-memory Tool plus an immutable artifact-copy derivation Tool without
  per-Tool TypeScript behavior.
- Added a provider-independent goal coordinator that rechecks committed plan
  identity/hash, records real ledger calls and observations, and seals a report
  artifact.
- Added unit and real production-Bridge integration coverage for forged plans,
  explicit Tool policy, shared compute state, artifact lineage, and missing
  memory authority.

Validation actually run:

- `pnpm.cmd test`: passed all 42 TypeScript tests and regenerated `dist/`.
- A Visual Studio 2026 Developer Command Prompt built the existing Ninja C++
  tree with warnings as errors; `ctest` passed.
- Production Bridge discovery returned all three built-ins; a policy-free
  `compute_buffer` call returned `MEMORY_SESSION_REQUIRED`.
- `pnpm.cmd run test:integration` passed all 4 real-Bridge tests using the
  freshly built production and fixture Bridges.

## 2026-08-27 — test(adapter): prove scoped memory process integration

Purpose: close the Stage 4 exit gate with real Bridge processes using the
authenticated loopback service and persistent shared workspace state.

Material changes:

- Added a test-only memory-dependent C++ Tool and Bridge target, leaving the
  production Tool registry unchanged.
- Added real process integration coverage for shared compute state across
  calls, post-call revocation, non-loopback rejection, cross-workspace denial,
  expiry, cancellation, and timeout.
- Restored an intentional `test:integration` command and wired Debug/Release
  integration execution into the standard build script.
- Made HTTP server shutdown close active connections so killed Bridge requests
  cannot delay deterministic test and host teardown.

Validation actually run:

- Fresh MSVC 19.51 Ninja build with warnings as errors passed, including the
  test Bridge target; `ctest` passed.
- `pnpm.cmd test` passed all 41 TypeScript tests and regenerated `dist/`.
- `pnpm.cmd run test:integration` passed all 3 real-Bridge tests.
- The production Bridge still discovered only `add_numbers`, and its real
  memory-free invocation returned `5` for `2 + 3`.
- `git diff --check` passed with newline-conversion notices only.

## 2026-08-27 — feat(adapter): connect scoped Bridge memory transport

Purpose: continue Stage 4 through the real host-issued grant and C++ loopback
transport lifecycle while preserving the process-per-call boundary.

Material changes:

- Added a numeric-loopback-only portable C++ HTTP transport and complete trusted
  grant parser as the default Bridge memory-session factory.
- Added a host `MemorySessionProvider` that creates grants from explicit Tool
  policy and made `AdapterService` revoke sessions on every completion path.
- Added provider/revocation and cancellation cleanup coverage, fixed two latent
  warnings/errors in the previously uncompiled C++ Stage 4 tests, and updated
  the runtime/architecture handoff.

Validation actually run:

- `pnpm.cmd test`: passed all 41 TypeScript tests and regenerated `dist/`.
- A manually initialized Visual Studio 2026 Developer Command Prompt configured
  a fresh Ninja tree, compiled with warnings as errors, and passed the C++ test.
- The standard build script was also attempted first and remained blocked by
  its managed-shell `No CMAKE_CXX_COMPILER could be found` environment issue.
- `git diff --check`: passed with newline-conversion notices only.

## 2026-08-27 — feat(adapter): add scoped memory service integration

Purpose: continue Stage 4 with genuine per-call memory DI and a persistent,
independently authorized service endpoint for process-per-call Bridge workers.

Material changes:

- Added bearer-token digest authentication, revocation, Tool version/session
  generation binding, byte/operation quotas, and repeated capability checks.
- Dispatches the scoped C++ operation set into the persistent Stage 3 workflows.
- Added a bounded loopback-only HTTP JSON endpoint with structured failures.
- Added a typed host-to-Bridge envelope that distinguishes public Tool name
  from logical Tool identity and cannot be replaced through model arguments.
- Added child DI scopes with transitive per-call lifetime for components that
  declare `MemoryClient`, deterministic missing-session rejection, and the
  unchanged singleton path for memory-free Tools.

Validation actually run:

- `pnpm.cmd test`: passed all 39 TypeScript tests and regenerated `dist/`.
- `git diff --check`: passed with newline-conversion notices only.
- Service tests cover shared state, forged tokens, cross-workspace access,
  changed Tool versions, stale generations, disallowed operations, request and
  operation quotas, revocation, expiry, and the real loopback HTTP route.
- C++ coverage was added for per-call construction and missing-session
  rejection. Fresh configuration through
  `proj/scripts/build-and-test.ps1 -SkipHarnessInspection` remained blocked by
  `No CMAKE_CXX_COMPILER could be found`; no C++ pass is claimed.

## 2026-08-27 — feat(adapter): start scoped C++ memory client boundary

Purpose: begin Stage 4 with the typed, authority-preserving C++ boundary before
adding a persistent transport or changing Tool invocation behavior.

Material changes:

- Added an optional `MemoryClient` session abstraction and host-owned
  `MemoryTransport` interface with no physical paths, credentials, or pointers.
- Bound grants to workspace, actor, Tool identity/version, call ID, session
  generation, operation set, lifetime, operation quota, and request-byte quota.
- Added C++ adversarial coverage for cross-workspace, forged-call, stale, and
  expired grants while leaving memory-free Tools and requests unchanged.
- Documented that both transport and per-call dependency injection remain the
  next Stage 4 increment.

Validation actually run:

- `pnpm.cmd test`: passed all 34 TypeScript tests and regenerated `dist/`.
- `git diff --check`: passed with newline-conversion notices only.
- Fresh C++ configuration was attempted through
  `proj/scripts/build-and-test.ps1 -SkipHarnessInspection` and remained blocked
  by the managed shell's known `No CMAKE_CXX_COMPILER could be found` issue.
  No C++ compilation or C++ test pass is claimed for this increment.

## 2026-08-27 — feat(memory): implement semantic memory workflows

Purpose: complete Stage 3 with authority-separated compute, working, and
artifact workflows over the restart-safe Stage 2 payload store.

Material changes:

- Added bounded compute create/read/update/snapshot/release with aggregate and
  per-object byte quotas, object quotas, revisions, disposable release, and
  restart-safe semantic metadata.
- Added working-memory proposal, exact-hash user approval, rejection,
  supersession, stale-base protection, latest-state reads, and immutable
  revision history.
- Added trusted immutable artifact creation and derivation with payload and
  schema hashes, parent lineage, provenance, and same-workspace enforcement.
- Extended the operation contract for compute snapshots, working
  supersession, and root artifact creation, and emitted canonical audit events
  for successful and rejected workflow operations.
- Added adversarial workflow coverage and regenerated `dist/`.

Validation actually run:

- `pnpm.cmd test`: passed all 34 TypeScript tests.
- `git diff --check`: passed with newline-conversion notices only.
- `pnpm.cmd exec tsc --noEmit`: unavailable because the baseline has no local
  `tsc` executable; no static type-check pass is claimed.

## 2026-08-27 — feat(store): add restart-safe local memory foundation

Purpose: complete Stage 2 with a durable storage core without implementing
Stage 3 semantic memory workflows.

Material changes:

- Selected built-in Node 24 SQLite with numbered transactional migrations and
  SHA-256-addressed immutable payload files.
- Added workspace creation/reopen, strict isolation, quotas, expiry, recovery,
  corruption detection, safe inspection, and resource reporting.
- Added adversarial restart, interrupted-promotion, corruption, quota, expiry,
  malformed-identity, and cross-workspace tests and regenerated `dist/`.

Validation actually run:

- `pnpm.cmd test`: passed all 29 TypeScript tests.
- `pnpm.cmd exec tsc --noEmit`: unavailable because the baseline has no local
  `tsc` executable; no static type-check pass is claimed.

## 2026-08-27 — feat(contract): complete laboratory authority contract

Purpose: complete the Stage 1 exit gate and freeze the provider-independent
authority vocabulary before any storage implementation begins.

Material changes:

- Added generic envelopes for every laboratory identity kind, explicitly
  binding workspace, revision, lifecycle, creator, authority, and payload.
- Added the normative operation matrix with actor authority, required target,
  authoritative output, and mandatory audit behavior for all planned memory,
  validation, and approval operations.
- Added lifecycle rules with replay and terminal-state rejection, trusted
  authority checks, and canonical input-hash audit events.
- Documented canonical serialization, authority separation, capabilities,
  exact-hash approval, lifecycle, deterministic failures, audit attribution,
  and the Stage 2 boundary in `docs/laboratory-contract.md`.
- Added adversarial tests for forged authority, validation/self-approval,
  illegal and replayed transitions, identity-kind mismatch, and audit binding.

Validation performed:

- `pnpm.cmd test` rebuilt `dist/` and passed all 24 TypeScript tests.
- `git diff --check` passed with newline-conversion notices only.

## 2026-08-27 — feat(contract): integrate Stage 1 contract foundation

Purpose: save the initial Stage 1 authority-boundary work as an integrated,
testable checkpoint without claiming that the Stage 1 exit gate is complete.

Material changes:

- Added provider-independent contract identities, operations, trusted context,
  scoped capability grants, canonical JSON/SHA-256 hashing, deterministic
  authorization errors, and exact approval binding.
- Added adversarial tests for hash stability, unauthorized operations, expiry,
  call replay, cross-workspace access, and stale approval content.
- Exported the contract module and included all TypeScript contract tests in the
  default test commands.
- Removed the stale integration script that referenced a deleted test rather
  than resurrecting obsolete demo behavior.

Validation performed:

- `pnpm.cmd test` rebuilt `dist/` and passed all 20 TypeScript tests, including
  the three Stage 1 contract/adversarial tests.
- `git diff --check` passed; Git emitted only working-tree newline-conversion
  notices and no whitespace errors.

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
