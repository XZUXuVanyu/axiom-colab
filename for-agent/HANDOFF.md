# Axiom CoLab Current Handoff

Last updated: 2026-08-31

## Current state

- Stage 10 now has a relocatable Windows runtime boundary. The packager copies
  exact Release GUI, Bridge, Node, generated runtime, operational scripts, and
  Qt deployment files into a new root and binds every copied file by size and
  SHA-256 in a manifest. Qt resolves the copied supervisory script and bundled
  Node relative to its executable rather than the compiled source checkout or
  ambient `PATH`.
- The clean copied layout completed a real portable workspace/goal/built-in/
  closure path: `add_numbers` returned 42, its exact call was sealed in an
  immutable report, and exact-plan closure produced a hash-bound archive and
  inactive review proposal. WSL challenge and installed-candidate acceptance
  remain separate and are not claimed by this portable smoke result.
- Stage 10 has started with a portable offline state archive and verified
  restore boundary. `proj/scripts/state-archive.mjs` creates a complete
  path/size/SHA-256 manifest, copies through a non-authoritative sibling staging
  directory, verifies before promotion, and restores only to a new root after a
  second byte verification. It rejects live SQLite WAL/SHM state, links/special
  entries, overlapping paths, existing targets, unbound files, and corruption.
  Operational documentation makes host shutdown and post-restore authoritative
  inspection explicit; this is backup/recovery, not schema migration.
- Stage 9 is complete. Qt can close the selected goal only against its exact
  displayed approved-plan revision/hash, immediately clears submitted draft
  bytes, and refreshes the immutable closure/archive plus all review proposals.
  Accept/reject/defer actions bind the exact displayed proposal hash. Every row,
  including accepted cleanup, retention, skill, and Tool material, is labeled
  `INACTIVE (review decision only)`; these controls perform no activation,
  deletion, retention, installation, or policy side effect.
- Stage 9 includes an append-only, restart-safe goal checkpoint store.
  Every successful supervisory Tool call now checkpoints the exact approved
  plan, cumulative call count, latest call, and sealed report artifact/hash.
  Supervisory progress prefers this operational checkpoint after restart while
  retaining independently verified report observations. Checkpoints are
  recovery facts, not approved knowledge or distillation decisions.
- Stage 9 now also has a UI-independent goal-distillation boundary. Closure
  binds the exact approved plan and latest evidence-bearing checkpoint, derives
  an immutable session archive with artifact lineage, and persists separately
  reviewable experience, knowledge, skill/Tool candidate/reference, unresolved
  question, cleanup, and retention proposals. User review can accept, reject,
  or defer an exact proposal, but no decision activates content or performs
  cleanup/retention by itself. Production host/transport/Qt composition is the
  immediate continuation.
- Closure is now partial-write retry-safe: a durable exact-input claim precedes
  archive creation, and retry reuses the one hash-verified archive if the process
  stopped before proposal/closure commit. Changed retry inputs fail closed.
- Production host and supervisory protocol now compose exact-plan `close-goal`
  and exact-hash `decide-distillation` operations. Closure durably completes the
  lifecycle and appends a completed checkpoint only after archive/proposals are
  committed. Protocol input is bounded and restricted to the eight review-only
  distillation kinds.
- Authoritative inspection now projects the immutable closure/archive binding
  and every proposal's current review decision with actor/time attribution.
  The projection verifies proposal hashes, closure membership, and the archive
  against artifact inspection, and marks every proposal explicitly inactive;
  accepted cleanup, retention, skill, or Tool material still has no effect.
  The C++ process boundary now strictly decodes this projection, rejects goal
  distillation in workspace overviews, malformed identities/hashes/decisions,
  duplicate proposals, and any proposal presented as active. Qt close/review
  controls remain next.
- Stage 8 is complete. Production composition now owns a strict shell-free
  installed-executable build profile, a restart-safe SQLite evidence authority,
  byte-reverified loading, and one isolated Adapter instance per installed Tool.
  Source-only installation is never executable without successful trusted build
  evidence, and caller-authored evidence remains inadmissible.
