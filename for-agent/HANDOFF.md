# Axiom CoLab Current Handoff

Last updated: 2026-08-28

## Current state

- WSL 2 is installed (`2.7.12.0`, kernel `6.18.33.2`, default version 2) with
  a usable `Ubuntu-24.04` distribution. Its registered base and `ext4.vhdx`
  were moved through `wsl.exe --manage --move` from the user profile on `C:`
  to `D:\Software\Wsl`; the old tree contains no VHDX.
- Ubuntu identifies as 24.04.4 LTS, boots with systemd, exposes cgroup v2 and
  PID/mount namespaces, automounts `D:` at `/mnt/d`, and provides `unshare`.
  Bubblewrap 0.9.0 is installed. The real WSL integration suite proves staged-
  filesystem isolation, network denial, descendant cleanup, memory exhaustion
  termination, and CPU exhaustion termination.
- `WslValidationBackend` is the explicit enforcing validator backend for this
  Windows platform. Bubblewrap supplies isolated user/mount/PID/network/IPC/UTS
  namespaces and a minimal filesystem; systemd and `prlimit` enforce policy-
  bound runtime, memory, CPU, task, process, and descendant limits. The direct
  backend remains available but records every confinement class false.
- Stage 7 is complete. `ToolInstallationService` consumes one exact stored user
  approval only under trusted-host authority, repeats all live candidate,
  specification, permission, proposal, approval, and promotable-validation
  checks, and atomically claims the approval before touching installed state.
- Candidate descriptor and source bytes are verified in an installation-owned
  staging directory and atomically promoted into workspace-scoped,
  content-addressed version locations. Append-only success or failure evidence
  binds the exact candidate and authority transition; replay, cross-workspace
  access, stale candidates, staging/final path collision, partial work, and
  registration failure remain non-discoverable.
- Restart rediscovery reads only successful installation evidence, re-verifies
  the repository bindings and exact installed bytes, and supplies a host-owned
  registry with the exact candidate and installation-evidence hashes. Corrupt
  bytes stop exposure, and batch registration rolls back through registry
  disposers when available.
- Stage 7 began with `source/ts/tool-workshop.ts`. Model or trusted-host
  authority can define copied, canonical-hash-bound structured Tool
  specifications and create captured candidate revisions whose descriptor,
  ordered source bytes, specification, stable candidate identity, and prior
  candidate hash are bound exactly.
- Only a current candidate revision can be revised. Superseded revisions remain
  inspectable and materializable, stale-parent branching and cross-workspace
  lookup fail closed, and materialization returns fresh copies for the existing
  Stage 6 validator to recapture. Workshop code cannot issue validation,
  approval, installation, registration, or rediscovery authority.
- `ToolInstallationProposalService` now binds the exact current candidate,
  specification, authentic promotable validation snapshot/record, requested
  permissions, proposal author/identity/time, and canonical proposal hash.
  Only trusted user context can approve or reject; approval rechecks all live
  bindings and atomically persists a separately hashed approval record.
- Installation proposals, approvals, claims, and immutable installation
  evidence survive repository restart. Model
  authority, cross-workspace lookup, replay, superseded candidates, altered
  validation or permissions, and stale proposal hashes fail closed.
- `LocalCandidateRepository` now provides transactional, restart-safe storage
  for specifications, exact candidate descriptor/source payloads, revision
  chains, and current/superseded state. Repository-backed workshops reopen,
  inspect, materialize, and revise candidates without losing their bindings.
- The repository issues validator bearer credentials, persists only their
  actor-bound digests, and atomically stores public snapshots/records beside
  private captured source, fixture, policy, toolchain, and hidden-suite
  material. Exact records remain authentic after restart; altered,
  unauthenticated, mismatched, corrupt, or cross-workspace evidence fails
  closed. Private challenge material is not returned by inspection.
- Stage 6 has started with `source/ts/candidate-validation.ts`. It captures
  caller-owned bytes and command definitions before execution, produces an
  exact content-bound candidate snapshot, and runs candidate, standard, and
  hidden challenge suites through a shell-free executable allowlist.
- Validation outcomes now derive only from observed process status. Records
  bind exit/signal/error, elapsed time, output sizes and hashes, exact policy,
  toolchain, descriptor, sources, fixtures, and suite definitions. Candidate
  JSON claiming success cannot override a non-zero exit.
