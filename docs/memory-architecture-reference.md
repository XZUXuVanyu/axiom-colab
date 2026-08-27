# Memory architecture reference

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

