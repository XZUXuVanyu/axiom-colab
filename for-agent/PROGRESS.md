# Axiom CoLab Progress Ledger

Entries are chronological. Each entry corresponds to one logical Git commit and
records its exact subject, purpose, material changes, and validation actually
performed.

## 2026-08-30 - feat(gui): revise candidates through the workshop

Purpose: complete the Qt side of exact-parent candidate revision authoring.

Material changes:

- Added the C++ `revise-candidate` client operation and strict result decoder
  that correlates workspace, parent revision/hash, new candidate identity/hash,
  revision number, state, and content hashes.
- Added a selected-current-candidate Qt editor for descriptor and canonical-
  base64 sources, with immediate submitted-source clearing.
- Refreshes authoritative inspection after revision and explicitly states that
  prior validation and proposal bindings are stale.
- Extended the real-process fixture and offscreen Widgets test through source
  submission, immutable revision creation, redacted local state, and refresh.

Validation actually run:

- `pnpm.cmd test`: passed all 86 TypeScript tests.
- Qt 6.12.0/MSVC 19.51 Release built with warnings as errors and all 3 CTest
  targets passed.
- The first Widgets run had 2 passes and 1 failure because the test submitted
  during the post-execution busy refresh; waiting for the action to re-enable
  produced the passing run.
- `git diff --check`: passed with newline-conversion notices only.

## 2026-08-30 - feat(gui): expose immutable candidate revision authoring

Purpose: begin the Stage 8 candidate-authoring path without allowing Qt or the
transport to mutate repository storage directly.

Material changes:

- Added a narrow `revise-candidate` supervisory operation bound to the exact
  current parent revision and candidate hash.
- Delegated revision creation to the existing repository-backed `ToolWorkshop`
  under configured trusted-host identity; the old revision becomes superseded
  atomically and its earlier validation/approval bindings become stale.
- Required strict descriptor objects and non-empty canonical-base64 source
  payloads at the transport boundary.
- Composed the workshop in the production local process and added host and
  transport regression coverage for revision chaining and stale validation.

Validation actually run:

- `pnpm.cmd test`: passed all 86 TypeScript tests.
- `git diff --check`: passed with newline-conversion notices only.

## 2026-08-30 - feat(gui): submit private hidden challenges

Purpose: continue Stage 8 with the user-controlled hidden challenge path in Qt
without moving validation authority or completed private material into widgets.

Material changes:

- Added an exact revision/hash-bound C++ client request and strict redacted
  result decoder for the existing host-owned hidden-challenge operation.
- Added a selected-candidate private JSON editor and submission control that
  clears fixture and command definitions immediately after submission.
- Rendered only observed outcome, promotability, validation/snapshot/record
  hashes, and salted suite commitments; private fixtures and process output
  remain absent from completed widget state.
- Extended the real-process/offscreen Widgets fixture and documentation for the
  private-input lifecycle and authoritative refresh.

Validation actually run:

- `pnpm.cmd test`: passed all 86 TypeScript tests.
- Qt 6.12.0/MSVC 19.51 Release built with warnings as errors and all 3 CTest
  targets passed.
- The first Widgets CTest run had 2 passes and 1 test failure because the test
  clicked rejection during the deliberate post-challenge busy refresh; waiting
  for the action to re-enable produced the passing run.
- `git diff --check`: passed with newline-conversion notices only.

## 2026-08-30 - feat(validation): add supervised hidden challenge validation

Purpose: complete the Stage 8 production validation boundary and expose hidden
user tests without moving validation authority or private evidence into Qt or
public inspection.

Material changes:

- Replaced positional shared-ledger slicing with exact host/coordinator-issued
  call-ID selection.
- Made report creation fail closed unless every expected call has exactly one
  matching successful ledger record for the expected Tool.
- Added regression coverage that injects unrelated ledger activity during both
  supervisory single-Tool execution and coordinated goal execution.
- Added a strict production profile for toolchain identity, WSL distribution,
  non-overlapping staging, executable allowlisting, resource limits, and
  candidate/laboratory-standard commands.
- Added bounded `submit-hidden-challenge` transport and host paths that bind the
  exact current candidate, materialize repository-verified source, persist
  private evidence through an authenticated validator, and expose only redacted
  hashes, commitments, outcomes, and promotability.
- Composed WSL validation and process-owned validator credential revocation,
  updated configuration generation and documentation, and regenerated `dist/`.

Validation actually run:

- `pnpm.cmd test`: passed all 86 TypeScript tests.
- One intermediate run had 85 passes and one assertion failure because a
  deliberate 256-byte framing limit rejected a malformed challenge before
  payload parsing; separating those assertions produced the final pass.
