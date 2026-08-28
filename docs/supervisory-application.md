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

The next slice is a concrete local backend composition. It should obtain
resource status from `LocalMemoryStore`, audit history from `MemoryWorkflows`,
candidate/validation/approval/installation state from
`LocalCandidateRepository`, built-in descriptors from the Adapter discovery
path, and installed Tools only through successful byte-reverified rediscovery.
Qt should consume this model after that composition is covered by tests.
