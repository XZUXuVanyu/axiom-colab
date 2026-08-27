# Axiom CoLab Agent Operating Contract

These instructions apply to the entire repository. Repository files are the
source of truth; conversation history is optional context.

## Product identity

The project is named **Axiom CoLab**.

Axiom CoLab is a user-owned laboratory in which an LLM can reason, use typed
deterministic tools, share structured memory with those tools, inspect evidence,
and propose new tools while important trust and authority transitions remain
visible and user-controlled.

The long-term interface may resemble a three-dimensional laboratory. The first
minimum product is an IDE-style desktop application backed by UI-independent
protocols and services.

## Required startup sequence

Before planning changes or changing code:

1. Read this file completely.
2. Read `for-agent/HANDOFF.md` completely.
3. Read the durable context and operating contracts in both reference projects:
   - `D:\Dev\tools\general-ts-cpp-adapter`
   - `D:\Dev\tools\general-agent-memory`
4. Inspect files and tests directly relevant to the requested work.
5. Verify repository and working-tree state before copying or modifying files.

Update `for-agent/HANDOFF.md` whenever work changes the current state, verified
facts, accepted design, or exact next action.

## Source-project preservation rule

The existing projects are reference sources and must remain untouched:

- `D:\Dev\tools\general-ts-cpp-adapter`
- `D:\Dev\tools\general-agent-memory`

Do not edit, delete, move, reset, clean, commit, or otherwise mutate either
reference repository while working on Axiom CoLab. Copy needed code into this
repository and make all adaptations here. Preserve attribution and relevant Git
history or provenance where practical. Never assume uncommitted reference-tree
content is disposable.

## Core product model

- The user owns every workspace and is the final approval authority.
- The model is the researcher: it plans, interprets, proposes, and coordinates.
- The adapter is the instrument interface: it exposes typed C++ capabilities to
  an LLM without per-tool TypeScript behavior.
- The memory system is the controlled laboratory: it owns structured state,
  integrity, quotas, provenance, recovery, and access control.
- The tool workshop or meta-tool is the workshop: it creates and tests candidate
  tools but cannot trust or install them by itself.
- Deterministic services, not model assertions, record execution and validation
  evidence.

The intended improvement loop is:

```text
reason -> act -> observe -> remember -> verify -> improve
```

## Trust model

Keep these concepts distinct in protocols, storage, code, and UI:

```text
model claim != observed tool result != validated evidence != user approval
```

The model may freely create hypotheses, experiments, candidate code, and
interpretations inside its granted sandbox. Nothing becomes trusted, durable
policy, an installed tool, or approved working state merely because the model
says it is correct.

Actions capable of making results appear more reliable than they are require
independent inspection and attribution. In particular:

- A model cannot author or alter an authoritative validation record.
- A validation record binds the exact candidate, inputs, tests, toolchain,
  policy, and observed results by identity or content hash.
- Changing temporary values is allowed for experimentation, but original
  values, transformations, and validation snapshots must remain attributable.
- A later mutation cannot retroactively change an earlier validation run.
- Failed and rejected candidates remain distinguishable from approved ones.
- Approval binds the exact proposal or candidate hash and cannot be replayed
  for modified content.
- Memory contents, model-written strings, and model tool arguments never count
  as user approval.

## Memory authority invariants

Semantic memory classes are independent of physical storage tiers.

1. **Compute memory** is temporary, bounded, model-readable/model-writable, and
   disposable. It may hold intermediate values but is never the only
   authoritative copy of important state.
2. **Working memory** records goals, plans, decisions, progress, hypotheses, and
   unresolved questions. The model may read and propose revisions; committed
   changes require appropriate approval.
3. **Artifact memory** contains immutable inputs, rules, results, validation
   records, reports, and provenance. Existing artifacts are never rewritten;
   trusted tools or services create validated derivations.

Models and tools receive opaque, scoped capabilities and logical typed handles,
never unrestricted paths, raw pointers, device identifiers, storage
credentials, or ambient access to an entire workspace.

## Runtime and goal-closure policy