- `pnpm.cmd run test:integration`: passed five portable real-Bridge tests;
  three opt-in WSL confinement tests retained their skip gate.
- The configuration generator produced nested command/resource JSON that
  round-tripped through PowerShell decoding. Its first smoke invocation used an
  unquoted path containing spaces and failed before the corrected invocation.

## 2026-08-29 - feat(gui): extend supervised candidate workflows

Purpose: continue Stage 8 through policy-scoped memory execution, inspectable
candidate evidence, and exact user decisions without moving authority into Qt.

Material changes:

- Composed explicit per-Tool policies and the authenticated loopback service so
  production memory-dependent built-ins receive fresh workspace/call-scoped
  grants with quotas, expiry, and automatic revocation.
- Materialized candidate revisions through repository integrity checks and
  projected descriptor/source manifests, validation hashes, toolchain/policy
  bindings, confinement, and all three public suite/process outcomes while
  rejecting hidden challenge-output disclosure.
- Added Qt candidate evidence inspection and host-computed Tool executability;
  installed candidates remain non-executable.
- Added exact proposal/hash approve/reject commands. The host supplies trusted
  user identity and delegates every decision to the existing proposal service,
  which repeats current-candidate, validation, permission, replay, and workspace
  checks.
- Made the offscreen Widgets CTest select its configured Qt runtime instead of
  an older ambient DLL.

Validation actually run:

- `pnpm.cmd test`: all 85 TypeScript tests passed.
- `pnpm.cmd run test:integration`: all 5 portable real-Bridge cases passed,
  including production supervisory `compute_buffer`; 3 opt-in WSL cases skipped.
- Qt 6.12.0/MSVC 19.51 Release built with warnings as errors and all 3 CTest
  targets passed, including candidate evidence and exact-decision refresh.
- Initial diagnostic runs exposed missing Developer Command Prompt includes and
  then an older ambient Qt DLL (`0xc0000139`); the recorded initialized build and
  configured test runtime produced the passing results above.
- Windows PowerShell parsed the generated-config script successfully.
- `git diff --check` passed with newline-conversion notices only.

## 2026-08-28 - feat(gui): serve supervisory transport process

Purpose: provide the tested shell-free process framing that the Qt client can
consume without direct storage access.

Material changes:

- Added incremental UTF-8 JSON-lines serving with ordered responses and
  separate diagnostics.
- Added bounded line handling that emits one structured failure, discards the
  rest of an oversized frame, and resumes at the next newline.
- Preserved syntactically valid request IDs for rejected parseable requests.
- Added real child-process coverage for multiple requests, JSON-only stdout,
  mutation rejection, oversized input, and frame recovery.

Validation actually run:

- Initial `pnpm.cmd test` stopped at module loading because the new test
  imported internal `ProcessRunner` from the package root, where it is not
  exported. The test was corrected to use `dist/process-runner.js`.
- The next run reached the process assertion: 74 of 75 passed and showed that
  rejected unknown operations lost an otherwise valid request ID.
- After preserving parseable request IDs, `pnpm.cmd test` passed all 75 tests.

## 2026-08-28 - feat(gui): define read-only supervisory transport

Purpose: give Qt a narrow, versioned host-facing read protocol without exposing
databases, paths, or authority-changing operations.

Material changes:

- Added strict JSON requests for workspace listing and exact workspace/goal
  inspection, with request-ID correlation and bounded input size.
- Added structured deterministic error responses for malformed versions,
  identities, fields, operations, backend failures, and oversized input.
- Added concurrency-safe direct host inspection independent of the application
  model's mutable UI selection.
- Explicitly excluded approval, installation, lifecycle, and memory mutations
  from transport version 1.0.

Validation actually run:

- `pnpm.cmd test`: all 73 TypeScript tests passed, including valid listing and
  inspection, malformed/oversized input, unknown mutation requests, extra-field
  rejection, request correlation, and backend error preservation.

## 2026-08-28 - feat(gui): compose local application host

Purpose: establish one tested owner for Stage 8 service startup, verified
discovery, supervisory projection, rollback, and shutdown before Qt wiring.

Material changes:

- Added deterministic workspace enumeration to the memory store.
- Added `LocalApplicationHost`, which initializes Adapter discovery, performs
  trusted installed-Tool rediscovery for every workspace, and exposes one
  supervisory application model.
- Added a capture-only installed registry whose contents are cleared when any
  later workspace fails rediscovery, preventing partial startup exposure.
- Added guarded pre-initialization access, duplicate-state protection, and
  idempotent ownership-ordered shutdown.

Validation actually run:

- `pnpm.cmd test`: all 70 TypeScript tests passed, including successful host
  startup/shutdown and rollback after partial multi-workspace rediscovery.

