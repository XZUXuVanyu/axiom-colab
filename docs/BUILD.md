# Building Axiom V1 (F014, T01)

Two entry points produce the same binaries from the same sources: Visual Studio
and the command line. Both use the presets in `CMakePresets.json`; neither
downloads anything.

## 1. Prerequisites on this machine

| Tool | Required | Where it is here | On PATH? |
| --- | --- | --- | --- |
| MSVC compiler | `cl.exe` for x64, **14.44** (spec baseline / Qt ABI) | `E:\Microsoft Visual Studio\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64\cl.exe` (19.44.35228) | only inside the x64 Native Tools environment |
| MSVC compiler (alt) | 14.51 | `C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Tools\MSVC\14.51.36231` | same |
| CMake | 3.25 or newer | `C:\Program Files (x86)\...\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe` (4.3.1-msvc1) | **no** |
| Ninja | any 1.11+ | `C:\Program Files (x86)\...\CommonExtensions\Microsoft\CMake\Ninja\ninja.exe` (1.13.2) | **no** |
| Qt | 6.11.2 MSVC x64 (Core/Network/Gui/Widgets) | `C:\Qt\6.11.2\msvc2022_64` | via `CMAKE_PREFIX_PATH` |
| Windows SDK | 10.0.26100.0 | `C:\Program Files (x86)\Windows Kits\10` | inside the VS environment |
| VS IDE (F5) | VS Insiders 2026 | `E:\Microsoft Visual Studio\Common7\IDE\devenv.exe` (18.10.12120.281, built by: insiders) | n/a |

Exact versions and SHA-256 digests: `implementation/toolchain.json`.

Because `cmake` and `ninja` are not on the machine PATH, either add
`...\CMake\bin` and `...\CMake\Ninja` to PATH, or call CMake by full path. The
compiler is only visible inside the x64 Native Tools environment, so every
command below starts from that environment.

## 2. Command-line build (the gate entry point)

```powershell
# Debug: enter the x64 Native Tools environment with the frozen 14.44 toolset
cmd /c "E:\Microsoft Visual Studio\VC\Auxiliary\Build\vcvars64.bat -vcvars_ver=14.44 && cd /d D:\axiom-colab && cmake --preset win-debug && cmake --build --preset win-debug && ctest --preset win-debug --output-on-failure"

# Release: warnings-as-errors, needs Qt on CMAKE_PREFIX_PATH
cmd /c "set CMAKE_PREFIX_PATH=C:/Qt/6.11.2/msvc2022_64 && E:\Microsoft Visual Studio\VC\Auxiliary\Build\vcvars64.bat -vcvars_ver=14.44 && cd /d D:\axiom-colab && cmake --preset win-release && cmake --build --preset win-release && ctest --preset win-release --output-on-failure"
```

`build/win-debug` and `build/win-release` are completely separate trees;
`dist/win-release` is reserved for installed output (`cmake --install`).

## 3. Visual Studio

`CMakePresets.json` is the only build definition. In **VS Insiders 2026**
(`E:\Microsoft Visual Studio\Common7\IDE\devenv.exe`):

1. **File > Open > Folder** and select `D:\axiom-colab` (VS reads
   `CMakePresets.json` directly; no `.sln` is generated or committed).
2. Select the configuration **win-debug** (or **win-release**) in the toolbar.
3. Choose an executable target (for example `axiom_build_contract_tests`) as the
   startup item and press **F5** to debug, or Ctrl+F5 to run without debugging.

**Status: awaiting_user.** The IDE is installed and reachable, but nobody has yet
pressed F5 in it. Record the IDE version and what you observed when you do. A green
command-line build is not evidence that F5 works.
It must be performed by the user on a machine with the VS IDE and recorded with
the IDE version. A green command-line build is not evidence that F5 works.

Qt location for VS: create `CMakeUserPresets.json` (machine-local, git-ignored)
next to `CMakePresets.json`:

```json
{
  "version": 6,
  "configurePresets": [
    {
      "name": "win-debug-local",
      "inherits": "win-debug",
      "cacheVariables": { "CMAKE_PREFIX_PATH": "C:/Qt/6.11.2/msvc2022_64" }
    }
  ]
}
```

Never commit a machine-local path into the shared presets (specs/03).

## 4. Dependencies: offline by contract

`deps/lock.json` pins every third-party artefact by SHA-256 and
`deps/sources/<name>` holds the extracted bytes. Configure fails if a
dependency is missing or its marker does not match the lock, so a normal build
never touches the network.

To populate the cache on a networked machine (user-authorised, outside the
sandbox):

```powershell
cmake --preset win-debug -DAXIOM_ENABLE_BOOTSTRAP=ON
cmake --build --preset win-debug --target axiom-bootstrap
```

`tools/bootstrap-deps.ps1` downloads only the locked URLs, verifies each digest,
and writes a `.axiom-lock-verified` marker. A mismatch aborts; no alternative
version is substituted.

## 5. What a green build does and does not mean

T01 delivers the build system and its gate. The 12 Axiom components are **not
implemented**; their targets are reported as pending at configure time and are
never counted as passing tests. A passing `ctest` run at this stage proves the
toolchain, the frozen options, the locked dependency versions, and the frozen
AXH1 golden vectors - nothing about product behaviour.
