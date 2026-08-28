# Axiom CoLab

Axiom CoLab is a user-owned laboratory where an LLM can reason, invoke typed
deterministic C++ tools, share structured memory with those tools, inspect
evidence, and propose new tools while trust and approval transitions remain
visible and user-controlled.

The backend now includes the Stage 5 supervised goal loop, three C++-first
built-ins, restart-safe structured memory, and scoped process-per-call memory
integration. Its root validation entry points are:

```powershell
pnpm.cmd test

powershell.exe -ExecutionPolicy Bypass `
  -File .\proj\scripts\build-and-test.ps1
```

The optional Qt frontend is built by the CMake project when Qt 6 Widgets is
available. Memory, validation, and workshop services are intentionally not
implemented during Stage 0.

See `docs/built-in-tools-and-goals.md` for the built-in/fixture boundary and
minimal goal flow. Read `AGENTS.md` and `for-agent/HANDOFF.md` before changing
the project.