- Installed-Tool goal reports retain workspace, installation/evidence,
  executable-evidence, candidate, descriptor, source-manifest, and executable
  hashes. The executable path is deliberately omitted from immutable report
  payloads and Qt projections.
- `InstalledExecutableLoader` accepts only evidence authenticated by an
  independently trusted build authority and bound to the exact workspace,
  installation/evidence hash, candidate, descriptor, source manifest, public
  name, and executable-byte hash. It re-reads installed descriptor, source,
  and executable bytes on every load and returns an immutable binding carrying
  all identities and hashes required by a later call.
- Installed registrations now retain descriptor/source hashes and the exact
  source manifest. Forged evidence, cross-installation replay, path escape,
  changed source/descriptor bytes, and changed executable bytes fail closed;
  the loader never builds from mutable source or modifies the shared Bridge.

- Qt now exposes one explicit installation action only for a selected approved,
  not-yet-installed candidate. The request echoes the exact proposal, approval,
  candidate, validation record/snapshot, and permission hashes projected by
  authoritative inspection.
- The production host re-inspects every echoed binding, delegates only under
  trusted-host authority to `ToolInstallationService`, and returns a redacted
  immutable evidence identity/hash without paths, descriptors, or source bytes.
  The installer repeats all live trust checks and byte verification before its
  registry entry becomes visible.
- After installation Qt refreshes authoritative inspection. The installed Tool
  appears only through the verified host registry with its installation-
  evidence hash and remains explicitly non-executable; the widget never infers
  installation from approval state or installed files.
- Candidate projections now retain proposal permission hashes and exact user
  approval identities/hashes. Rejections carry no approval authority hashes,
  and misleading combinations fail in the UI-independent supervisory model.

- Qt now creates workspaces and goals through narrow host-owned operations.
  Newly created identities are selected only after strict correlated responses
  and authoritative workspace/goal list refreshes.
- Goal creation captures the objective in a trusted-host working proposal,
  commits it only through the configured user authority, and registers the
  lifecycle goal only against the resulting exact plan revision/hash. Qt does
  not write the memory or lifecycle databases and displays the committed
  binding returned by the host.
- Retrying after the plan commit but before lifecycle registration reuses only
  an exact matching approved plan; changed objectives and duplicate registered
  goals fail closed.

- Qt now renders and invokes host-projected stop, resume, capability-revocation,
  and workspace-recovery controls. Every result is strictly correlated and the
  view refreshes authoritative inspection instead of changing control state
  locally.
- Stop/resume requests bind the exact visible approved-plan revision/hash;
  revocation binds the exact workspace/goal selection and capability identity;
  recovery binds the workspace. The host re-inspects current availability
  before delegating to the restart-safe lifecycle service.
- The production local host gates Tool execution when a goal is stopped, sends
  capability revocation to the authenticated memory authority, and verifies
  recovery through the memory store before committing lifecycle transitions.

- Qt now creates a new structured Tool specification and its initial immutable
  candidate through one narrow host-owned workshop operation. The workspace-
  level form accepts the full specification, descriptor, and canonical-base64
  source set, clears submitted bytes immediately, and refreshes authoritative
  candidate inspection.
- The strict C++ decoder requires revision 1 with null parents and verifies the
  exact workspace/specification identity and hash binding before displaying
  candidate identities or hashes. Qt never receives repository paths or writes
  specification/candidate rows directly.

- Qt now exposes exact-parent candidate revision authoring for the selected
  current candidate. The editor accepts a descriptor and canonical-base64
  sources, clears submitted bytes immediately, and delegates through the host
  to the repository-backed workshop.
- The C++ decoder binds the result to the exact displayed workspace and parent
  revision/hash. Qt displays the immutable child revision/hash, explains that
  prior validation/proposal bindings are stale, and refreshes authoritative
  candidate history rather than mutating its projection locally.

- Production supervisory protocol `1.1` now exposes exact-parent candidate
  revision authoring. Requests bind the current revision/hash, strict descriptor,
  and canonical-base64 source set, then delegate to the repository-backed
  `ToolWorkshop`; transport and Qt never receive storage paths or write rows.
- A successful revision atomically preserves the former revision as superseded,
  creates the immutable hash-chained child, and makes prior validation and
  proposal bindings stale. The Qt form and strict C++ result decoder remain the
  immediate continuation.

