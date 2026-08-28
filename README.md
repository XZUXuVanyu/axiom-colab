# Axiom CoLab

Axiom CoLab is a user-owned laboratory where an LLM can reason, invoke typed
deterministic C++ tools, share structured memory with those tools, inspect
evidence, and propose new tools while trust and approval transitions remain
visible and user-controlled.

The backend now includes the Stage 5 supervised goal loop, three C++-first
built-ins, restart-safe structured memory, scoped process-per-call memory
integration, and the first Stage 6 candidate-validation contract and runner
slice. Stage 7 now includes a constrained workshop and restart-safe repository
for structured Tool specifications, immutable candidate revisions, and
authenticated validator evidence, plus an opt-in WSL2/Bubblewrap backend that
enforces filesystem, process, network, CPU, and memory isolation. Exact
candidate/validation/permission installation proposals and trusted-user
approvals now feed a trusted-host installation transition with immutable
evidence, content-addressed candidate bytes, and restart-safe rediscovery. Its root
validation entry points are:

```powershell
pnpm.cmd test

powershell.exe -ExecutionPolicy Bypass `
  -File .\proj\scripts\build-and-test.ps1
```

The optional Qt frontend is built by the CMake project when Qt 6 Widgets is
available. The default direct validator remains non-promotable; production must
explicitly compose the enforcing validator, durable repository, installation
root, and installed-Tool registry before exposing the workflow in the UI.

See `docs/built-in-tools-and-goals.md` for the built-in/fixture boundary and
minimal goal flow, and `docs/candidate-validation.md` for the current validation
boundary. `docs/tool-workshop.md` records the current workshop boundary. Read
`AGENTS.md` and `for-agent/HANDOFF.md` before changing the project.
