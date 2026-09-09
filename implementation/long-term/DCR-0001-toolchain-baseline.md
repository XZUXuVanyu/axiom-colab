# DCR-0001 — Toolchain baseline, repository path and IDE entry point

- Status: **approved** (owner, 2026-09-09)
- Raised by: implementation model (DSH coding agent), 2026-09-09
- Clauses affected: `specs/03-build-and-dependencies.md` 固定选择 table (IDE/ABI, CMake);
  `specs/15-delivery.md` 目录落地 (path); `specs/01-scope.md` REQ-01 (VS entry point)
- New specification version to record: `1.0.0` + this DCR (see `DECISIONS.md` D-002, D-003, D-004, D-006)

## 1. Conflict and evidence

| Clause says | Machine reality (measured) |
| --- | --- |
| VS 2022 17.14, MSVC v143 **14.44** series | No VS 2022 17.x. Two VS 2026 installs exist: Build Tools `18.9.12120.119` (C:) with MSVC **14.51.36231**; VS Insiders `18.10.12120.281` (E:) with MSVC **14.44.35207** *and* 14.51.36231 |
| CMake 4.1.3 | Only VS-bundled `cmake 4.3.1-msvc1` (both installs); no standalone CMake |
| Ninja = VS-bundled, version + hash recorded | `1.13.2`, sha256 `4a641b1a404e390cf869b79782fecea9bc6cd9e5d2e0f97163cf4582c93bc843` |
| Qt 6.11.2 MSVC x64 preinstalled | present at `C:\Qt\6.11.2\msvc2022_64`; built with MSVC **19.44.35227** |
| Repository at `D:\Dev\axiom-colab` | actually `D:\axiom-colab`; `D:\Dev` does not exist |
| VS 2022 CMake-open + F5 is the development entry | only Build Tools on C: (no IDE); VS Insiders IDE at `E:\Microsoft Visual Studio\Common7\IDE\devenv.exe` |

Additional measured facts:

```text
E:\Microsoft Visual Studio\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64\cl.exe  -> 19.44.35228.0
vcvars64.bat -vcvars_ver=14.44  -> cl 19.44.35228 for x64
cmake -S . -B build\probe-1444 -G Ninja (14.44) + build + ctest -> 115/115 built, 1/1 Passed, exit 0
```

## 2. Minimal revision proposed and approved

1. **IDE/ABI baseline becomes MSVC 14.44** (the frozen v143 series), taken from
   `E:\Microsoft Visual Studio` via `vcvars64.bat -vcvars_ver=14.44`.
   Rationale: it is both the `specs/03` baseline *and* ABI-identical to the Qt 6.11.2
   binaries, removing the 19.51/19.44 mismatch. MSVC 14.51 remains available and is
   recorded, but is **not** the V1 build toolchain.
2. **CMake 4.3.1-msvc1** replaces 4.1.3 (no 4.1.3 install exists; installing another
   version was not authorised). Ninja stays the VS-bundled 1.13.2 with its hash pinned.
3. **Repository path is `D:\axiom-colab`**; the specification text is not rewritten —
   this DCR is the record.
4. **VS entry point is VS Insiders 2026** (`E:\Microsoft Visual Studio`). The F5
   observation is still `awaiting_user` until the user performs it.
5. `implementation/toolchain.json` carries the fingerprint
   `5c57fb574985d6e575037d4146390b958e92460577cd173a1e411d65a487e211`.

## 3. Affected files / tests

- `implementation/toolchain.json`, `docs/BUILD.md`, `implementation/inventory.json`
- `CMakePresets.json` (preset environment note), `cmake/Warnings.cmake` (unchanged options)
- Gate G01 (re-run under 14.44), G02 and later build/validate gates

## 4. Alternative and cost

Installing VS 2022 17.14 + CMake 4.1.3 would match the text literally but requires
downloading and installing two large toolchains on the owner's machine, which `AGENTS.md`
rule 15 forbids the model from doing unauthorised, and would still leave the Qt ABI
question open (Qt is built with 19.44). Chosen alternative: use the installed 14.44
toolset — zero install, baseline-matching ABI.

## 5. Approval

Owner instruction, verbatim, 2026-09-09:

```text
1. Approve switch version
2. Installed Qt at C:Qt, verify it
4. keep D:\axiom-colab at local machine, the important thing is the consistency in remote repo
3. I have Visual Studio insiders 2026 under E:\Microsoft Visual Studio, use this
```

Recorded by the implementation model; the model did not author the approval.