- The Qt selected-candidate panel now submits private hidden-challenge fixture
  and command JSON through the existing host-owned operation, binding the
  displayed current revision and candidate hash.
- Qt clears the private editor immediately after a valid request is submitted.
  Its strict result decoder accepts only matching workspace/revision/candidate
  bindings and redacted outcome, promotability, evidence hashes, and salted
  suite commitments; fixtures, definitions, salts, and process output do not
  remain in completed widget state.

- Supervisory protocol `1.1` now includes a narrow host-owned hidden-challenge
  submission. It binds the exact current candidate revision/hash, combines
  private fixtures and challenge commands with profile-owned candidate and
  laboratory-standard suites, and invokes the authenticated repository-backed
  `CandidateValidationRunner` through the configured WSL backend.
- Hidden challenge responses expose only validation/snapshot/record hashes,
  outcome, promotability, and salted suite commitments. Fixture bytes,
  challenge definitions, command output, and salts remain private and absent
  from inspection. The process-local validator credential is revoked during
  owned shutdown.
- Production supervisory configuration now requires a strict validation
  profile binding the exact toolchain, WSL distribution, non-authoritative
  staging root, Linux executable allowlist, process/resource ceilings, and
  separate candidate and laboratory-standard command suites. Unknown fields,
  duplicate identities/allowlist entries, unsafe working directories,
  non-allowlisted commands, excessive command counts, and state/staging overlap
  fail before host startup.
- Goal execution evidence is now selected by the exact host-issued call IDs
  instead of by positional slices of the shared Adapter ledger. Concurrent or
  unrelated Adapter activity cannot be absorbed into a goal-session report,
  and missing, mismatched, or non-successful exact records fail closed.
- Pending installation proposals now project the exact proposal hash, bound
  candidate/validation hashes, requested permissions, and state. Qt shows these
  facts before enabling explicit approve/reject controls.
- Supervisory decisions carry only workspace, proposal identity/hash, and the
  decision. The production host supplies `actor:local-user` (or the strict
  configured replacement) and delegates to `ToolInstallationProposalService`;
  stale hashes, changed candidates, non-promotable validation, replay, and
  cross-workspace decisions fail through existing authority checks.
- Candidate inspection now materializes each revision through repository
  integrity checks and projects descriptor/source-file bindings plus public
  validation snapshot, record, toolchain, policy, confinement, suite, and
  observed process evidence. Private source/fixture payloads, challenge
  definitions, salts, and hidden output remain outside the projection.
- The Qt Laboratory view has a selectable candidate evidence panel that shows
  source manifests and actual candidate/standard/challenge outcomes separately
  from the model claim, approval, installation, and promotability labels.
- Tool projections now carry host-computed executability. Qt can offer a
  policy-covered memory built-in without inferring authority from its
  descriptor, while rediscovered installed candidates remain non-executable.
- The production supervisory process now starts the authenticated
  numeric-loopback memory service and accepts strict explicit
  `memoryToolPolicies`. A covered discovered built-in receives a fresh
  workspace/Tool/call-bound session with configured operations, byte/call
  quotas, lifetime, and automatic Adapter revocation.
- Side-effecting built-ins without a policy still fail closed. The generated
  local configuration supplies bounded policies for `compute_buffer` and
  `derive_artifact`; rediscovered installed candidates remain deliberately
  non-executable until their exact executable loading boundary exists.
- Supervisory protocol `1.1` adds one constrained `execute-tool` command. It
  requires an exact visible goal/approved-plan binding and accepts only
  Adapter-discovered built-ins that are pure or covered by explicit host memory
  policy. The host generates call IDs and does not accept caller-authored
  trusted context.
- Successful calls are sealed with their actual Adapter ledger record and
  observed result into an immutable, hash-verified goal-session-report artifact
  before success is returned. The Qt workflow submits strict JSON object
  arguments, validates the correlated execution/evidence response, shows the
  result, and refreshes authoritative inspection.
- Side-effecting Tools without explicit memory policy and all rediscovered
  installed Tools remain deliberately non-executable through this command.
