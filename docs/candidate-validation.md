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

Without a durable repository, the runner recognizes authenticity only for a
deeply frozen record it issued in the current process. When configured with
`LocalCandidateRepository` and a host-issued validator credential, it
atomically stores the public snapshot/record plus the private captured
descriptor, source, fixture, policy, toolchain, and complete suite definitions.
The credential is persisted only as a SHA-256 digest bound to the validator
actor. After restart, an exact deserialized record is authentic only when the
repository contains the matching snapshot and record with valid content
bindings. Altered or merely record-shaped JSON is not authentic.

Authenticity and observed test success are still insufficient for promotion.
Every record explicitly binds confinement observations. The default direct
process runner records all five required controls—filesystem, descendant
processes, network, CPU, and memory—as unenforced, so promotion eligibility
fails closed even for an authentic passing record.

On Windows, a trusted host may instead inject `WslValidationBackend`. It invokes
the allowlisted absolute Linux executable as an argument vector, never through
a shell, inside Ubuntu on WSL2. Bubblewrap supplies fresh user, mount, PID,
network, IPC, UTS, and cgroup namespaces; exposes a read-only Linux runtime plus
only the staged candidate workspace; clears the ambient environment; and drops
the process to an unprivileged identity. A transient systemd service applies
memory, CPU-quota, task-count, runtime, and control-group descendant cleanup
limits. `prlimit` independently applies address-space, CPU-time, and process-
count ceilings inside that service.

The memory, CPU-quota, and task limits are required fields in the canonical
validation policy and therefore participate in the snapshot hash. The WSL
backend refuses relative Linux executables, unsafe working directories,
non-drive Windows staging paths, or a policy without resource limits. A record
names this backend and marks all five observations enforced only when the
trusted runner was explicitly composed with it; callers cannot promote by
changing record-shaped JSON because that invalidates its record hash and
repository identity.

## Hidden challenge boundary

Challenge commands are bound by an exact per-run salted SHA-256 commitment, but
their executable, arguments, stdin, salt, stdout, and stderr are not included in
the public snapshot or validation record. A fresh cryptographically random
32-byte salt prevents practical offline guessing of low-entropy challenge
inputs from the public commitment. The authenticated repository keeps the salt
only inside the private evidence payload and rechecks the commitment on write.
The public record exposes only command identity, commitment and output hashes,
byte counts, timing, and outcome. This keeps challenge inputs and detailed
output hidden by default while preserving attribution.

## Platform and composition limits

The direct runner deliberately remains available for portable development and
unit tests, but its records are non-promotable. The enforcing backend currently
targets Windows hosts with WSL2, Ubuntu 24.04, systemd, Bubblewrap, and cgroup
v2. It is not an ambient fallback: production validation must explicitly
compose the WSL backend and durable evidence repository with a validator
credential.

The backend records exact configured ceilings and observed command timing,
exit, signal, stream sizes, and hashes. It does not yet report sampled peak CPU
or resident-memory usage. Linux-native and other operating-system backends are
also not implemented. Installation and UI controls remain unavailable until
the Stage 7 exact proposal/approval/installation binding is implemented.