- Challenge command details, stdin, and output remain hidden from public
  snapshots and records. Challenge definition hashes are now fresh per-run
  salted commitments; the salt stays in authenticated private evidence, so
  low-entropy inputs cannot be guessed from the public commitment. The
  in-process runner refuses promotion eligibility for copied or fabricated
  record-shaped JSON and for a changed candidate snapshot hash.
- The Stage 6 confinement gate is closed for the explicitly composed WSL2
  backend. Its real integration tests adversarially exercise all five required
  classes; it will not accept relative Linux executables, unsafe working
  directories, non-drive staging roots, or policies without hashed resource
  limits.
- Validation records now bind explicit observations for all five confinement
  classes. The current direct runner records every class as unenforced, and
  promotion eligibility fails closed even for an authentic passing record.
  Restart-safe evidence authenticity is deliberately separate from promotion.
- Stage 5 is complete. Production discovery now exposes the pure
  `add_numbers`, scoped `compute_buffer`, and trusted immutable
  `derive_artifact` C++ built-ins. The memory-only test Tool remains linked
  exclusively into its fixture Bridge.
- `GoalCoordinator` verifies that its plan is a current committed
  working-memory revision, executes actual Adapter calls, and seals an
  immutable session report binding the plan revision/hash, ledger records,
  observations, and resulting artifact identities.
- Real production-Bridge integration proves compute sharing and artifact
  derivation through explicit host Tool policies. Invoking a memory-dependent
  built-in without policy fails with `MEMORY_SESSION_REQUIRED`; declaring
  `MemoryClient` never grants authority.
- Stage 4 is complete. The default Bridge parses the complete trusted
  grant into `MemoryClient` and forwards operations through a portable,
  numeric-loopback-only HTTP transport to the authenticated memory service.
- `MemorySessionProvider` issues a fresh grant from explicit Tool policy and
  revokes it from `AdapterService`'s `finally` path after success, failure,
  cancellation, or timeout. Tools without policy remain envelope-free.
- The Bridge validates Tool/call binding before using a host
  `MemorySessionFactory`. DI propagates per-call lifetime through dependencies,
  constructs only the invoked Tool's scoped graph, injects `MemoryClient`, and
  leaves memory-free Tools on the unchanged singleton path.
- TypeScript coverage proves host context cannot be replaced by a forged value
  inside Tool arguments and cancellation revokes a call-scoped session. The C++
  DI tests and new transport compile with MSVC 19.51 and pass in a manually
  initialized Developer Command Prompt. A dedicated test-only C++ Tool and
  Bridge now prove shared state across worker processes, post-call revocation,
  expiry and cross-workspace denial, numeric-loopback enforcement,
  cancellation, and timeout through the real HTTP route.
- `AuthenticatedMemoryService` now owns issued bearer-token digests, revocation,
  expiry, Tool version/session generation binding, operation and byte quotas,
  and dispatch into the persistent Stage 3 workflows. It repeats authorization
  at the service boundary. `AuthenticatedMemoryHttpServer` exposes this only on
  loopback through one bounded JSON POST route. Tests prove shared state across
  calls plus authentication, cross-workspace, stale, changed-version,
  disallowed-operation, quota, revocation, and expiry failures.
- Stage 3 is complete. `source/ts/memory-workflows.ts`
  adds capability- and authority-checked compute, working, and artifact
  workflows over the Stage 2 store, with transactional semantic metadata and
  canonical audit events. The generated runtime and 42-test suite are current.
- Compute memory now has aggregate byte, per-object byte, and object quotas,
  revisioned updates, immutable snapshots, release, and restart behavior.
  Working memory has exact-hash user approval, rejection, supersession, stale
  base protection, and immutable history. Artifacts have trusted creation and
  derivation, immutable bytes and schemas, lineage, hashes, and provenance.
- Stage 2 is complete. `source/ts/local-memory-store.ts` provides the local
  transactional SQLite and immutable SHA-256 payload foundation with workspace
  creation/reopen, isolation, quotas, expiry, recovery, corruption detection,
  safe inspection, and resource reporting.
- Storage adversarial coverage exercises restart, interrupted promotion and
  orphan cleanup, corruption, quotas, expiry, malformed identities, and
  cross-workspace access. All 29 current TypeScript tests pass.