- Supervisory inspection now includes host-owned metadata projections for all
  three semantic memory classes: bounded compute objects, approved working
  revisions, and immutable artifacts with complete parent/child lineage and
  provenance hashes. Payload bytes, working values, paths, and credentials are
  not exposed to Qt.
- Fresh scoped trusted-host capabilities enumerate each memory class through
  its existing read operation. Projection rejects missing, duplicate,
  self-referential, or inconsistent artifact edges, and workspace scoping is
  enforced by the memory workflows before metadata is returned.
- The strict C++ decoder requires the three-part memory projection. The
  Laboratory view separately renders compute state, approved working revision
  identities, and artifact lineage/provenance details.
- Goal-specific supervisory inspection now projects an exact committed
  `goal:<id>:progress` checkpoint and hash-verified Tool observations from
  immutable goal-session-report artifacts. Both sources must bind the selected
  goal and current approved-plan revision/hash; malformed or stale bindings
  fail closed.
- `MemoryWorkflows.listArtifacts` provides scoped metadata enumeration under
  `artifact.read`; payload reads still pass through content-hash verification.
  The production host uses fresh call-scoped trusted-host capabilities and Qt
  receives projections only, never storage paths or database authority.
- The strict C++ inspection decoder now requires the progress and observation
  fields. The Laboratory view renders checkpoint status/call counts and a
  separate observed-Tool-results list whose tooltips retain report artifact
  identities and authoritative hashes.
- Production supervisory composition now supplies `LocalGoalLifecycle` with a
  scoped trusted-host reader for the exact committed `goal:<id>:plan` working
  revision. The reader rejects malformed values and goal mismatches rather
  than treating a stored string as an approved plan.
- Restart-safe lifecycle goal enumeration validates every stored plan
  revision/hash binding before exposure. `LocalApplicationHost` and transport
  now provide workspace-bound `list-goals`; strict C++ decoding rejects
  duplicates, malformed identities, and selection mismatches.
- The Qt Laboratory tab now has a goal selector and renders the approved
  objective with its exact revision identity and hash. Workspace overview
  remains available, while selecting a goal without an authoritative plan
  fails closed.
- The first Qt Widgets supervisory view now launches the constrained local
  process from an explicit config, lists visible workspaces, and renders
  read-only resource, discovered-Tool, candidate, and immutable timeline
  summaries beside the preserved Tool-authoring shell.
- Candidate and timeline rows label model claims, validation outcomes, user
  decisions, verified installation state, and authoritative hashes without
  granting the widget any mutation operation or direct state-directory access.
- `proj/scripts/new-supervisory-config.ps1` writes a strict UTF-8 config outside
  the authoritative state root, refuses accidental replacement by default, and
  feeds `--supervisory-config` at GUI launch.
- A complete Qt 6.12.0 MSVC 2022 64-bit kit is installed side-by-side at
  `C:\Qt\6.12.0\msvc2022_64`; its Widgets header is intact and all current GUI
  targets compile. The damaged 6.11.2 kit remains untouched.
- `runLocalSupervisoryProcess` and `proj/scripts/run-supervisory.mjs` provide
  the constrained production Node entry point. Strict explicit configuration
  selects absolute state, Bridge, and working-directory paths; the process
  composes durable memory/candidate/lifecycle repositories, Adapter discovery,
  installed-Tool rediscovery, authentic promotion inspection, the local host,
  and the JSON-lines server without putting diagnostics on stdout.
- The production process exposes only narrow exact-state lifecycle operations
  and cannot author validation evidence. Promotion projection checks
  exact stored evidence plus all five confinement observations through a
  narrow read-only authority object. Goal-specific inspection uses only exact
  lifecycle and committed-plan bindings; workspace inspection with
  `goalId: null` remains supported.
- The first Qt supervisory read-path slice now provides a UI-independent C++
  response parser. It strictly accepts protocol `1.0` success and error
  envelopes, rejects missing or unknown fields, and correlates every renderable
  response with the exact pending request ID before exposing its payload.
