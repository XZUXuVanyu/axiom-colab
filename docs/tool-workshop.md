# Constrained Tool workshop

Stage 7 provides provider- and UI-independent workshop, validation proposal,
approval, installation, and rediscovery contracts. The path begins with a
structured missing-capability specification and ends with exact-hash registered
candidate bytes; each authority transition remains independently inspectable.

## Structured specifications

A model or trusted host may define a specification containing the problem,
snake-case public Tool name, description, input and output schemas, requested
permissions, acceptance criteria, and constraints. The workshop copies the
caller-owned JSON values, assigns host identities and attribution, and binds the
complete specification with a canonical SHA-256 hash.

User and validator authority cannot author workshop content through this API.
That restriction does not imply that model-authored content is trusted; a
specification remains a proposal for candidate development.

## Immutable candidate revisions

The workshop requires the candidate descriptor name to match the specification
and captures every source file before returning a revision. It uses the same
canonical path and raw-byte binding implementation as the Stage 6 validator.
A revision binds:

- workspace, stable candidate, specification, and revision identities;
- the exact specification hash;
- descriptor and ordered source-binding hashes;
- the prior candidate hash, forming a revision chain;
- host-assigned creator and creation metadata.

Only the current revision may be revised. Creating a changed revision marks the
prior view superseded without replacing its captured descriptor or source
bytes. Old revisions remain inspectable and materializable, and materialized
bytes are fresh copies. Cross-workspace lookup and stale-parent branching fail
closed.

Materialization is the explicit handoff to `CandidateValidationRunner`: the
validator still recaptures all mutable inputs and remains the sole authority for
observed validation evidence. A source change necessarily produces a different
candidate hash and a different validator snapshot hash.

## Durable repository

`LocalCandidateRepository` optionally backs the workshop with a transactional
SQLite store. Specifications, descriptors, exact source bytes, revision state,
and hash-chain metadata survive restart. Every materialization rechecks the
stored public candidate binding and the captured descriptor/source hashes.
Candidate revision insertion and parent supersession occur in one transaction,
and direct repository calls cannot skip the root, sequence, parent, state, or
specification bindings.

The same repository accepts validator evidence only with a host-issued bearer
credential whose digest is bound to the validator actor. Public inspection
returns redacted snapshots and records, never private challenge definitions.

## Installation proposal and approval

`ToolInstallationProposalService` creates an immutable proposal only for the
current candidate revision and an authentic, passing, fully confined validation
whose descriptor and source hashes match that revision. The proposal binds its
own identity and author, the specification and candidate hashes, exact
validation/snapshot/record hashes, and the specification's exact requested
permissions. The complete proposal is content-hashed and stored transactionally.

Only trusted user context can approve or reject. Approval rechecks the current
candidate, specification, permission, validation, and proposal bindings before
atomically changing proposal state and storing a separately content-hashed
approval record. Restart, cross-workspace access, replay, model authority, and a
candidate revision after proposal all fail closed. The service accepts no
model-authored approval string and exposes no installation method.

## Trusted installation and rediscovery

`ToolInstallationService` accepts only trusted-host context and consumes one
exact stored user approval. Immediately before installation it rechecks the
current candidate, captured descriptor and sources, specification, requested
permissions, proposal and approval hashes, and authentic promotable validation.
The repository atomically claims the approval so replay and concurrent reuse
fail closed.

Candidate descriptor and source bytes are first written to an installation-owned
staging directory, verified against the approved revision, and atomically moved
to a workspace-scoped content-addressed location. Registration receives the
candidate hash and immutable installation-evidence hash. An append-only success
or failure record binds the complete transition. Registration failure, partial
write, path collision, stale candidate, cross-workspace access, and replay never
enter installed-Tool discovery.

Restart rediscovery reads only successful installation evidence, re-verifies the
stored candidate and exact installed bytes, and registers the same candidate and
evidence hashes. Corrupt or missing bytes stop discovery; registrations already
performed in the same batch are rolled back when the registry provides a
disposer.

## Deliberate limits

The optional WSL2 backend now closes the five-class OS confinement gate when it
is explicitly composed and its exact policy is bound into the candidate
snapshot. The default direct runner still fails promotion closed.

The service registers an exact installed candidate through a host-supplied
registry; it does not silently edit or rebuild the production C++ Bridge. The
Qt UI remains an authoring shell and must compose these backend authorities
instead of implementing an alternate approval or installation path.
