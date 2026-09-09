# Long-term context (Axiom V1)

This folder is the **durable context for any agent or human continuing Axiom V1**.
It replaces the legacy `for-agent/` handoff pattern with a structure that holds the
three things a successor needs and nothing else:

| File | Holds | Update when |
| --- | --- | --- |
| `RULES.md` | the governing rule set and the spec precedence order | a rule changes (owner decision or approved DCR) |
| `PROGRESS.md` | the single narrative of what is done, in progress, and blocked, with SHAs | the end of every task |
| `ERRORS.md` | every error encountered, its root cause, and its resolution | an error is hit or resolved |
| `DECISIONS.md` | index of owner decisions and approved DCRs, with approval sources | an owner decision or DCR approval is recorded |
| `DCR-*.md` | one design change request per file | a frozen clause must change |

Authoritative, machine-readable state stays in:
`implementation/progress.json` (task/gate state), `implementation/records/<TASK>.md`
(per-task evidence), `implementation/inventory.json` (machine/toolchain facts),
`implementation/toolchain.json` (toolchain fingerprint).

`implementation/specification/` is the read-only copy of the frozen specification;
it is never edited in place. Approved changes are recorded here and appended to the
specification as a new version.

## How to start work (short form)

1. Read `AGENTS.md` at the repository root, then `implementation/long-term/RULES.md`.
2. Read `PROGRESS.md`, the newest `records/<TASK>.md`, and `DECISIONS.md`.
3. Read the current task card in `implementation/specification/tasks/`.
4. Verify reality with git, file hashes and real commands — never trust a previous
   model's summary. Then implement exactly one task, serially.