- `SupervisoryProcessClient` now owns a shell-free long-lived Qt `QProcess`,
  ordered pending-request correlation, bounded incremental JSON-lines framing,
  deterministic `list-workspaces`/`list-goals` request IDs, separate
  diagnostics, and fail-closed handling of malformed, oversized, unsolicited,
  crashed, or correlation-losing response streams. It is a Qt Core library
  independent of Widgets and is exercised against the real Node transport
  fixture.
- The Qt client now issues strict `inspect` requests with locally validated
  workspace/goal identities and has a constrained launcher for the known
  production script plus an absolute config. Typed result decoders reject
  duplicate/malformed workspace lists, unknown inspection fields, wrong field
  shapes, and workspace/goal selection mismatches before data can reach a
  widget; tools, resources, candidates, timeline, and controls remain copied
  JSON subtrees for later view-specific decoding.
- `runSupervisoryTransportServer` now provides incremental UTF-8 JSON-lines
  framing for a shell-free local process. Stdout is response-only, diagnostics
  are separate, responses remain ordered, oversized frames are contained, and
  parsing resumes at the next newline.
- Valid request IDs survive parseable rejections such as unknown operations;
  malformed JSON remains uncorrelated. Real child-process tests exercise the
  framing rather than only calling the transport in-process.
- `SupervisoryTransport` version `1.1` defines strict JSON reads plus constrained
  pure-Tool execution. Requests use strict fields, validated
  identities, a 64 KiB default limit, request-ID correlation, and structured
  errors; the only approval operation is the exact-hash installation-proposal
  decision. Exact-state lifecycle operations are present; installation and
  general memory-authority operations remain absent.
- Host inspection now has a selection-independent path, preventing concurrent
  transport requests from redirecting shared UI workspace/goal selection.
- `LocalApplicationHost` now owns Adapter descriptor discovery, deterministic
  memory-workspace enumeration, trusted per-workspace installed-Tool
  rediscovery, supervisory backend/model construction, partial-startup
  registration rollback, and idempotent service shutdown.
- The host rejects access before successful initialization. If rediscovery for
  any workspace fails, registrations captured for earlier workspaces are
  cleared and no initialized host state is exposed.
- `LocalGoalLifecycle` now provides restart-safe local supervisory lifecycle
  state. Registered goals bind the exact current approved working-memory plan
  revision and hash; the lifecycle cannot author or approve a replacement.
- Stop, resume, capability revocation, and recovery delegate to host-owned
  authoritative operations before their local state changes. Active/stopped
  goal state, scoped capability state, and recovery requirements survive
  restart; cross-workspace actions, replay, and stale plan bindings fail closed.
- `LocalSupervisoryBackend` now composes resource status from
  `LocalMemoryStore`, audit history from `MemoryWorkflows`, and candidate,
  validation, proposal, approval, and installation projections through new
  integrity-checking `LocalCandidateRepository` enumeration methods.
- Built-ins remain host-supplied Adapter discovery results. Installed Tools are
  projected only from host-supplied successful rediscovery registrations whose
  public name, candidate hash, and installation-evidence hash match successful
  stored evidence; descriptors are parsed again at the projection boundary.
- Local supervisory tests prove restart persistence, cross-workspace isolation,
  and rejection of a forged rediscovered registration. Goal lifecycle actions
  remain behind the `LocalSupervisoryLifecycle` composition boundary.
- Stage 8 has started with `source/ts/supervisory-application.ts`. The
  UI-independent model owns workspace/goal selection and immutable projections
  for approved plan, discovered Tools, resources, candidates, timeline, and
  stop/revoke/resume/recovery availability.
- Projection facts explicitly distinguish model claims, Tool observations,
  validator evidence, user decisions, verified installed state, and system
  events. Installed Tools require installation-evidence hashes; approval must
  retain validation state; installation must retain approval; model claims
  cannot carry authoritative hashes.
- Authority-changing actions are checked against projected availability,
  delegated through `SupervisoryBackend`, and followed by fresh inspection.
  The application model cannot author memory, validation, approval,
  installation, or recovery state.
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

- Stage 8 hidden challenge host operation `pnpm.cmd test`: all 86 TypeScript
  tests passed, including exact current-candidate binding, canonical private
  fixture decoding, redacted results, and malformed submission rejection.