- Stage 1 is complete. The versioned laboratory contract now defines identities,
  envelopes, trusted authority, capabilities, canonical hashing, exact approval
  binding, operation rules, lifecycle transitions, deterministic errors, and
  mandatory audit outputs, with adversarial executable coverage.
- Stage 0 consolidation is complete. The scoped adapter/memory integration,
  initial validation runner, and initial workshop contract now build on that
  imported baseline as described above.
- The repository is on branch `main`; Stage 0 is saved in root commit
  `1e6a216` (`chore(project): consolidate Stage 0 baseline`).
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

- Trusted installation `pnpm.cmd test`: all 61 TypeScript tests passed,
  including exact approval consumption, restart rediscovery, installed-byte
  corruption rejection, trusted-host authority, cross-workspace denial,
  replay denial, registration cleanup, staging/final collision safety, and
  post-approval candidate invalidation.
- Trusted installation `git diff --check`: passed with newline-conversion
  notices only. A separate TypeScript compiler check was unavailable because
  this repository does not install the `tsc` executable; the project build and
  runtime test loader completed successfully.
- Installation proposal `pnpm.cmd test`: all 56 TypeScript tests passed,
  including restart-safe proposal/approval persistence, exact candidate,
  validation and permission binding, trusted-user authority, cross-workspace
  denial, replay denial, and candidate-revision invalidation.
- WSL confinement `pnpm.cmd test`: all 55 TypeScript tests passed, including
  fail-closed direct execution, required resource policy, local-drive path
  projection, and shell-free WSL argument construction.
- Real WSL confinement integration with
  `AXIOM_TEST_WSL_CONFINEMENT=1`: all 3 tests passed. A promotable passing run
  could not see `/mnt/c`, could not reach an external IP socket, and killed a
  delayed descendant before the next suite. Separate runs terminated a 256 MiB
  allocation under a 64 MiB policy and a busy CPU loop within its 1.5-second
  runtime policy.
- `pnpm.cmd run test:integration`: all 4 existing Bridge/built-in integration
  tests passed; the 3 WSL cases skipped by design because the opt-in environment
  flag was absent from this portable entry point.
- Post-install WSL health and relocation checks passed. `Ubuntu-24.04`
  launched as Ubuntu 24.04.4 LTS on the WSL2 kernel with systemd, cgroup v2,
  PID/mount namespaces, `/mnt/d`, and `/usr/bin/unshare`. WSL's supported move
  operation relocated the registered base to `D:\Software\Wsl`, where
  `ext4.vhdx` exists and remained bootable; no `.vhdx` remains beneath the old
  `C:\Users\27846\AppData\Local\wsl` tree. Bubblewrap was not present.
- Confinement fail-closed `pnpm.cmd test`: all 53 TypeScript tests passed;
  authentic passing records survive restart but remain non-promotable while
  required confinement observations are false.
- Confinement environment re-check found no Docker, Podman, Windows Sandbox,
  Bubblewrap, or Firejail executable. `wsl.exe` exists but reports WSL is not
  installed. The managed shell denied a CIM OS query.
- Confinement fail-closed `git diff --check`: passed with newline-conversion
  notices only.
- Salted challenge commitment `pnpm.cmd test`: all 53 TypeScript tests passed,
  including fresh commitment variance, unsalted-guess rejection, stable public
  suite hashes, private salt binding, and salt redaction.
- Salted challenge commitment `git diff --check`: passed with
  newline-conversion notices only.
- Durable candidate/evidence `pnpm.cmd test`: all 52 TypeScript tests passed,
  including restart-safe candidate history and bytes, authenticated validator
  persistence, exact-record restart eligibility, private evidence binding,
  cross-workspace denial, and candidate/validation corruption rejection.
- The initial new persistence-test run failed because its source path did not
  match the existing validation fixture's expected `src/tool.cpp`; correcting
  the staged path produced the passing complete run above.
- Durable candidate/evidence `git diff --check`: passed with
  newline-conversion notices only.
- Stage 7 initial `pnpm.cmd test`: all 49 TypeScript tests passed, including
  caller-mutation capture, candidate hash chaining, preserved superseded
  revisions, stale-parent rejection, cross-workspace isolation, descriptor
  binding, path rejection, and author-authority checks.
- Stage 7 `git diff --check`: passed with newline-conversion notices only.
- Post-Stage 6 regression check rebuilt the previously stale ignored
  `build/windows/Release` Bridge, passed Release `ctest`, and passed all 4 real
  process integration tests covering scoped sharing, revocation,
  cross-workspace denial, expiry, cancellation, timeout, compute memory, and
  artifact derivation.
