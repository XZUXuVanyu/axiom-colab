# Axiom CoLab

Axiom CoLab is a user-owned laboratory where an LLM can reason, invoke typed
deterministic C++ tools, share structured memory with those tools, inspect
evidence, and propose new tools while trust and approval transitions remain
visible and user-controlled.

Stage 0 preserves the imported adapter as the first executable baseline. Its
existing root entry points remain valid:

```powershell
pnpm.cmd test

powershell.exe -ExecutionPolicy Bypass `
  -File .\proj\scripts\build-and-test.ps1
```

The optional Qt frontend is built by the CMake project when Qt 6 Widgets is
available. Memory, validation, and workshop services are intentionally not
implemented during Stage 0.

Read `AGENTS.md` and `for-agent/HANDOFF.md` before changing the project.