- Stage 8 hidden challenge host operation `pnpm.cmd run test:integration`:
  five portable real-Bridge tests passed; three opt-in WSL confinement tests
  remained skipped.
- Stage 8 production validation profile `pnpm.cmd test`: all 85 TypeScript
  tests passed and regenerated `dist/`.
- Stage 8 production validation profile `pnpm.cmd run test:integration`: five
  real-Bridge integrations passed; the three opt-in WSL confinement cases were
  skipped by their existing portable-CI gate.
- `new-supervisory-config.ps1` generated a smoke configuration whose nested
  candidate commands and resource ceilings round-tripped through PowerShell
  JSON decoding. An initial smoke attempt used an unquoted executable path with
  spaces and was corrected to a no-space existing fixture path.
- Stage 8 exact-call evidence bug fix `pnpm.cmd test`: all 85 TypeScript tests
  passed. The host and goal-coordinator regressions inject unrelated ledger
  activity during execution and verify that immutable reports contain only the
  matching host/coordinator-issued call records.
- Existing pure-Tool execution slice `pnpm.cmd test`: all 82 TypeScript tests
  passed, including strict transport arguments, host-generated identity,
  immutable report sealing, rejection of a side-effecting descriptor, and a
  real production-process call through the fake Bridge with correlated result
  and report-artifact evidence.
- Qt 6.12.0/MSVC 19.51 Release rebuilt with warnings as errors; all three CTest
  targets passed, including real-process protocol `1.1` execution and an
  offscreen Widgets call/result/evidence refresh.
- Memory/lineage slice `pnpm.cmd test`: all 81 TypeScript tests passed,
  including scoped enumeration of compute, working, and artifact metadata,
  parent/child derivation, cross-workspace isolation, and rejection of
  incomplete lineage.
- Qt 6.12.0/MSVC 19.51 Release rebuilt every affected strict-decoder and
  Widgets target with warnings as errors; all three CTest targets passed.
- Goal progress/observation slice `pnpm.cmd test`: all 79 TypeScript tests
  passed, including exact checkpoint/plan binding and projection of a Tool
  result from a hash-verified immutable session-report artifact.
- Qt 6.12.0/MSVC 19.51 Release rebuild after initializing the Visual Studio
  2026 Developer Command Prompt completed all targets with warnings as errors;
  CTest passed all three C++/real-process/offscreen-Widgets targets.
- The first direct Qt rebuild attempt lacked the Developer Command Prompt
  standard-library include environment and failed on `<cstdint>`; rerunning
  from `VsDevCmd.bat` produced the passing build above.
- Goal/plan read slice `pnpm.cmd test`: all 78 TypeScript tests passed,
  including exact committed-plan reading, malformed goal binding rejection,
  stale lifecycle enumeration, and strict workspace-bound `list-goals`.
- Fresh Qt 6.12.0/MSVC 19.51 build and CTest: all three targets passed. The
  real child-process test decoded workspace, goal, and inspection responses;
  the offscreen Widgets test selected `goal:one` and rendered its exact
  approved objective and revision evidence.
- Fresh Qt 6.12.0/MSVC 19.51/Ninja Release build in `build/qt612`: every C++
  target, including `cpp-adapter-gui`, compiled with warnings as errors; CTest
  passed `cpp-adapter-tests`, the real-process
  `axiom-supervisory-process-tests`, and an offscreen Widgets regression that
  decoded two workspaces and rendered the selected resource projection.
- The new GUI remained live for a three-second offscreen smoke run while using
  `--supervisory-config` to compose the real production supervisory process.
  The same generated config returned a correlated empty workspace list through
  the production JSON-lines entry point.
- Supervisory config generation produced BOM-free JSON outside the selected
  state root, and a negative run rejected an output path inside that root.
- Post-view `pnpm.cmd test`: all 77 TypeScript tests passed and regenerated
  `dist/`.
- Extended Qt supervisory read path Release build: the real Node fixture
  accepted ordered `list-workspaces` and `inspect(workspace:alpha, null)`
  requests with deterministic IDs `qt:1` and `qt:2`; both responses passed the
  typed decoders. The 16-test C++ regression executable also passed, including
  duplicate workspace rejection and inspection selection-mismatch rejection.