- Stage 6 initial `pnpm.cmd test`: all 46 TypeScript tests passed, including
  exact snapshot binding, hidden challenge redaction, fabricated passing JSON,
  changed-candidate promotion denial, and timeout attribution.
- Stage 5 `pnpm.cmd test`: all 42 TypeScript tests passed.
- Stage 5 C++ build in the existing Ninja tree after initializing the Visual
  Studio 2026 Developer Command Prompt; `ctest` passed.
- Production Bridge discovery returned `add_numbers`, `compute_buffer`, and
  `derive_artifact`; a memory-dependent call without host policy failed with
  `MEMORY_SESSION_REQUIRED`.
- Stage 5 `pnpm.cmd run test:integration`: all 4 process integration tests
  passed against the freshly built production and fixture Bridges.
- `pnpm.cmd test`
- TypeScript build regenerated `dist/`.
- All 17 TypeScript tests passed.

Passed against the selected adapter baseline binaries:

- Debug C++ tests: 12/12.
- Release C++ tests: 12/12.
- Release `cpp-tool-bridge.exe --describe-tools` returned protocol `1.0`, all
  four required capabilities, and the imported `add_numbers` descriptor.

Attempted but blocked by the known managed-shell environment:

- Post-reboot `wsl.exe --status` and `wsl.exe --version` confirmed WSL
  `2.7.12.0`, kernel `6.18.33.2`, and default version 2. Distribution
  enumeration required execution outside the managed filesystem sandbox and
  then confirmed that no distributions are installed.
- `wsl.exe --list --online` succeeded and listed `Ubuntu-24.04`. The first
  `wsl.exe --install Ubuntu-24.04 --no-launch` attempt failed while downloading
  with `Wsl/InstallDistro/0x80072f78` (invalid or unrecognized server
  response). A retry through `--web-download` also exited without registering
  a distribution. No namespace, cgroup, Bubblewrap, network-isolation,
  automount, or interoperability claim was inferred from the WSL platform
  install alone.
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

## Roadmap to the first usable IDE laboratory

The delivery plan consists of the completed consolidation stage plus ten
implementation stages. Each stage must leave a testable vertical increment and
must meet its exit gate before work begins on the next stage. The order exists
to establish authority and evidence boundaries before storage, integration,
automation, or UI can accidentally make untrusted state look authoritative.

### Stage 0 - Safely consolidate the project (complete)

Import the current adapter filesystem baseline without altering either
reference repository. Preserve user-owned uncommitted work, path-sensitive
behavior, provenance, validation history, and the memory architecture while
establishing one Axiom CoLab repository and one governing handoff.

Exit gate: both references remain untouched; no authored baseline work is
silently omitted; imported TypeScript behavior passes; available C++ baseline
tests pass; exclusions, limitations, and provenance are inspectable.

### Stage 1 - Freeze the common laboratory contract

Define versioned, provider-independent identities and envelopes for workspaces,
goals, sessions, actors, calls, tools, objects, capabilities, proposals,
approvals, evidence, and validation records. Specify canonical serialization
and hashing, trusted-host versus model-controlled fields, permissions,
operation matrices, lifecycle transitions, error codes, audit events, and
failure behavior. Add contract and adversarial tests before storage code.

Practical result: every later service and UI view shares one vocabulary, and a
model-authored value cannot masquerade as host context, validation, or user
approval.

Exit gate: every planned operation identifies its actor, required capability,
input contract, legal state transition, authoritative output, audit record, and
deterministic failures; contract tests cover forgery, replay, stale identities,
cross-workspace use, and canonical-hash stability.

### Stage 2 - Build the restart-safe local memory foundation

Implement a provider- and UI-independent local memory service using SQLite
transactions for authoritative metadata and immutable content-addressed files
for payloads. Add workspace isolation, staging and atomic commit, SHA-256
identity, quotas, expiry, startup recovery, corruption detection, safe
inspection, and resource reporting.

Practical result: the IDE can create and reopen isolated workspaces, and a
crash or partial write cannot promote invalid state.

Exit gate: restart and fault-injection tests prove that partial writes never
appear valid, corrupted state is reported, quotas are enforced, and one
workspace cannot inspect or mutate another.