During a goal, retain everything relevant to the current goal in recoverable
workspace state: target, constraints, approved plan, observations, tool calls,
temporary calculations, hypotheses, failures, rejected approaches, pending
decisions, and resulting artifacts.

Do not rely on a graceful quit event. Checkpoint recoverable state throughout
execution. At goal closure, the model proposes a distillation into:

- experience, including uncertainty and linked evidence;
- reusable knowledge supported by artifacts;
- skill candidates that require review before activation;
- tool candidates or references that require validation and approval;
- unresolved questions and cleanup proposals;
- an immutable or retention-controlled session archive.

Distillation is a proposal, not an automatic promotion of model opinion into
trusted knowledge, active skills, or installed tools.

## Adapter and memory integration boundary

The adapter and memory service are complementary subsystems, not hard-coupled
cores.

- Keep the memory service provider-, UI-, and adapter-independent.
- Keep the adapter usable by tools that do not need memory.
- Integrate through a small typed C++ memory client and the adapter's internal
  dependency-injection mechanism.
- A tool that declares `MemoryClient` receives a call-scoped memory session;
  it does not gain ambient workspace authority.
- Trusted invocation context is host-supplied and separate from model-authored
  tool arguments.
- Bind memory operations to workspace, actor, tool identity/version, call ID,
  permissions, quotas, and expiry.
- Because the adapter uses process-per-call execution, authoritative shared
  memory belongs to a separate persistent service, not a Bridge singleton.

## Tool creation and validation policy

Creating a tool is not the same as trusting or installing it. Use a staged
workflow:

```text
missing capability
-> structured specification
-> candidate source revision
-> descriptor inspection
-> isolated build
-> candidate-authored tests
-> standard safety tests
-> hidden user challenge tests
-> validation record
-> exact-hash installation proposal
-> user approval
-> registration and discovery
```

The model may generate and revise candidates. It cannot install them, approve
them, broaden their authority, fabricate test execution, or mark them trusted.
Candidate revisions and validation runs are immutable and attributable.

Testing supports three independent sets:

- candidate tests written during development;
- standard correctness and safety tests owned by the laboratory;
- user challenge tests kept separate from the model and candidate until run.

Do not reveal hidden test inputs by default. The user controls whether detailed
failures or fixtures are disclosed after execution.

## Minimum product boundary

The first launch targets one user on one local machine, with multiple isolated
workspaces, process-per-tool-call execution, an IDE-style Qt interface,
restart-safe structured memory, scoped C++ tool access, independent validation,
hidden user tests, explicit approvals, tool-candidate generation, and complete
inspectable provenance.

Initially defer:

- direct VRAM management;
- distributed or cloud workspaces;
- arbitrary dependency downloads and unrestricted networking;
- automatic tool installation or policy modification;
- multiple autonomous cooperating agents;
- automatic semantic-memory consolidation;
- a polished three-dimensional client.

The later 3D laboratory must be another projection of the same protocols and
domain state, not a separate authority or memory implementation.

## Engineering discipline

- Keep public contracts independent of an LLM provider and UI.
- Prefer immutable derivation over shared mutable state.
- Keep diagnostics separate from machine-readable protocol output.
- Enforce authorization and validation at service boundaries, not only in UI.
- Tests accompany every behavior change.
- Add adversarial tests for capability forgery, stale approval, cross-workspace
  access, fabricated validation, changed candidates, partial writes,
  corruption, quota exhaustion, and misleading input manipulation.
- Do not claim validation passed unless the exact command was actually run.
- Do not commit build products, dependencies, logs, secrets, machine-local
  configuration, memory payloads, or user workspaces unless an explicit
  repository rule identifies a required generated runtime artifact.

## Commit and handoff discipline

Use `type(scope): imperative summary` for logical commits. Allowed types are
`feat`, `fix`, `refactor`, `test`, `docs`, `build`, and `chore`.

Each logical commit must:

1. describe one coherent change;
2. update `for-agent/HANDOFF.md` to the post-change state;
3. record architectural changes durably before relying on them;
4. state validation that actually ran and retain material failure information;
5. preserve unrelated user work.

