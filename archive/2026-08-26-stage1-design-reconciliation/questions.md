# Questions Before Stage 2

Stage 2 must not start until every question below is resolved and the Stage 1
exit criterion is recorded as satisfied (or a blocker is explicitly accepted).

## Q1 — Global naming rule

Which naming rule should be authoritative across this repository?

Recommended rule:

- Product/repository/package/plugin ID: `general-ts-cpp-adapter` (kebab-case).
- C++ namespace: `cpp_adapter`; C++ types: `PascalCase`; C++ functions,
  variables, and files: `snake_case`; macros: `SCREAMING_SNAKE_CASE`.
- TypeScript types/classes: `PascalCase`; functions, variables, object fields,
  and JSON protocol fields: `camelCase`; TypeScript files: `kebab-case`.
- Public model Tool names: `snake_case` verbs or verb phrases, for example
  `expression_patch` and `calculate_uncertainty`.
- Protocol error codes and environment variables: `SCREAMING_SNAKE_CASE`.
- CMake project identifier: `general_ts_cpp_adapter`; CMake target and binary
  names: kebab-case as currently used.
- Prose uses “C++-first TypeScript/C++ adapter”, “Bridge” for the executable
  protocol boundary, and “Tool” only for a public model-callable capability.

Choices:

1. Accept the recommended rule.
2. Use another rule (please specify the desired convention per language and
   for public Tool/JSON names).

Also confirm whether existing public names are frozen for compatibility, or
whether Stage 2 may rename them before a stable release.

## Q2 — Stage 1 live model verification

The automated build and test path passes. The remaining exit criterion requires
starting Harness and making one real model-driven call to each Tool while
checking `[cpp-tool:ready]`, `[cpp-tool:start]`, and `[cpp-tool:success]` logs.

Should I launch `scripts/start-dsh.ps1` and have you perform the two prompts in
the UI, or do you have a preferred non-interactive Harness/model invocation I
should use? The live call can consume configured model quota and depends on
credentials already available to the Harness checkout.

## Q3 — Scope of the Stage 1 documentation correction

`README.md` still presents obsolete `D:\Harness\...` example paths, while the
current checkout, overlay, scripts, and durable context use `D:\Dev\...`.

Recommended resolution: in Stage 1, correct the current-machine validation
instructions and recorded versions only. Leave fully path-independent launch
generation to Stage 4, where portability is explicitly scheduled.

Choose one:

1. Apply the recommended Stage 1 correction.
2. Keep README examples generic and document the current machine only in the
   Stage 1 validation record.
3. Pull path portability forward from Stage 4 (this changes the agreed stage
   boundary).

## Current Stage 1 evidence

- Initial Git status: clean on `main` at `6c5fad6`.
- Harness inspection: `0.1.0-rc.5`; Tool and Skill APIs passed inspection.
- Windows: `10.0.26200.0`; Windows SDK selected: `10.0.26100.0`.
- PowerShell: `5.1.26100.9168`.
- Visual Studio Build Tools: `18.9.0`; MSBuild: `18.9.1`; MSVC:
  `19.51.36256.0`.
- Node.js: `24.19.0`; pnpm: `11.24.0`; CMake/CTest: `4.3.4`; Git: `2.55.0`.
- Debug and Release builds passed.
- Debug and Release C++ tests passed.
- TypeScript build and all 10 TypeScript tests passed.
- Debug and Release real-Bridge integration tests passed, including discovery
  and direct calls to both C++ Tools.
- Live Harness registration and model-driven calls: pending Q2.

The first in-sandbox build attempt failed because MSBuild FileTracker received
`E_ACCESSDENIED`; rerunning the same command outside the restricted sandbox
passed. This is an execution-sandbox constraint, not a reproduced failure in a
normal PowerShell environment.
