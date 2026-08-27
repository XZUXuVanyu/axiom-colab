# Validation record

Date: 2026-08-17

## Actually executed in the delivery environment

Environment: Linux x86-64, Node.js v24.19.0, pnpm 11.19.0, g++ 13.3.0.
CMake and MSVC were not installed. The Windows `D:` drive was not mounted.

| Check | Actual result |
|---|---:|
| TypeScript build (`node proj/scripts/build.mjs`) | passed |
| Built Plugin import/exports/Standard Schema config | passed |
| TypeScript tests | 9/9 passed |
| C++ Debug-like build (`-O0 -g -Werror`) | passed |
| C++ tests, Debug-like | 14/14 passed |
| C++ Release build (`-O3 -DNDEBUG -Werror`) | passed |
| C++ tests, Release | 14/14 passed |
| Real Bridge integration, Debug-like | 1/1 passed |
| Real Bridge integration, Release | 1/1 passed |
| Release `--describe-tools` | protocol 1.0; exactly 2 Tools |
| Real `expression_patch` process call | passed; `( x + y ) * 2` → `(x+y)*2` |
| Real `calculate_uncertainty` process call | passed; value 6, combined 0.5, expanded 1 |
| Observer assertion | exactly two `[cpp-tool:success]` entries |
| Patch YAML parse | passed |

The C++ suite covers automatic registration and descriptor enumeration,
topological order, dependency paths for missing/cyclic graphs, lifetime policy,
duplicate type/name, construction failure, both example classes, typed internal
dependency invocation, request/schema failures, malformed JSON, unknown Tool,
standard exception conversion, and invalid output conversion.

The TypeScript suite covers descriptor/schema/protocol validation, generic
dynamic registration, stderr capture, shell-free process execution, malformed
stdout, non-zero exit, timeout, cancellation, stdin/stdout/stderr limits, Tool
errors, runtime Skill registration, observer logs, and disposal without retained
Tools, Skills, or child processes.

## Not executed here

- Inspection of `D:\Harness\deepseek-harness` and
  `D:\Harness\tools\reply-plugins`; those paths were inaccessible.
- CMake generation with Visual Studio, MSVC Debug/Release builds, and `ctest` on
  Windows.
- Loading the overlay with the user's installed `dsh web --patch`.
- A live model-driven Tool Call in that Harness UI.

The Plugin-facing API was checked against the official Harness source pinned at
commit `47f943859bef60e4160492346772ded9b24f765a`, reported as approximately
`0.1.0-rc.5`. The remaining Windows checks are automated by
`proj/scripts/build-and-test.ps1`; UI/model verification necessarily requires the
user's Harness checkout, configuration, credentials, and model session.