### Stage 3 - Implement the three memory workflows (complete)

Implement compute memory create/read/bounded-update/snapshot/release; working
memory read/propose/approve/reject/supersede with revision history; and trusted
artifact creation/derivation with immutable payloads, schemas, hashes, lineage,
and provenance. Keep semantic authority independent of RAM or disk placement.

Practical result: a supervised goal can use disposable scratch state, reviewed
plans and decisions, and sealed deterministic results without confusing their
authority levels.

Exit gate: tests prove compute state is bounded and disposable, working changes
cannot commit without valid approval, artifacts cannot be rewritten by the
model, and no memory class weakens another class's rules.

### Stage 4 - Integrate scoped memory with the C++ adapter (complete)

Add a small typed C++ `MemoryClient` and use the adapter's dependency injection
to provide a short-lived, call-scoped memory session. Keep trusted invocation
context separate from model-authored Tool arguments and correlate workspace,
actor, Tool version, call ID, permissions, quotas, operations, and evidence.
Retain process-per-call isolation and support Tools that do not use memory.

Practical result: separate Bridge processes can cooperate through one logical
workspace without receiving paths, credentials, raw pointers, or ambient
workspace access.

Exit gate: valid calls share scoped state; expired, forged, stale, and
cross-workspace grants fail; cancellation and timeout remain intact; ordinary
memory-free Tools still work unchanged.

### Stage 5 - Establish useful built-in Tools and a goal loop (complete)

Organize the imported public/example Tools into trusted built-ins or fixtures
without adding per-Tool TypeScript behavior. Supply at least one pure Tool, one
compute-memory Tool, and one trusted immutable artifact-derivation Tool. Add a
minimal goal/session coordinator that records an approved plan, actual calls,
observations, and resulting artifacts.

Practical result: the backend can execute a small supervised research task from
goal through inspectable deterministic result using existing capabilities.

Exit gate: ordinary Tool authoring remains C++-first; memory is an optional
typed dependency; the complete call and artifact trail is inspectable; a Tool
cannot gain authority merely by requesting a dependency.

### Stage 6 - Implement independent candidate validation

Create a trusted runner that snapshots a candidate and binds its exact hash,
descriptor, source, toolchain, policy, fixtures, test suites, observed process
results, diagnostics, and resource use into an immutable validation record.
Run candidate-authored tests, laboratory standard safety tests, and separately
stored user challenge tests under filesystem, process, time, memory, dependency,
and network limits. Keep challenge inputs hidden by default.

Practical result: the laboratory can distinguish a model's claim that code
works from independently observed evidence about one exact candidate revision.

Exit gate: fabricated result JSON cannot create passing validation; candidate
changes invalidate promotion eligibility; hidden tests remain undisclosed; all
failures and resource limits are attributable to the exact run.

### Stage 7 - Build the constrained Tool workshop (complete)

Implement the staged workflow from missing capability to structured
specification, immutable candidate revision, generated C++ source, descriptor
inspection, isolated build, three test sets, validation record, exact-hash
installation proposal, explicit user approval, registration, and rediscovery.
The model may create and revise candidates but cannot approve or install them.

Practical result: during a goal, the model can propose and develop a missing
Tool while the user retains control over trust, authority, and installation.

Exit gate: stale approvals and approvals for changed candidates fail; rejected
and failed candidates remain visible; only the exact independently validated
hash can be proposed for user-approved installation.

### Stage 8 - Deliver the first usable IDE

Extend the imported Qt shell into the minimum daily-use interface. Provide
workspace and goal creation, plan/progress views, Tool discovery and calls,
memory and artifact inspection, lineage and provenance, an immutable activity
timeline, candidate source and build views, actual-versus-claimed validation
results, hidden challenge-test submission, exact-candidate approve/reject
controls, resource status, and stop/revoke/resume/recovery controls.

Practical result: a local user can supervise the full laboratory workflow
without directly editing databases, protocol JSON, or terminal commands.

Exit gate: the user can see what every approval changes, distinguish claims
from observations and validated evidence, inspect authority and provenance, and
complete the existing-Tool and new-Tool paths through the GUI.

### Stage 9 - Add continuous checkpointing and goal distillation