## 2026-08-28 - feat(gui): persist supervised goal lifecycle

Purpose: provide restart-safe stop, resume, revocation, and recovery state
without creating a second plan or approval authority in the UI layer.

Material changes:

- Added a local SQLite goal lifecycle that binds each registered goal to the
  exact identity and hash of its current approved working-memory plan.
- Persisted active/stopped goal state, scoped active/revoked capabilities, and
  workspace recovery requirements across restart.
- Delegated real stop, resume, capability revocation, and recovery operations
  to host-owned services before committing their supervisory state.
- Rejected cross-workspace actions, replayed transitions, revoked-capability
  replay, and stale approved-plan bindings.

Validation actually run:

- Initial `pnpm.cmd test`: 67 of 68 passed. The new cross-workspace stop test
  expected `GOAL_NOT_ACTIVE`; the service correctly failed earlier with the
  more precise `GOAL_NOT_FOUND`.
- Corrected `pnpm.cmd test`: all 68 TypeScript tests passed.

## 2026-08-28 - feat(gui): compose local supervisory backend

Purpose: project the existing authoritative local services through the Stage 8
application model without letting the UI read storage internals or infer trust.

Material changes:

- Added workspace-scoped repository enumeration methods that retain existing
  integrity checks for candidates, validations, proposals, and installation
  evidence.
- Added `LocalSupervisoryBackend` composition for memory resources, workflow
  audit events, approved plans, candidate state, evidence, decisions, Tools,
  and lifecycle controls.
- Required installed Tool projections to match successful stored installation
  evidence and re-validated their descriptors at the projection boundary.
- Added restart, cross-workspace, and forged-rediscovery coverage.

Validation actually run:

- `pnpm.cmd test`: all 66 TypeScript tests passed.

## 2026-08-28 - feat(gui): begin supervisory application model

Purpose: begin Stage 8 with a UI-independent projection that cannot blur or
replace backend authority.

Material changes:

- Added immutable workspace/goal, plan, Tool, resource, candidate, timeline,
  and recovery-control projections.
- Kept model claims, observations, validation evidence, user decisions, and
  verified installation state explicitly distinct.
- Delegated stop, capability revocation, resume, and recovery to a trusted
  backend and refresh state after each completed command.
- Added fail-closed projection checks against authority laundering and tests
  for immutable snapshots and unavailable actions.
- Documented the boundary and concrete local-backend continuation point.

Validation actually run:

- `pnpm.cmd test`: all 64 TypeScript tests passed.

## 2026-08-28 - docs(agent): record pending WSL reboot

Purpose: preserve the exact environment transition and post-reboot validation
entry point before the user restarts Windows.

Material changes:

- Recorded that the user initiated `wsl --install` and is rebooting.
- Made WSL status, installed-distribution, namespace, cgroup, Bubblewrap,
  network, Windows-drive, and interoperability checks the next actions.
- Preserved that installing WSL alone does not satisfy or prove any validation
  confinement control.

Validation actually run:

- Confirmed the working tree was clean before this documentation-only update.
- No post-install WSL validation ran because Windows has not yet rebooted.

## 2026-08-28 - fix(validation): fail promotion closed without confinement

Purpose: prevent authentic passing process results from being mistaken for
promotion-ready validation when no OS isolation backend actually ran.

Material changes:

- Bound explicit filesystem, descendant-process, network, CPU, and memory
  confinement observations into every validation record.
- Recorded the current direct runner backend as enforcing none of those
  controls and made promotion eligibility require all five.
- Separated restart-safe evidence authenticity from promotion eligibility, so
  exact stored records remain inspectable and verifiable but cannot authorize
  promotion before real confinement exists.
- Rechecked the local Windows environment: Docker, Podman, Windows Sandbox,
  Bubblewrap, and Firejail are absent; `wsl.exe` exists but reports that WSL is
  not installed. A CIM OS query was also denied by the managed environment.

Validation actually run:

- `pnpm.cmd test`: passed all 53 TypeScript tests and regenerated `dist/`.
- Tests prove authentic records survive restart while promotion fails closed,
  changed candidate hashes remain ineligible, and confinement absence is
  explicit in the authoritative record.
- `git diff --check`: passed with newline-conversion notices only.

## 2026-08-28 - fix(validation): salt hidden challenge commitments

Purpose: prevent public validation metadata from enabling offline guesses of
low-entropy hidden challenge inputs.

Material changes:

- Replaced raw challenge-suite definition hashes with per-run salted SHA-256
  commitments while retaining ordinary deterministic suite hashes.
- Generated and validated a fresh cryptographically random 32-byte salt for
  every validation run and kept it only in the private evidence payload.
- Made the authenticated repository rederive the salted commitment from the
  private challenge definition before accepting validator evidence.
