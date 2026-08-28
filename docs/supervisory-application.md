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

The next slice can compose these services into an application host and expose
the first read-only workspace, goal, timeline, Tool, resource, and candidate
views through Qt before adding authority-changing controls.