Checkpoint goal-relevant state throughout execution rather than relying on a
graceful quit. On goal closure, generate reviewable proposals for experience,
evidence-supported knowledge, skill candidates, Tool candidates or references,
unresolved questions, cleanup, retention, and an immutable session archive.
Never auto-promote model opinion into trusted knowledge, active skills, or
installed Tools.

Practical result: interrupted work resumes usefully, and completed work becomes
inspectable reusable material under explicit retention and approval controls.

Exit gate: crash/restart restores the active goal and evidence links; closure
produces reviewable distillation proposals; rejected and deferred material is
retained or removed according to visible policy rather than silently promoted.

### Stage 10 - Prove and package the minimum laboratory

Exercise the complete workflow and package it for one local user and multiple
isolated workspaces. Test the normal success path and adversarial cases:
fabricated validation, changed or hidden inputs, stale/replayed approval,
candidate mutation after approval, self-approval, cross-workspace access,
partial writes, corruption, quota exhaustion, cancellation, restart, and
misleading temporary-value manipulation. Document installation, migration,
backup, recovery, diagnostics, and known platform constraints.

Practical result: Axiom CoLab reaches its first minimum launch: a user can give
the model a goal, supervise typed Tool use and structured memory, challenge-test
a generated Tool, approve the exact validated candidate, invoke it, inspect how
trusted results were produced, close/distill the goal, and recover after
restart.

Exit gate: the entire goal-to-new-Tool-to-distillation loop succeeds through the
IDE on a clean local installation; adversarial acceptance tests pass; trusted
records remain independently inspectable; no step relies on model assertion as
approval or evidence.

## Blocking and potential problems to re-check during Stage 8

Treat this as a mandatory gate before Stage 8 exposes validation, approval, or
installation controls:

- Repository-backed validation now replaces the in-process `WeakSet` with
  authenticated restart-safe immutable candidate/evidence storage. Keep the
  `WeakSet` only as a process-local fallback and ensure production composition
  always supplies the durable repository and validator credential.
- The default direct runner still does not provide OS confinement and must
  remain non-promotable. Production composition must explicitly supply the WSL
  backend, durable repository, and validator credential. The WSL backend binds
  configured resource ceilings but does not yet sample peak resident memory or
  CPU consumption for reporting.
- Hidden challenge definitions, output, and fresh per-run commitment salts are
  redacted. The authenticated repository privately stores and rechecks salts;
  retain this access boundary when composing production services and UI.
- The workshop must create immutable candidate revisions and keep failed,
  rejected, and superseded revisions visible. A source change must invalidate
  validation and any installation proposal.
- Approval now comes only from trusted user context and binds the exact
  candidate, validation record, requested permissions, and installation
  proposal hash. Preserve this recheck when implementing installation;
  model-authored strings or record-shaped JSON cannot approve or install.
- The installed-Tool registry is a host-supplied backend boundary. Stage 8 must
  compose it with the real application lifecycle and show only successful,
  byte-reverified rediscovery results; the UI must not infer installation from
  files, candidate claims, proposals, or approval state alone.
- Installation records exact captured source and descriptor bytes but does not
  silently edit or rebuild the production C++ Bridge. Any executable loading
  strategy added for the IDE must preserve the registered candidate and
  installation-evidence hashes rather than substituting a later build.
- Ignored C++ build products can be stale. Rebuild the selected Bridge before
  real integration checks; the recent regression run initially found a stale
  `build/windows/Release` binary rather than a source defect.
- Managed-shell MSBuild may require approved execution outside the filesystem
  sandbox or a properly initialized Developer Command Prompt. Record the exact
  build actually used and never infer a compiler pass from existing binaries.
- The existing Qt application is an authoring/import shell, not yet the
  supervisory IDE. Stage 8 must project backend authority and evidence; it must
  not implement an alternate approval, validation, or memory authority in UI.

## Exact next work

Begin Stage 8 by defining one UI-independent supervisory application model for
workspace/goal selection, the immutable activity timeline, current approved
plan, discovered built-ins and installed Tools, memory/resource status,
candidate/validation/approval state, and stop/revoke/recovery actions. Compose
that model from the existing authoritative services and add projection tests
that keep model claims, observations, validation evidence, user approval, and
installed state visibly distinct before wiring Qt controls.

Keep the WSL integration suite opt-in for portable CI, and run it explicitly on
the supported Windows/Ubuntu composition before changing its confinement
claims. The Qt layer must not implement alternate memory, validation, approval,
installation, or registration authority.