- Kept salts, commands, stdin, and outputs absent from public snapshots and
  records while identifying the public commitment scheme explicitly.

Validation actually run:

- `pnpm.cmd test`: passed all 53 TypeScript tests and regenerated `dist/`.
- Tests prove repeated identical challenge definitions have different public
  commitments, an unsalted guessed definition does not match, ordinary suite
  hashes remain stable, and neither records nor inspection disclose the salt.
- `git diff --check`: passed with newline-conversion notices only.

## 2026-08-28 - feat(validation): persist authenticated candidate evidence

Purpose: close the restart-safety gap that prevented exact candidate and
validator evidence from retaining authority across process restarts.

Material changes:

- Added a transactional SQLite candidate repository for immutable
  specifications, descriptors, exact source bytes, revision chains, and
  current/superseded state.
- Made `ToolWorkshop` optionally repository-backed so inspection,
  materialization, history, and further revision continue after restart while
  preserving cross-workspace and stale-parent rejection.
- Added host-issued validator bearer credentials stored only as actor-bound
  digests, plus atomic storage of public snapshots/records and private captured
  sources, fixtures, policy, toolchain, and hidden suite definitions.
- Replaced process-only promotion checks with exact stored-evidence checks when
  the repository is configured; copied exact records survive restart, while
  altered, fabricated, unauthenticated, mismatched, or corrupt evidence fails
  closed.
- Kept private challenge material out of public inspection and retained the
  process-local `WeakSet` behavior only for runners without a repository.

Validation actually run:

- `pnpm.cmd test`: passed all 52 TypeScript tests and regenerated `dist/`.
- Repository tests passed restart, candidate history, byte corruption,
  cross-workspace, wrong-credential, private-binding, validation tampering, and
  restart promotion-eligibility cases.
- An initial new persistence-test run failed because its staged source path did
  not match the existing validation child fixture's expected `src/tool.cpp`;
  the test request was corrected and the complete suite then passed.
- `git diff --check`: passed with newline-conversion notices only.

## 2026-08-28 - feat(workshop): bind immutable candidate revisions

Purpose: begin Stage 7 with the authority-preserving path from a structured
missing-capability specification to exact candidate revisions, without opening
an approval or installation path around the Stage 6 validator.

Material changes:

- Added model/trusted-host-authored structured Tool specifications with copied
  JSON content, host identities, attribution, validation, and canonical hashes.
- Added captured candidate source revisions binding descriptor, ordered raw-byte
  source metadata, specification, stable candidate identity, and the previous
  candidate hash.
- Preserved superseded revisions, rejected stale-parent branching,
  cross-workspace lookup, mismatched descriptors, unsafe paths, and unauthorized
  authors, and exposed copy-on-read materialization for the existing validator.
- Extracted the Stage 6 candidate path/byte capture primitive so workshop and
  validation use one boundary while validation remains the only evidence
  authority.
- Documented that the current repository is process-local and deliberately has
  no approval, installation, registration, or rediscovery operation.

Validation actually run:

- `pnpm.cmd test`: passed all 49 TypeScript tests and regenerated `dist/`.
- `git diff --check`: passed with newline-conversion notices only.

## 2026-08-28 - docs(agent): preserve Stage 7 re-check gate

Purpose: make the next-context transition from the Tool workshop to IDE
implementation conditional on an explicit trust and environment re-check.

Material changes:

- Recorded durable candidate/validation storage and OS confinement as blocking
  Stage 6 gaps rather than implicit future work.
- Preserved potential hidden-test hash disclosure, stale ignored binaries,
  managed-shell compiler access, exact approval binding, immutable revision,
  and UI authority-duplication risks.
- Directed the next context to implement/continue Stage 7, re-check and close
  trust blockers, and only then proceed into Stage 8 IDE implementation.

Validation actually run:

- Confirmed the working tree was clean before this documentation-only update.
- Reviewed the gate against the Stage 6 limitations, Stage 7 exit conditions,
  Stage 8 thin-UI boundary, and the most recent real-Bridge regression result.

## 2026-08-28 - docs(agent): hand off Stage 7 entry point

Purpose: preserve the user's direction to begin the constrained Tool workshop
in a new context without concealing the remaining Stage 6 trust work.

Material changes:

- Made the Stage 7 specification-to-immutable-candidate path the exact next
  entry point.
- Kept durable validation storage and OS confinement visible as blockers for
  promotion, installation, and the Stage 7 exit gate.
- Preserved the existing Stage 6 validator as the only validation authority
  the workshop may consume.

Validation actually run:

- Confirmed the working tree was clean before this documentation-only handoff.
- Reviewed the handoff wording against the gated roadmap and current Stage 6
  limitations.

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
