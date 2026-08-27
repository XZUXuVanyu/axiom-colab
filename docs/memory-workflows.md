# Semantic memory workflows

`MemoryWorkflows` implements the three Stage 3 authority classes over the
restart-safe `LocalMemoryStore`. Semantic metadata is transactional SQLite;
payload bytes remain immutable SHA-256-addressed files owned by the store.

## Compute memory

Compute objects are scoped to one workspace and capability. Creation and
updates enforce an aggregate active-byte quota, a per-object byte limit, and an
active-object quota. Updates advance an object revision, snapshots bind an
immutable payload hash and source revision, and release makes the live object
unreadable while freeing its semantic compute quota.

## Working memory

A model or trusted host may propose a canonical JSON value against the current
committed revision. Only user authority with `working.approve` can commit it,
and the approval must bind the exact workspace, proposal identity, and proposal
hash. Stale proposals fail if the committed base changed. Approval, rejection,
and supersession are retained, and committed revision history is immutable and
ordered.

## Artifact memory

Only trusted-host authority can create root artifacts or derive artifacts.
Every artifact binds immutable payload and schema hashes, parent identities,
and provenance containing an operation, canonical parameter hash, software
version, and optional validation identity. Derivation verifies that every
parent exists in the same workspace. There is deliberately no artifact update
or delete operation.

Every workflow boundary checks the Stage 1 authority and capability contracts.
Successful and rejected operations append canonical, input-hashed audit events.
The service never accepts workspace, actor, Tool, or call authority from a
memory payload.