- Production supervisory process `pnpm.cmd test`: all 77 TypeScript tests
  passed. New coverage creates durable workspace state, starts the explicit
  process entry shell-free, discovers descriptors through the fake Bridge,
  serves correlated `list-workspaces` JSON, keeps diagnostics off stdout, and
  rejects relative paths and unknown authority-shaped configuration fields.
- The first production-process test failed because a read-only validation
  runner was incorrectly composed with a repository but no authoring
  credential. Replacing it with a narrow stored-evidence/confinement inspector
  preserved the trust boundary and produced the passing full run above.
- Qt supervisory response parser Release build and C++ test executable: all
  16 tests passed, including strict success/error envelopes, request-ID
  mismatch, unsupported version, missing fields, and unknown fields. The first
  managed build attempt was blocked by Visual Studio FileTracker access; the
  approved out-of-sandbox retry compiled the new parser and passed.
- Qt Core supervisory process integration: the Release library and test
  executable compiled, and a real shell-free Node child returned the two
  expected workspaces through the strict parser with request ID `qt:1`.
- The first process-test build failed because the new library's public Qt/JSON
  include dependencies were private in CMake. Marking the public header
  dependencies public produced the passing build above.
- The Qt Widgets executable remains blocked by a damaged external Qt 6.11.2
  installation: `C:\Qt\6.11.2\msvc2022_64\include\QtWidgets\qapplication.h`
  is only 279 bytes and contains an empty include guard with no `QApplication`
  declaration. Reordering repository includes did not change MSVC C2079 and
  was reverted. No external SDK file was modified, and the GUI executable is
  not claimed as passing.
- Qt Maintenance Tool identifies the affected installed package as
  `qt.qt6.6112.win64_msvc2022_64`. Its exact-package update path refreshed
  metadata successfully but reported no updates, so it did not repair the
  empty header. A matching installed source package is absent; an online source
  package search later failed on a remote-host connection. Removing and
  reinstalling the same package was not attempted because its current archive
  may reproduce the packaging defect and a failed reinstall would remove the
  otherwise usable Qt Core environment.
- Stage 8 process transport `pnpm.cmd test`: all 75 TypeScript tests passed
  after correcting an internal test import and then fixing request-ID
  preservation for parseable rejected operations. Process coverage proves
  shell-free execution, JSON-only stdout, ordered framing, oversized-line
  containment, resynchronization, and mutation rejection.
- Stage 8 supervisory transport `pnpm.cmd test`: all 73 TypeScript tests passed,
  including strict read operations, malformed and oversized input, rejection
  of mutation-shaped requests, request correlation, and deterministic backend
  failures.
- Stage 8 application host `pnpm.cmd test`: all 70 TypeScript tests passed,
  including deterministic workspace discovery, model projection, owned
  shutdown, and rollback after partial multi-workspace rediscovery failure.
- Stage 8 goal lifecycle `pnpm.cmd test`: all 68 TypeScript tests passed after
  correcting one new assertion to expect the actual fail-closed
  `GOAL_NOT_FOUND` cross-workspace result. Coverage includes restart, stop and
  resume delegation, revocation, recovery, replay, and stale approved plans.
- Stage 8 local composition `pnpm.cmd test`: all 66 TypeScript tests passed,
  including restart-safe projection, cross-workspace isolation, and rejection
  of rediscovered Tools without matching successful installation evidence.
- Stage 8 initial `pnpm.cmd test`: all 64 TypeScript tests passed, including
  immutable supervisory snapshots, claim/evidence distinction, delegated
  lifecycle actions, and rejection of misleading installed-state projections.
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

### Stage 8 - Deliver the first usable IDE (complete)

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

### Stage 9 - Add continuous checkpointing and goal distillation (complete)

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

Extend the clean-layout acceptance path through WSL hidden challenge,
approval, exact executable installation/invocation, and distillation. Keep the
packaged runtime separate from authoritative workspace state and do not weaken
optional WSL confinement claims.

Keep the WSL integration suite opt-in for portable CI and run it explicitly on
the supported Windows/Ubuntu composition before changing confinement claims.
