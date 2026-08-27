# Laboratory contract 1.0

This provider- and UI-independent contract is the common vocabulary for Axiom
CoLab services. TypeScript declarations and executable rules live in
`source/ts/laboratory-contract.ts`.

## Authority boundary

Trusted invocation context is host supplied. Model arguments may refer to
opaque identities, but cannot supply or override workspace, actor, Tool, call,
authority, validation, or approval facts. Services compare envelopes with the
trusted context and fail closed.

```text
model claim != observed Tool result != validated evidence != user approval
```

Authorities are `model`, `trusted-host`, `validator`, and `user`. Only a user
may approve proposals; only a validator may author validation records; only a
trusted host may derive authoritative artifacts. Model-authored approval or
validation-shaped JSON has no authority.

## Identities and envelopes

Workspace, goal, session, actor, call, Tool, object, capability, proposal,
approval, evidence, and validation identities use `<kind>:<opaque-id>` and are
scoped to a workspace. `EntityEnvelope` binds protocol version, kind, identity,
workspace, monotonic revision, lifecycle state, authority, creation time,
creator, and typed payload. Identity kind, issuer authority, timestamps, and
revision are checked at the service boundary.

Capabilities additionally bind workspace, actor, optional Tool and call,
allowed operations, issuance, expiry, and a host-generated nonce. A mismatch,
missing permission, future grant, expiry, or replay under another call fails
before an operation executes.

## Canonical serialization and hashes

Hash inputs are lossless JSON only. Objects are serialized with lexicographically
sorted keys, arrays retain order, strings use JSON escaping, and negative zero
is normalized to zero. Undefined values and non-finite numbers are rejected.
Hashes are lowercase SHA-256 with the `sha256:` prefix over UTF-8 canonical JSON.
Approvals bind workspace, proposal identity, and exact content hash.

## Operations and authoritative outputs

`OPERATION_RULES` is the normative executable matrix. It covers workspace
inspection; compute create/read/update/release; working read/propose/approve/
reject; artifact read/derive; validation runs; and proposal approve/reject.
Each rule declares permitted authorities, target kind, authoritative output,
and mandatory audit emission. A denied attempt also emits an audit event.

## Lifecycle

Legal transitions are:

```text
draft -> proposed
proposed -> approved | rejected | superseded
approved -> active | revoked
active -> completed | failed | revoked | expired | superseded
```

Rejected, completed, failed, revoked, expired, and superseded are terminal.
Repeating a transition is replay and fails with `ILLEGAL_STATE_TRANSITION`.
Immutable artifacts, evidence, validation, and approval records are represented
by new envelopes or derivations; an existing authoritative record is not edited.

## Deterministic failures and audit

Contract failures carry stable `SCREAMING_SNAKE_CASE` codes, including protocol,
canonical-value, timestamp, scope, identity, permission, expiry, authority,
revision, approval, and state-transition failures. No rejected request produces
an authoritative domain output.

Every attempted operation records protocol version, event ID, workspace, actor,
call, operation, target, capability, canonical input hash, time, outcome, and
error code. Audit creation records observations; it does not itself validate a
claim or grant approval.

## Stage boundary

This contract defines behavior but selects no database, transport, or UI. Stage
2 may implement restart-safe local storage only behind these rules. Any future
contract extension must be additive within protocol 1.0 or use a new version.
