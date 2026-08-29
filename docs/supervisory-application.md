# Supervisory application model

Stage 8 begins with `SupervisoryApplicationModel`, a UI-independent projection
boundary for the desktop application. It owns workspace and goal selection,
immutable display snapshots, action availability, and delegation of stop,
revoke, resume, and recovery commands to a trusted backend.

The model does not read databases directly and cannot create or alter memory,
validation, approval, installation, or recovery records. A production backend
must compose snapshots from the existing authoritative services. Every command
is checked against the latest projected controls, delegated to that backend,
and followed by a fresh inspection.

Projected facts keep their authority visibly separate:

| Projection | Meaning |
|---|---|
| `model-claim` | An untrusted interpretation or assertion |
| `tool-observation` | An observed invocation result |
| `validation-evidence` | Validator-owned evidence for exact content |
| `user-decision` | A user approval or rejection bound to a proposal |
| `installed-state` | Backend-verified installation evidence |
| `system-event` | A trusted lifecycle or recovery event |

The projection rejects installed Tools without installation evidence, approval
without retained validation state, installation without retained approval, and
model claims carrying authoritative evidence hashes. Timeline identifiers must
be unique, and returned snapshots are cloned and frozen so widgets cannot
mutate projected state.

`LocalSupervisoryBackend` is the concrete local composition. It obtains resource
status from `LocalMemoryStore`, audit history from `MemoryWorkflows`, and
candidate, validation, approval, and installation state through integrity-
checking `LocalCandidateRepository` inspection methods. Its host supplies
Adapter-discovered built-in descriptors and the registrations returned by
successful byte-reverified Tool rediscovery. A rediscovered registration is
projected only when its public name, candidate hash, and installation-evidence
hash match stored successful evidence; its descriptor is parsed again at this
boundary.

The composition retains workspace isolation and survives repository restart.
`LocalGoalLifecycle` supplies the restart-safe lifecycle boundary. Its SQLite
state binds a goal to the identity and hash of the current approved working-
memory plan; it never stores or approves a replacement plan. Stop, resume,
capability revocation, and recovery first delegate to host-owned authoritative
operations and only then commit their supervisory state. Cross-workspace use,
replay, changed plan bindings, and unavailable actions fail closed.

The Qt read slice now exposes workspace and goal selection plus approved-plan,
checkpointed progress, hash-verified Tool observations, resource, Tool,
candidate, and timeline summaries. The production host reads
the exact `goal:<id>:plan` committed working revision with a call-scoped
trusted-host read capability, and lifecycle enumeration rechecks its stored
revision/hash binding before exposing a goal. The UI labels model claims
separately from validator evidence, user decisions, and verified installed
state. Authority-changing controls remain deferred.

Goal progress is read only from the exact committed `goal:<id>:progress`
working revision. Its goal, approved-plan revision/hash, status, summary, and
call counts are validated before projection. Tool observations are not trusted
because a progress string mentions them: production enumerates artifact
metadata through a scoped `artifact.read` capability, reads payloads through
the memory service (which rechecks their content hashes), accepts only strict
goal-session reports bound to the selected goal and exact approved plan, and
then projects their call IDs, Tool names, results, report artifact identities,
and hashes. Stale or malformed bindings fail closed.

Memory inspection is likewise host-owned. A fresh scoped read capability
enumerates compute-object metadata, approved working revisions, and immutable
artifact metadata without returning payload bytes, working values, database
paths, or storage credentials to Qt. Artifact projections include content,
schema, and parameter hashes; software and validation provenance; and complete
parent/child edges. Missing, duplicate, self-referential, or inconsistent
lineage fails closed before the application model accepts a snapshot. The Qt
view renders the three semantic memory classes separately and retains exact
revision, proposal, artifact, and provenance identities in inspectable details.

`LocalApplicationHost` now owns that composition boundary. Startup discovers
built-ins through the Adapter, enumerates memory-service workspaces, performs
trusted installed-Tool rediscovery for each workspace, and exposes one
`SupervisoryApplicationModel`. A failure during any workspace rediscovery
clears every registration captured earlier in the startup attempt. Shutdown is
idempotent and closes the Adapter, lifecycle, workflows, candidate repository,
and memory store in ownership order.

The Qt layer consumes serialized supervisory projections through a long-lived,
shell-free child process and does not open SQLite databases or installed-Tool
directories itself.

`SupervisoryTransport` version `1.1` defines the local supervisory JSON
boundary. It accepts `list-workspaces`, `list-goals`, `inspect`, constrained
`execute-tool`, and exact-hash `decide-installation`, using strict exact-field parsing,
validates workspace and goal identities, bounds request bytes, correlates every
valid request ID, and returns structured deterministic failures. Tool execution
requires a registered goal with its exact current approved plan and is limited
to Adapter-discovered built-ins that either declare no side effects or have an
explicit host memory policy. A policy-covered call receives a fresh
workspace/Tool/call-bound loopback memory session whose operations and quotas
come from configuration and whose grant is revoked on completion. The host
generates the call identity, invokes the Adapter, and seals the actual ledger
record and result into a hash-verified immutable goal-session-report artifact
before returning success. One exact-hash installation decision command accepts
only a visible workspace, proposal identity/hash, and `approved` or `rejected`.
The host supplies trusted user identity and delegates to
`ToolInstallationProposalService`, which repeats live candidate, validation,
permission, and proposal checks before authoring an approval. Installation and
lifecycle commands remain absent. Host inspection bypasses mutable UI selection, so concurrent clients
cannot redirect one another's workspace or goal request.

Candidate inspection materializes each stored revision through the repository's
integrity checks before projection. The read-only projection includes descriptor
and source-manifest hashes, validation snapshot/record hashes, toolchain and
policy bindings, confinement observations, and all three public suite/process
outcomes. It never projects captured source bytes, private fixtures, challenge
definitions, commitment salts, or hidden challenge output.

`runSupervisoryTransportServer` supplies the shell-free JSON-lines process
boundary. It incrementally decodes UTF-8, emits only protocol responses on
stdout, preserves request order, contains oversized frames, and resumes at the
next newline. Diagnostics use an explicit separate callback suitable for
stderr. Process-level tests invoke a real Node child without a shell.
