# Memory architecture reference

## Stage 2 local storage decision

The first local foundation uses Node 24's built-in `node:sqlite` `DatabaseSync`
API for authoritative metadata and ordinary files for immutable payload bytes.
This remains an implementation detail behind the public laboratory contract;
identities and envelopes expose neither database row identifiers nor paths.

Schema changes use ordered transactional migrations recorded by SQLite
`user_version`. Payloads are named by lowercase SHA-256, written exclusively to
a staging directory, flushed, and atomically promoted before metadata commits.
Startup removes abandoned staging and unreferenced promoted files, then checks
every referenced payload's size and hash. SQLite enables foreign keys, WAL,
`synchronous=FULL`, and immediate transactions for quota checks and promotion.

The Stage 2 API stores only workspace-scoped opaque payloads. Compute updates,
working approvals, and artifact derivation remain Stage 3 workflows.

This Stage 0 reference reconciles the useful architecture outline from
`general-agent-memory` under Axiom CoLab's governing contract. It is not an
implementation specification and does not supersede `AGENTS.md`.

```text
Agent or scoped Tool client
    |
    v
Versioned protocol validation
    |
    v
Capability and policy enforcement
    |
    +-- bounded compute operations
    +-- working-state proposals and approvals
    +-- trusted immutable artifact derivation
    |
    v
Transactional metadata + immutable payload storage
    |
    +-- optional RAM cache
    +-- optional VRAM cache (deferred)
    |
    v
Inspection, status, provenance, audit, and recovery
```

Semantic authority is independent of physical placement. Compute memory permits
bounded mutation; working memory separates proposals from committed revisions;
artifact memory uses immutable derivation. All are addressed through opaque,
scoped capabilities and safe typed metadata. The adapter integration boundary
is a small C++ client receiving a call-scoped session from trusted host context.
