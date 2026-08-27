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

# Authenticated Tool boundary

`AuthenticatedMemoryService` is the authoritative Stage 4 boundary for scoped
C++ Tool access. The host issues a bearer token separately from the capability
record. Only a SHA-256 digest is retained by the service. Every invocation
authenticates the token and repeats workspace, actor, Tool identity/version,
call ID, session generation, operation, expiry, request-byte, and operation
quota checks before dispatching to `MemoryWorkflows`, which performs its own
authority and capability checks again before touching state.

`AuthenticatedMemoryHttpServer` exposes only `POST /v1/memory/invoke` on an
explicit IPv4 or IPv6 loopback address, uses structured JSON success/failure
responses, disables response caching, and enforces a service-level request
limit. It never serves workspace files or accepts physical storage paths. This
is the persistent endpoint shared by process-per-call Bridge workers; the C++
HTTP transport and host lifecycle wiring remain to be completed.
