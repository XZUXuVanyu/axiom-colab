# Qt supervisory and Tool-authoring GUI

The Stage 8 supervisory path is available in the **Laboratory** tab. It starts
the known local supervisory Node process, lists host-visible workspaces, and
enumerates only goals whose stored lifecycle binding still matches an exact
approved working-memory plan. Workspace and goal selectors render the approved
objective, revision identity, and hash beside host-projected resource, Tool,
candidate, and immutable timeline summaries.
Candidate rows keep model claims, validator outcomes, user decisions, and
verified installation state visibly separate. Selecting a candidate shows its
exact revision/descriptor/source hashes, source-file manifest, validation
snapshot and record hashes, toolchain and policy bindings, confinement facts,
and observed candidate/standard/challenge suite process outcomes. Hidden
challenge output remains redacted. A pending installation proposal shows its
exact proposal/candidate/validation hashes and requested permissions before
enabling explicit approve/reject buttons. The host supplies the configured
local user identity and delegates to the existing proposal service; Qt cannot
author an approval record. Installation remains absent. Host-projected stop,
resume, capability-revocation, and recovery controls delegate through the
restart-safe lifecycle service and refresh authoritative inspection. Stop and
resume bind the exact approved-plan revision/hash; revocation binds the exact
selection-scoped capability identity. The selected current candidate accepts private hidden-challenge JSON
containing base64 fixture bytes and allowlisted command definitions. Qt binds
the request to the displayed revision and candidate hash, clears the private
editor immediately after submission, and displays only validation hashes,
outcome, promotability, and salted suite commitments. It does not retain or
display fixture bytes, definitions, salts, or command output after completion.
A selected goal may execute an
Adapter-discovered pure built-in or a built-in covered by an explicit
`memoryToolPolicies` entry, using JSON object arguments. For a memory-dependent
call, the host starts a numeric-loopback-only memory service, issues a fresh
workspace/Tool/call-bound grant with the configured operations and quotas, and
revokes it when the Adapter call ends. The host seals the actual result in an
immutable session-report artifact and the view refreshes inspection.
An exact installed candidate is built only by the configured shell-free trusted
build profile. Its executable evidence is restart-safe and binds the workspace,
installation, candidate, descriptor, source manifest, and executable bytes.
Each loaded installed Tool receives a separate Adapter instance, and every call
report retains those hashes without exposing the executable path to Qt.

The selected current candidate can also be revised with a descriptor and
canonical-base64 source set. Qt binds the displayed parent revision/hash,
clears submitted source bytes immediately, delegates immutable creation to the
repository-backed Tool workshop, and refreshes inspection. The result identifies
the hash-chained child and explicitly warns that prior validation and proposal
bindings are stale; repository paths and direct storage mutation remain absent.

A workspace-level authoring form creates a structured Tool specification and
its initial immutable candidate in one host operation. It accepts the complete
specification, descriptor, and canonical-base64 source set, clears submitted
bytes immediately, and delegates both records to the repository-backed
workshop. The returned revision must be revision 1 with no parent and must bind
the exact returned specification identity and hash before Qt displays it.

Create the explicit process config outside the authoritative state directory:

```powershell
powershell.exe -ExecutionPolicy Bypass `
  -File .\proj\scripts\new-supervisory-config.ps1 `
  -StateRoot D:\Axiom\state `
  -BridgePath D:\Dev\axiom-colab\build\windows\Release\cpp-tool-bridge.exe `
  -ValidationStagingRoot D:\Axiom\validation-staging `
  -CMakePath 'C:\Program Files\CMake\bin\cmake.exe' `
  -OutputPath D:\Axiom\config\supervisory.json
```

The generated configuration also contains the required production validation
profile: exact toolchain identity, Ubuntu distribution, a non-overlapping
staging root, an absolute Linux executable allowlist, bounded process/resource
policy, candidate build commands, and laboratory-standard test commands. The
supervisory process rejects missing, unknown, duplicated, escaping, or
overlapping profile values before opening the production host. It also contains
the fixed host CMake build commands and expected candidate executable path;
candidate projects must produce a Release executable named for their public
Tool name.

Then launch the GUI with
`cpp-adapter-gui.exe --supervisory-config D:\Axiom\config\supervisory.json`.
The Qt process receives projections and constrained command results through
supervisory protocol `1.1`; it does not open SQLite or installed directories.
Malformed, stale, or cross-workspace goal/plan bindings fail closed instead of
being rendered.

## Tool authoring

`cpp-adapter-gui` is a thin desktop frontend for the existing C++-first
workflow. It does not own Tool schemas and does not generate descriptor or
execution code.

## Basic workflow

1. Select the adapter project directory. It must contain `CMakeLists.txt` and
   `proj/scripts/build-and-test.ps1`.
2. Drag a C++ source/header pair or folder onto the window, or use **Add files**
   and **Add folder**.
3. Select the DeepSeek Harness checkout, or leave that field empty to use
   `harnessRoot` from `proj/config/adapter.local.json`.
4. Choose **Import** to copy the files into `source/cpp/tools`, **Build & Check**
   to validate the current project, or **Import, Build & Check** for both.
5. Leave **Start Hub after successful import/build** selected for automatic Hub
   startup, or use the explicit **Start Hub** and **Stop Hub** buttons.
6. Follow build, descriptor-discovery, dependency-installation, and Hub output
   in the output panel.

Folders are scanned one level deep for `.cpp`, `.cc`, `.cxx`, `.h`, `.hpp`, and
`.hxx` files. Existing destination files are never silently overwritten: the
GUI asks before each replacement. Files already located in the selected
project's `source/cpp/tools` directory are left in place.

The build action starts the supported PowerShell workflow with
`-SkipHarnessInspection -SkipGuiBuild`. It leaves the currently running GUI
binary untouched, builds and tests the Bridge and C++ tests in Debug and Release,
builds and tests TypeScript, and asks each Bridge executable to describe its
registered Tools. Normal command-line builds still include the GUI. The Hub is
started through `proj/scripts/start-dsh.ps1`, which generates the overlay and
runs `pnpm install --frozen-lockfile` only when the Harness checkout has no
`node_modules` directory.

## Current boundary

This first GUI slice intentionally does not:

- generate `descriptor()` or `execute()` boilerplate;
- infer or register dependencies;
- recursively reproduce arbitrary source directory trees;
- edit CMake for external source trees;
- execute installed candidate Tools.

Those features can be layered onto the same C++-authoritative workflow later.
Imported code must currently conform to the contract in
[tool-authoring.md](tool-authoring.md).
