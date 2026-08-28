# Candidate validation

Stage 6 begins with a provider- and UI-independent contract in
`source/ts/candidate-validation.ts`. It keeps a candidate's claims separate
from validator-observed process evidence.

## Bound identities

Before any child process starts, the trusted runner copies mutable inputs and
creates a content-addressed snapshot binding:

- workspace and candidate identities;
- the complete descriptor hash;
- canonical relative source paths, sizes, and raw-byte SHA-256 hashes;
- fixture paths, sizes, and raw-byte hashes;
- the declared toolchain and target;
- the runner policy and process limits;
- one candidate-authored, one laboratory-standard, and one user-challenge
  suite definition hash.

The runner writes only the captured source and fixture bytes into a fresh
temporary directory. Later caller mutation therefore cannot change the bytes
executed under an earlier snapshot hash. Snapshot and record objects are
deeply frozen, and every validation record binds the exact snapshot hash.

## Observed evidence

Commands are started without a shell and only when their executable is on the
host policy allowlist. A passing result requires an observed zero exit code.
Candidate stdout is diagnostic text, never an authoritative result channel;
printing passing-looking JSON and exiting unsuccessfully produces a failed
record. Each observed command records its binding hash, exit or signal status,
deterministic error code, elapsed time, output byte counts, and output hashes.

Timeout and stdin/stdout/stderr limits produce a distinct `limited` outcome.
The overall record fails or is limited if any of the three independent suite
classes is not observed passing.

Without a durable repository, the runner recognizes promotion eligibility only
for a deeply frozen record it issued in the current process. When configured
with `LocalCandidateRepository` and a host-issued validator credential, it
atomically stores the public snapshot/record plus the private captured
descriptor, source, fixture, policy, toolchain, and complete suite definitions.
The credential is persisted only as a SHA-256 digest bound to the validator
actor. After restart, an exact deserialized record is eligible only when the
repository contains the matching passing snapshot and record with valid
content bindings. Altered or merely record-shaped JSON remains ineligible.

## Hidden challenge boundary

Challenge commands are bound by an exact definition hash, but their executable,
arguments, stdin, stdout, and stderr are not included in the public snapshot or
validation record. The public record exposes only command identity, binding and
output hashes, byte counts, timing, and outcome. This keeps challenge inputs
and detailed output hidden by default while preserving attribution.

## Limits of this first slice

This is not the Stage 6 exit gate. The current implementation enforces
shell-free top-level executable admission, canonical staged paths, command
count, wall-clock time, and stream byte limits. It does not yet provide an OS
sandbox that blocks ambient filesystem access, descendant processes, or
networking, and it does not enforce or measure CPU and memory ceilings.

Authenticated, restart-safe evidence storage is now available, but storage does
not prove that declared confinement ran. The next runner backend must add the
remaining OS controls without treating policy fields or model-authored JSON as
evidence that confinement occurred.
