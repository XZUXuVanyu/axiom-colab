# Constrained Tool workshop

Stage 7 begins with the provider- and UI-independent `ToolWorkshop` contract in
`source/ts/tool-workshop.ts`. This first slice covers the path from a structured
missing-capability specification to immutable, content-bound candidate source
revisions. It does not approve, install, or register a Tool.

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

## Deliberate limits

The optional WSL2 backend now closes the five-class OS confinement gate when it
is explicitly composed and its exact policy is bound into the candidate
snapshot. The default direct runner still fails promotion closed.

The API exposes no approval, installation, registration, or rediscovery
operation yet. Exact candidate, validation record, requested permission, and
installation-proposal binding remains the next Stage 7 authority boundary, and
the Qt UI must not present approval or installation controls before it exists.
