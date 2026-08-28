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

## Deliberate limits

This slice is process-local. Restart-safe immutable candidate storage and
authenticated validator-record storage are still required before a validation
can be used for promotion. The OS confinement gaps documented in
`candidate-validation.md` also remain open. Consequently this API exposes no
approval, installation, registration, or rediscovery operation, and the Qt UI
must not present any such control yet.
