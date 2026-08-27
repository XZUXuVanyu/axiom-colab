# Runtime architecture

The default and only Stage 5 transport is one Bridge process per call. It gives
each invocation independent memory, timeout, cancellation, and forced
termination boundaries. C++ singleton dependencies therefore live for one
Bridge process (discovery or one call); Tool objects and call arguments are
per-call. A resident process was not added because it would require a framed,
multi-request protocol plus worker health/restart semantics, while the measured
startup cost is small relative to expected LLM latency and ordinary native Tool
workloads.

Run `pnpm benchmark -- [bridge] [iterations]` to measure full process discovery
and invocation latency. The script emits machine-readable JSON with mean,
median, p95, minimum, and maximum timings. Re-run it on deployment hardware
before choosing a different transport.

On 2026-08-26, 30 Release Bridge samples on the current Windows development
machine measured discovery at 20.00 ms mean / 22.19 ms p95 and invocation at
19.63 ms mean / 21.33 ms p95. These are end-to-end process timings, not just C++
execution. They support keeping process-per-call as the default for this stage.

The adapter admits four calls and queues 32 by default. `maxConcurrentCalls`
and `maxQueuedCalls` configure these bounds. Overflow fails with
`BACKPRESSURE`; queued cancellation fails with `CANCELLED`. Startup discovery
is the process-per-call health check, while every call retains existing timeout,
byte limits, stderr diagnostics, call-ID checks, graceful termination, and
forced termination.

`InvocationLedger` records attempted calls by unique call ID as running,
succeeded, failed, or rejected. Snapshots are copies. Its generic `verify()`
policy can constrain permitted Tool names, per-Tool minimum/maximum counts,
successful completion, and proof that both C++ validations completed. A normal
success proves both validations because the Bridge validates input before
execution and output before emitting success.
Harness-side automation can retrieve the context-owned ledger with
`getInvocationLedger(ctx)`; disposal removes that association.

Harness rc.5 publishes authoritative `assistant/message` session events, but
ordinary event-listener failures are contained after publication. Cancellation
from that observer can prevent later Tool execution, yet cannot reject or erase
already-persisted prose. No authoritative `toolChoice: required` control is
exposed through the plugin Tool API. Consequently `verificationMode:
tool-only` enables call-ledger policy intent but does not claim no-prose
enforcement. Session export remains the evidence for prose behavior until
Harness exposes a pre-commit interceptor or request-level required-tool choice.

Adversarial tests cover an empty ledger (the observable equivalent of a
prose-only or wholly fabricated answer), missing, duplicate, and unexpected
calls, invalid argument shapes, C++ input/output validation failures, and
fabricated response call IDs. The adapter cannot distinguish ordinary prose
from prose that invents a result because prose is outside its observation
boundary. A required-call policy detects either case only when no matching real
call occurred; session export is required to reject additional prose.

## Scoped memory invocation

Stage 4 adds an optional host-created `trustedContext` beside the model-authored
`arguments`. The envelope binds protocol, workspace, actor, Tool identity and
version, call ID, session generation, and a memory grant. The TypeScript host
checks that the Tool and call identities match before spawning the Bridge; the
Bridge repeats the shape and identity checks before asking its configured
`MemorySessionFactory` to create a session.

`MemoryClient` is an external per-call dependency. Any Tool or internal
component that declares it is automatically constructed in a child dependency
scope for that invocation. Calls without such a dependency retain the existing
worker-singleton path, and a memory-dependent Tool invoked without a host-issued
session fails with `MEMORY_SESSION_REQUIRED`.

`MemorySessionProvider` is the host lifecycle boundary. It maps an explicitly
configured Tool policy to a fresh call-bound grant, places the complete grant,
opaque bearer token, and numeric-loopback endpoint in the trusted envelope, and
revokes the grant when the Adapter call ends. Cleanup runs for success, Tool
failure, cancellation, and timeout. Tools without a configured policy receive
no envelope and retain the memory-free path.

The Bridge's default `LoopbackMemorySessionFactory` parses the full envelope and
grant into the typed client. Its HTTP transport accepts only `127.0.0.1` or
`::1`, performs no DNS lookup, forwards one bounded JSON operation to the
authenticated service, and preserves structured service error codes. The
Bridge process remains the cancellation and timeout boundary: terminating it
also terminates an in-flight memory request, after which the host revokes the
grant.
