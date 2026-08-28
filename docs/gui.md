# Qt supervisory and Tool-authoring GUI

The first Stage 8 read path is available in the **Laboratory** tab. It starts
the known local supervisory Node process, lists host-visible workspaces, and
renders read-only resource, Tool, candidate, and immutable timeline summaries.
Candidate rows keep model claims, validator outcomes, user decisions, and
verified installation state visibly separate. No approval, installation,
memory, or lifecycle mutation operation is present in this transport or view.

Create the explicit process config outside the authoritative state directory:

```powershell
powershell.exe -ExecutionPolicy Bypass `
  -File .\proj\scripts\new-supervisory-config.ps1 `
  -StateRoot D:\Axiom\state `
  -BridgePath D:\Dev\axiom-colab\build\windows\Release\cpp-tool-bridge.exe `
  -OutputPath D:\Axiom\config\supervisory.json
```

Then launch the GUI with
`cpp-adapter-gui.exe --supervisory-config D:\Axiom\config\supervisory.json`.
The Qt process receives projections only through `list-workspaces` and
workspace-level `inspect`; it does not open SQLite or installed directories.
Goal selection remains disabled until an authoritative approved-plan reader is
composed by the production host.

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
- invoke a Tool interactively.

Those features can be layered onto the same C++-authoritative workflow later.
Imported code must currently conform to the contract in
[tool-authoring.md](tool-authoring.md).
