# Built-in Tools and supervised goals

Stage 5 classifies Tool code by its link target and source boundary:

- `source/cpp/tools/` contains production trusted built-ins. The production
  Bridge discovers these C++ translation units without TypeScript Tool logic.
- `tests/cpp/memory_bridge_tool.cpp` is a fixture. It is linked only into
  `cpp-memory-test-bridge` and cannot appear in production discovery.

The initial built-ins are `add_numbers` (pure), `compute_buffer` (temporary
compute memory), and `derive_artifact` (immutable copy derivation with fixed
provenance behavior). Declaring `MemoryClient` only states a dependency. The
host must separately issue an exact Tool/call/workspace grant whose operations
cover the requested memory calls; otherwise the Bridge returns
`MEMORY_SESSION_REQUIRED`.

`GoalCoordinator` accepts a committed working-memory revision, verifies it is
still the current approved plan, executes its calls through the ordinary
Adapter, and seals a session-report artifact. The report binds the approved
plan revision and hash to actual ledger records, observations, and artifact IDs.
It does not approve plans or turn model text into evidence.

The minimal supervised sequence is:

1. A model proposes a `WorkingRevision<ApprovedGoalPlan>` value.
2. A user separately approves the exact proposal hash.
3. A trusted host supplies explicit per-Tool memory policy and a report-writing
   invocation to `GoalCoordinator.run`.
4. The coordinator executes calls sequentially and creates an immutable report
   artifact after all calls succeed.

The coordinator is provider- and UI-independent. A later IDE can display the
same working revision, invocation ledger, observations, artifact lineage, and
report bytes without becoming an authority source.
